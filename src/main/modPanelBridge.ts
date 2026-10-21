import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmod, mkdir, readFile, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { dirname } from 'node:path'

import {
  MOD_PANEL_MAX_BODY_BYTES,
  modPanelKey,
  normalizeModPanelAddress,
  sanitizeModPanelTree,
  type ModPanel,
  type ModPanelAddress,
  type ModPanelBridgeDiscovery,
  type ModPanelChange,
  type ModPanelEvent,
  type ModPanelPress,
} from '@shared/modPanels'
import { writeFileAtomic } from '../shared/atomicWrite'

export interface ModPanelBridgeOptions {
  discoveryFile: string
  onChange?: (change: ModPanelChange) => void
  now?: () => number
  maxWaitMs?: number
}

interface ModPanelWaiter {
  response: ServerResponse
  timer: NodeJS.Timeout
}

const DEFAULT_MAX_WAIT_MS = 20_000
const MAX_PANELS = 200
const MAX_TITLE_LENGTH = 120
const MAX_EVENTS_PER_TILE = 100

function sendJson(response: ServerResponse, status: number, body: unknown = {}): void {
  if (response.writableEnded || response.destroyed) return
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  })
  response.end(text)
}

function hasExpectedBearerToken(value: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`)
  const received = Buffer.from(value ?? '')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pairKey(tileId: string, plugin: string): string {
  return `${tileId}\n${plugin}`
}

function readIdentifier(value: string | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseWait(value: string | null, maxWaitMs: number): number {
  if (value === null || value.trim() === '') return maxWaitMs
  const wait = Number(value)
  if (!Number.isFinite(wait) || wait < 0) return maxWaitMs
  return Math.min(Math.floor(wait), maxWaitMs)
}

function readJsonRequest(
  request: IncomingMessage,
  response: ServerResponse,
  handle: (body: Record<string, unknown>) => void,
): void {
  let size = 0
  const chunks: Buffer[] = []
  request.on('data', (chunk: Buffer) => {
    size += chunk.length
    if (size <= MOD_PANEL_MAX_BODY_BYTES) chunks.push(chunk)
  })
  request.on('end', () => {
    if (size > MOD_PANEL_MAX_BODY_BYTES) {
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
    if (!isRecord(parsed)) {
      sendJson(response, 400)
      return
    }
    handle(parsed)
  })
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

/**
 * Loopback HTTP bridge that lets Claude Code mods publish panels and receive
 * button presses back. Only sanitized panel trees cross the boundary.
 */
export class ModPanelBridge {
  private readonly discoveryFile: string

  private readonly onChange?: (change: ModPanelChange) => void

  private readonly now: () => number

  private readonly maxWaitMs: number

  private readonly token = randomBytes(32).toString('hex')

  private readonly panels = new Map<string, ModPanel>()

  private readonly queues = new Map<string, ModPanelEvent[]>()

  private readonly waiters = new Map<string, ModPanelWaiter>()

  private server: Server | null = null

  private discovery: ModPanelBridgeDiscovery | null = null

  private starting: Promise<ModPanelBridgeDiscovery> | null = null

  constructor(options: ModPanelBridgeOptions) {
    this.discoveryFile = options.discoveryFile
    this.onChange = options.onChange
    this.now = options.now ?? Date.now
    this.maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
  }

  start(): Promise<ModPanelBridgeDiscovery> {
    if (this.discovery) return Promise.resolve({ ...this.discovery })
    if (this.starting) return this.starting
    this.starting = this.startServer().finally(() => {
      this.starting = null
    })
    return this.starting
  }

  listPanels(): ModPanel[] {
    return [...this.panels.values()].sort((left, right) => left.updatedAt - right.updatedAt)
  }

  press(press: ModPanelPress): boolean {
    if (!this.panels.has(modPanelKey(press))) return false
    this.enqueue(pairKey(press.tileId, press.plugin), { kind: 'press', id: press.id, key: press.key })
    return true
  }

  async close(): Promise<void> {
    for (const key of [...this.waiters.keys()]) this.finishWaiter(key, [])
    this.queues.clear()

    const server = this.server
    this.server = null
    const discovery = this.discovery
    this.discovery = null

    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      })
    }

    if (discovery) await this.removeDiscoveryFile()
  }

  private async startServer(): Promise<ModPanelBridgeDiscovery> {
    const server = createServer((request, response) => this.handleRequest(request, response))
    this.server = server

    try {
      await listen(server)
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Mod panel bridge did not receive a loopback port')
      }

      const discovery: ModPanelBridgeDiscovery = {
        url: `http://127.0.0.1:${address.port}`,
        token: this.token,
        pid: process.pid,
      }
      await mkdir(dirname(this.discoveryFile), { recursive: true })
      await writeFileAtomic(this.discoveryFile, JSON.stringify(discovery, null, 2))
      // Windows ignores POSIX modes; the token still gates the bridge.
      await chmod(this.discoveryFile, 0o600).catch(() => undefined)
      this.discovery = discovery
      return { ...discovery }
    } catch (error) {
      await this.close()
      throw error
    }
  }

  private handleRequest(request: IncomingMessage, response: ServerResponse): void {
    let url: URL
    try {
      url = new URL(request.url ?? '/', 'http://127.0.0.1')
    } catch {
      sendJson(response, 400)
      return
    }

    if (!hasExpectedBearerToken(request.headers.authorization, this.token)) {
      sendJson(response, 401)
      return
    }

    if (url.pathname === '/panels') {
      if (request.method !== 'POST') {
        sendJson(response, 405)
        return
      }
      this.handlePublish(request, response)
      return
    }

    if (url.pathname === '/panels/close') {
      if (request.method !== 'POST') {
        sendJson(response, 405)
        return
      }
      this.handleClose(request, response)
      return
    }

    if (url.pathname === '/events') {
      if (request.method !== 'GET') {
        sendJson(response, 405)
        return
      }
      this.handleEvents(response, url)
      return
    }

    sendJson(response, 404)
  }

  private handlePublish(request: IncomingMessage, response: ServerResponse): void {
    readJsonRequest(request, response, (body) => {
      const address = normalizeModPanelAddress(body)
      if (!address) {
        sendJson(response, 400)
        return
      }

      const tree = sanitizeModPanelTree(body.tree)
      if (!tree) {
        sendJson(response, 400)
        return
      }

      const key = modPanelKey(address)
      if (!this.panels.has(key) && this.panels.size >= MAX_PANELS) {
        sendJson(response, 429)
        return
      }

      const title = typeof body.title === 'string'
        ? body.title.trim().slice(0, MAX_TITLE_LENGTH)
        : ''
      const panel: ModPanel = {
        ...address,
        title: title || address.id,
        tree,
        updatedAt: this.now(),
      }
      this.panels.set(key, panel)
      this.emit({ type: 'upsert', panel })
      sendJson(response, 202)
    })
  }

  private handleClose(request: IncomingMessage, response: ServerResponse): void {
    readJsonRequest(request, response, (body) => {
      const address = normalizeModPanelAddress(body)
      if (!address) {
        sendJson(response, 400)
        return
      }

      if (this.panels.delete(modPanelKey(address))) {
        this.emit({ type: 'close', address })
      }
      sendJson(response, 202)
    })
  }

  private handleEvents(response: ServerResponse, url: URL): void {
    const tileId = readIdentifier(url.searchParams.get('tileId'))
    const plugin = readIdentifier(url.searchParams.get('plugin'))
    if (!tileId || !plugin) {
      sendJson(response, 400)
      return
    }

    const key = pairKey(tileId, plugin)
    const wait = parseWait(url.searchParams.get('wait'), this.maxWaitMs)
    const queued = this.queues.get(key)
    if (queued && queued.length > 0) {
      this.queues.set(key, [])
      sendJson(response, 200, { events: queued })
      return
    }

    if (wait <= 0) {
      sendJson(response, 200, { events: [] })
      return
    }

    // A mod only needs one open long-poll per tile; a new one replaces the old.
    this.finishWaiter(key, [])
    const timer = setTimeout(() => this.finishWaiter(key, []), wait)
    this.waiters.set(key, { response, timer })
    response.on('close', () => {
      const waiter = this.waiters.get(key)
      if (waiter?.response !== response) return
      this.waiters.delete(key)
      clearTimeout(waiter.timer)
    })
  }

  private enqueue(key: string, event: ModPanelEvent): void {
    const queue = this.queues.get(key) ?? []
    queue.push(event)
    while (queue.length > MAX_EVENTS_PER_TILE) queue.shift()
    this.queues.set(key, queue)

    if (this.waiters.has(key)) {
      this.queues.set(key, [])
      this.finishWaiter(key, queue)
    }
  }

  private finishWaiter(key: string, events: ModPanelEvent[]): void {
    const waiter = this.waiters.get(key)
    if (!waiter) return
    this.waiters.delete(key)
    clearTimeout(waiter.timer)
    sendJson(waiter.response, 200, { events })
  }

  private emit(change: ModPanelChange): void {
    try {
      this.onChange?.(change)
    } catch {
      // A renderer listener must never break the mod's HTTP request.
    }
  }

  private async removeDiscoveryFile(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.discoveryFile, 'utf8'))
      if (!isRecord(parsed) || parsed.pid !== process.pid) return
      await rm(this.discoveryFile, { force: true })
    } catch {
      // A missing or unreadable discovery file is not ours to remove.
    }
  }
}
