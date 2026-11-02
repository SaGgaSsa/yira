import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { join } from 'node:path'

import { writeFileAtomic } from '@shared/atomicWrite'
import { botHasTool, type BotDefinition, type BotToolId } from '@shared/bots'

export interface BotSessionScope {
  workspaceId: string
  tileId: string
  botId: string
}

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface BotToolContext {
  scope: BotSessionScope
  bot: BotDefinition
}

export interface BotToolProvider {
  /** Grant that unlocks these tools. */
  grant: BotToolId
  definitions: McpToolDefinition[]
  /** Returns the text shown to the agent. Throw an Error with a user-readable message on failure. */
  call(name: string, args: Record<string, unknown>, context: BotToolContext): Promise<string>
}

export interface BotBridgeOptions {
  /** Yira home (YIRA_HOME in production). */
  homeDirectory: string
  getBot: (id: string) => Promise<BotDefinition | null>
  /** Can also be added later with setTools. */
  tools?: BotToolProvider[]
}

type JsonRpcId = string | number | null

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: unknown
  error?: { code: number; message: string }
}

const MAX_BODY_BYTES = 256 * 1024
const MAX_SCOPE_FIELD_LENGTH = 128
const SECRET_PATTERN = /^[0-9a-f]{64}$/
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const DEFAULT_PROTOCOL_VERSION = '2025-06-18'
const INSTRUCTIONS = 'Yira tools: search, read and open the user\'s agent sessions in Yira.'
const NOT_GRANTED_MESSAGE = 'This tool is not enabled for this bot.'

const RPC_INVALID_REQUEST = -32600
const RPC_METHOD_NOT_FOUND = -32601
const RPC_INVALID_PARAMS = -32602
const RPC_INTERNAL_ERROR = -32603
const RPC_BOT_GONE = -32001

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isScopeField(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_SCOPE_FIELD_LENGTH
    && !CONTROL_CHARACTERS.test(value)
}

function sendJson(response: ServerResponse, status: number, body = '{}'): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(body)
}

function rpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

function rpcError(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function toolText(text: string, isError = false): { content: { type: 'text'; text: string }[]; isError?: true } {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true as const } : {}) }
}

function readBody(request: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= MAX_BODY_BYTES) chunks.push(chunk)
    })
    request.on('end', () => resolve(size > MAX_BODY_BYTES ? null : Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

/**
 * Loopback MCP server that gives bot sessions access to Yira tools.
 * Tokens are signed with a secret kept in the Yira home, so they stay valid across restarts.
 */
export class BotBridge {
  private readonly homeDirectory: string

  private readonly getBot: (id: string) => Promise<BotDefinition | null>

  private tools: BotToolProvider[]

  private secret: string | null = null

  private server: Server | null = null

  private url: string | null = null

  constructor(options: BotBridgeOptions) {
    this.homeDirectory = options.homeDirectory
    this.getBot = options.getBot
    this.tools = options.tools ?? []
  }

  get discoveryFilePath(): string {
    return join(this.homeDirectory, 'bot-bridge.json')
  }

  private get secretFilePath(): string {
    return join(this.homeDirectory, 'bot-bridge.secret')
  }

  setTools(tools: BotToolProvider[]): void {
    this.tools = tools
  }

  async start(): Promise<{ url: string }> {
    if (this.url) return { url: this.url }
    this.getSecret()

    const server = createServer((request, response) => {
      void this.handleRequest(request, response).catch(() => {
        if (!response.headersSent) sendJson(response, 500)
        else response.end()
      })
    })
    this.server = server
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })

    const address = server.address()
    if (!address || typeof address === 'string') {
      await this.close()
      throw new Error('Bot bridge did not receive a loopback port')
    }
    this.url = `http://127.0.0.1:${address.port}/mcp`
    await writeFileAtomic(this.discoveryFilePath, JSON.stringify({ url: this.url, pid: process.pid }))
    return { url: this.url }
  }

  issueToken(scope: BotSessionScope): string {
    const payload = Buffer.from(JSON.stringify({
      workspaceId: scope.workspaceId,
      tileId: scope.tileId,
      botId: scope.botId,
    })).toString('base64url')
    return `${payload}.${this.sign(payload).toString('base64url')}`
  }

  verifyToken(token: string): BotSessionScope | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 2) return null
      const [payload, signature] = parts
      const received = Buffer.from(signature, 'base64url')
      const expected = this.sign(payload)
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null

      const scope: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      if (!isPlainObject(scope)) return null
      const { workspaceId, tileId, botId } = scope
      if (!isScopeField(workspaceId) || !isScopeField(tileId) || !isScopeField(botId)) return null
      return { workspaceId, tileId, botId }
    } catch {
      return null
    }
  }

  async close(): Promise<void> {
    const server = this.server
    const url = this.url
    this.server = null
    this.url = null
    if (url) await this.removeDiscoveryFileIfOurs(url)
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
      server.closeAllConnections()
    })
  }

  private sign(payload: string): Buffer {
    return createHmac('sha256', this.getSecret()).update(payload).digest()
  }

  /** Reads the secret, creating it when it is missing or malformed. */
  private getSecret(): string {
    if (this.secret) return this.secret
    let secret: string | null = null
    try {
      const stored = readFileSync(this.secretFilePath, 'utf8').trim()
      if (SECRET_PATTERN.test(stored)) secret = stored
    } catch {
      // Missing or unreadable: a new secret is created below.
    }
    if (!secret) {
      secret = randomBytes(32).toString('hex')
      mkdirSync(this.homeDirectory, { recursive: true })
      writeFileSync(this.secretFilePath, secret, { mode: 0o600 })
    }
    this.secret = secret
    return secret
  }

  private async removeDiscoveryFileIfOurs(url: string): Promise<void> {
    try {
      const stored: unknown = JSON.parse(await readFile(this.discoveryFilePath, 'utf8'))
      if (isPlainObject(stored) && stored.url === url) {
        await rm(this.discoveryFilePath, { force: true })
      }
    } catch {
      // No discovery file, or one that is not ours: nothing to remove.
    }
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.url !== '/mcp') return sendJson(response, 404)
    if (request.method !== 'POST') return sendJson(response, 405)

    const authorization = request.headers.authorization ?? ''
    const scope = authorization.startsWith('Bearer ')
      ? this.verifyToken(authorization.slice('Bearer '.length))
      : null
    if (!scope) return sendJson(response, 401)

    const body = await readBody(request)
    if (!body) return sendJson(response, 413)

    let message: unknown
    try {
      message = JSON.parse(body.toString('utf8'))
    } catch {
      return sendJson(response, 400)
    }

    if (!isPlainObject(message)) {
      return sendJson(response, 200, JSON.stringify(rpcError(null, RPC_INVALID_REQUEST, 'Expected one JSON-RPC object')))
    }
    if (message.id === undefined) {
      response.writeHead(202).end()
      return
    }
    const reply = await this.handleMessage(message, scope)
    sendJson(response, 200, JSON.stringify(reply))
  }

  private async handleMessage(message: Record<string, unknown>, scope: BotSessionScope): Promise<JsonRpcResponse> {
    const id = message.id as JsonRpcId
    const params = isPlainObject(message.params) ? message.params : {}
    try {
      switch (message.method) {
        case 'initialize':
          return rpcResult(id, {
            protocolVersion: params.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
            serverInfo: { name: 'yira', version: '1' },
            capabilities: { tools: {} },
            instructions: INSTRUCTIONS,
          })
        case 'ping':
          return rpcResult(id, {})
        case 'tools/list':
          return await this.listTools(id, scope)
        case 'tools/call':
          return await this.callTool(id, params, scope)
        default:
          return rpcError(id, RPC_METHOD_NOT_FOUND, 'Method not found')
      }
    } catch (error) {
      return rpcError(id, RPC_INTERNAL_ERROR, error instanceof Error ? error.message : 'Internal error')
    }
  }

  private async listTools(id: JsonRpcId, scope: BotSessionScope): Promise<JsonRpcResponse> {
    const bot = await this.getBot(scope.botId)
    if (!bot) return rpcError(id, RPC_BOT_GONE, 'Bot no longer exists')
    const tools = this.tools
      .filter((provider) => botHasTool(bot, provider.grant))
      .flatMap((provider) => provider.definitions)
    return rpcResult(id, { tools })
  }

  private async callTool(
    id: JsonRpcId,
    params: Record<string, unknown>,
    scope: BotSessionScope,
  ): Promise<JsonRpcResponse> {
    const name = params.name
    const args = params.arguments ?? {}
    if (typeof name !== 'string') return rpcError(id, RPC_INVALID_PARAMS, 'Tool name is required')
    if (!isPlainObject(args)) return rpcError(id, RPC_INVALID_PARAMS, 'Tool arguments must be an object')

    const provider = this.tools.find((candidate) => candidate.definitions.some((tool) => tool.name === name))
    if (!provider) return rpcError(id, RPC_INVALID_PARAMS, 'Unknown tool')

    const bot = await this.getBot(scope.botId)
    if (!bot) return rpcError(id, RPC_BOT_GONE, 'Bot no longer exists')
    if (!botHasTool(bot, provider.grant)) return rpcResult(id, toolText(NOT_GRANTED_MESSAGE, true))

    try {
      return rpcResult(id, toolText(await provider.call(name, args, { scope, bot })))
    } catch (error) {
      return rpcResult(id, toolText(error instanceof Error ? error.message : String(error), true))
    }
  }
}

let activeBotBridge: BotBridge | null = null

export function setActiveBotBridge(bridge: BotBridge | null): void {
  activeBotBridge = bridge
}

export function getActiveBotBridge(): BotBridge | null {
  return activeBotBridge
}
