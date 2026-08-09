import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server, type ServerResponse } from 'node:http'

import { normalizeAgentAlert, type AgentAlert } from './agentAlerts'

export interface AgentAlertBridgeEndpoint {
  url: string
  token: string
}

export interface AgentAlertBridgeOptions {
  onAlert?: (alert: AgentAlert) => void
}

export type AgentAlertLaunchEnvironment = Record<
  'YIRA_AGENT_BRIDGE_URL' | 'YIRA_AGENT_BRIDGE_TOKEN' | 'YIRA_AGENT_TILE_ID',
  string
>

const MAX_BODY_BYTES = 8 * 1024

function sendJson(response: ServerResponse, status: number): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end('{}')
}

function hasExpectedBearerToken(value: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`)
  const received = Buffer.from(value ?? '')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/**
 * Authenticated, in-process loopback bridge for semantic agent hooks.
 * It only accepts a minimal normalized envelope and does not inspect PTY data.
 */
export class AgentAlertBridge {
  private readonly localTerminalIds = new Set<string>()

  private readonly token = randomBytes(32).toString('hex')

  private readonly onAlert?: (alert: AgentAlert) => void

  private server: Server | null = null

  private endpoint: AgentAlertBridgeEndpoint | null = null

  constructor(options: AgentAlertBridgeOptions = {}) {
    this.onAlert = options.onAlert
  }

  async start(): Promise<AgentAlertBridgeEndpoint> {
    if (this.endpoint) return { ...this.endpoint }

    this.server = createServer((request, response) => {
      if (request.method !== 'POST') {
        sendJson(response, 405)
        return
      }
      if (request.url !== '/agent-alert') {
        sendJson(response, 404)
        return
      }
      if (!hasExpectedBearerToken(request.headers.authorization, this.token)) {
        sendJson(response, 401)
        return
      }

      let size = 0
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size <= MAX_BODY_BYTES) chunks.push(chunk)
      })
      request.on('end', () => {
        if (size > MAX_BODY_BYTES) {
          sendJson(response, 413)
          return
        }

        let parsed: unknown
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          sendJson(response, 400)
          return
        }

        const alert = normalizeAgentAlert(parsed)
        if (!alert) {
          sendJson(response, 400)
          return
        }
        if (!this.localTerminalIds.has(alert.tileId)) {
          sendJson(response, 404)
          return
        }

        try {
          this.onAlert?.(alert)
        } catch {
          // Hook delivery is best effort; never expose internal errors to the client.
        }
        sendJson(response, 202)
      })
    })

    await new Promise<void>((resolve, reject) => {
      const server = this.server
      if (!server) {
        reject(new Error('Agent alert bridge was not created'))
        return
      }
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })

    const address = this.server.address()
    if (!address || typeof address === 'string') {
      await this.close()
      throw new Error('Agent alert bridge did not receive a loopback port')
    }
    this.endpoint = {
      url: `http://127.0.0.1:${address.port}/agent-alert`,
      token: this.token,
    }
    return { ...this.endpoint }
  }

  registerLocalTerminal(tileId: string): AgentAlertLaunchEnvironment {
    this.localTerminalIds.add(tileId)
    const environment = this.getLaunchEnvironment(tileId)
    if (!environment) throw new Error('Agent alert bridge must start before registering terminals')
    return environment
  }

  registerRemoteTerminal(tileId: string): void {
    this.localTerminalIds.delete(tileId)
  }

  unregisterTerminal(tileId: string): void {
    this.localTerminalIds.delete(tileId)
  }

  getLaunchEnvironment(tileId: string): AgentAlertLaunchEnvironment | null {
    if (!this.endpoint || !this.localTerminalIds.has(tileId)) return null
    return {
      YIRA_AGENT_BRIDGE_URL: this.endpoint.url,
      YIRA_AGENT_BRIDGE_TOKEN: this.endpoint.token,
      YIRA_AGENT_TILE_ID: tileId,
    }
  }

  async close(): Promise<void> {
    this.localTerminalIds.clear()
    this.endpoint = null
    const server = this.server
    this.server = null
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}
