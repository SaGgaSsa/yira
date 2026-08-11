import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'

import type {
  AgentProvider,
  AgentUsageProviderSnapshot,
  AgentUsageSnapshot,
  AgentUsageWindow,
  AgentUsageWindowKind,
} from '@shared/types'

const CODEX_RATE_LIMITS_UPDATED = 'account/rateLimits/updated'
const CODEX_RATE_LIMITS_READ = 'account/rateLimits/read'
const DEFAULT_REFRESH_INTERVAL_MS = 60_000
const FIVE_HOUR_MINUTES = 300
const WEEKLY_MINUTES = 10_080
const WINDOW_KINDS: readonly AgentUsageWindowKind[] = ['fiveHour', 'weekly']

type RecordValue = Record<string, unknown>

export interface CodexAppServerNotification {
  method: string
  params?: unknown
}

/** Minimal app-server surface used by the usage service and its unit tests. */
export interface CodexAppServerClient {
  request<T = unknown>(method: string, params?: unknown): Promise<T>
  onNotification(listener: (notification: CodexAppServerNotification) => void): () => void
  close(): Promise<void> | void
}

export type CodexAppServerClientFactory = () => Promise<CodexAppServerClient> | CodexAppServerClient

export type AgentUsageProviderReader = () => Promise<unknown> | unknown

export interface AgentUsageServiceOptions {
  /** Return the selected provider for each configured workspace. */
  getConfiguredProviders: () => Iterable<AgentProvider> | Promise<Iterable<AgentProvider>>
  codexClientFactory?: CodexAppServerClientFactory
  /** Future providers can be supplied as already-sanitized snapshot readers. */
  providerReaders?: Partial<Record<AgentProvider, AgentUsageProviderReader>>
  now?: () => number
  refreshIntervalMs?: number
  setIntervalFn?: (callback: () => void, delayMs: number) => unknown
  clearIntervalFn?: (handle: unknown) => void
}

export type AgentUsageSnapshotSubscriber = (snapshot: AgentUsageSnapshot) => void

interface RawWindowState {
  durationMinutes?: number
  usedPercent?: number
  resetsAt?: string
}

interface RawRateLimitsState {
  primary?: RawWindowState
  secondary?: RawWindowState
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizePercent(value: unknown): number | null {
  const number = finiteNumber(value)
  return number !== null && number >= 0 && number <= 100 ? number : null
}

function normalizeTimestamp(value: unknown): string | null {
  let milliseconds: number
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null
    milliseconds = value > 100_000_000_000 ? value : value * 1000
  } else if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value.trim())
    milliseconds = parsed.valueOf()
  } else {
    return null
  }

  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null
  const date = new Date(milliseconds)
  return Number.isNaN(date.valueOf()) ? null : date.toISOString()
}

function normalizeDuration(value: unknown): number | null {
  const number = finiteNumber(value)
  return number === FIVE_HOUR_MINUTES || number === WEEKLY_MINUTES ? number : null
}

function firstField(record: RecordValue, names: readonly string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(record, name)) return record[name]
  }
  return undefined
}

function parseRawWindow(value: unknown): RawWindowState | null {
  if (!isRecord(value)) return {}
  const durationFields = [
    'windowDurationMins',
    'windowDurationMinutes',
    'window_duration_mins',
    'window_duration_minutes',
    'durationMins',
    'durationMinutes',
  ] as const
  const suppliedDuration = durationFields.some((name) => Object.prototype.hasOwnProperty.call(value, name))
  const durationMinutes = normalizeDuration(firstField(value, durationFields))
  if (suppliedDuration && durationMinutes === null) return null
  const usedPercent = normalizePercent(firstField(value, [
    'usedPercent',
    'usedPercentage',
    'used_percent',
    'used_percentage',
  ]))
  const resetsAt = normalizeTimestamp(firstField(value, [
    'resetsAt',
    'resetAt',
    'resets_at',
    'reset_at',
  ]))
  return {
    ...(durationMinutes === null ? {} : { durationMinutes }),
    ...(usedPercent === null ? {} : { usedPercent }),
    ...(resetsAt === null ? {} : { resetsAt }),
  }
}

function unwrapResult(value: unknown): RecordValue | null {
  if (!isRecord(value)) return null
  const result = value.result
  return isRecord(result) ? result : value
}

function rateLimitRecords(value: unknown): RecordValue[] {
  const root = unwrapResult(value)
  if (!root) return []

  const byLimitId = root.rateLimitsByLimitId
  if (isRecord(byLimitId)) {
    const codex = byLimitId.codex
    if (isRecord(codex)) return [codex]
  }
  if (isRecord(root.rateLimits)) return [root.rateLimits]
  if (isRecord(root.primary) || isRecord(root.secondary)) return [root]
  return []
}

function mergeWindow(base: RawWindowState | undefined, update: RawWindowState): RawWindowState {
  return {
    ...(base ?? {}),
    ...(update.durationMinutes === undefined ? {} : { durationMinutes: update.durationMinutes }),
    ...(update.usedPercent === undefined ? {} : { usedPercent: update.usedPercent }),
    ...(update.resetsAt === undefined ? {} : { resetsAt: update.resetsAt }),
  }
}

function hasRawFields(state: RawWindowState): boolean {
  return state.durationMinutes !== undefined || state.usedPercent !== undefined || state.resetsAt !== undefined
}

function extractRawState(value: unknown): RawRateLimitsState {
  const state: RawRateLimitsState = {}
  for (const record of rateLimitRecords(value)) {
    const primary = parseRawWindow(record.primary)
    const secondary = parseRawWindow(record.secondary)
    if (primary && hasRawFields(primary)) state.primary = primary
    if (secondary && hasRawFields(secondary)) state.secondary = secondary

    for (const name of ['windows', 'limits'] as const) {
      const entries = record[name]
      if (!Array.isArray(entries)) continue
      for (const entry of entries) {
        const parsed = parseRawWindow(entry)
        if (!parsed) continue
        if (parsed.durationMinutes === FIVE_HOUR_MINUTES) state.primary = parsed
        if (parsed.durationMinutes === WEEKLY_MINUTES) state.secondary = parsed
      }
    }
  }
  return state
}

function mergeRawState(base: RawRateLimitsState, update: RawRateLimitsState): RawRateLimitsState {
  return {
    primary: update.primary && hasRawFields(update.primary)
      ? mergeWindow(base.primary, update.primary)
      : base.primary,
    secondary: update.secondary && hasRawFields(update.secondary)
      ? mergeWindow(base.secondary, update.secondary)
      : base.secondary,
  }
}

function kindForDuration(durationMinutes: number | undefined): AgentUsageWindowKind | null {
  if (durationMinutes === FIVE_HOUR_MINUTES) return 'fiveHour'
  if (durationMinutes === WEEKLY_MINUTES) return 'weekly'
  return null
}

function snapshotTimestamp(now: () => number): string | undefined {
  const value = finiteNumber(now())
  if (value === null) return undefined
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString()
}

function unavailableSnapshot(provider: AgentProvider): AgentUsageProviderSnapshot {
  return { provider, windows: [], status: 'unavailable' }
}

function cloneProviderSnapshot(snapshot: AgentUsageProviderSnapshot): AgentUsageProviderSnapshot {
  return {
    provider: snapshot.provider,
    windows: snapshot.windows.map((window) => ({ ...window })),
    ...(snapshot.updatedAt ? { updatedAt: snapshot.updatedAt } : {}),
    status: snapshot.status,
  }
}

function cloneSnapshot(snapshot: AgentUsageSnapshot): AgentUsageSnapshot {
  return {
    claude: cloneProviderSnapshot(snapshot.claude),
    codex: cloneProviderSnapshot(snapshot.codex),
  }
}

function emptySnapshot(): AgentUsageSnapshot {
  return {
    claude: unavailableSnapshot('claude'),
    codex: unavailableSnapshot('codex'),
  }
}

function stateToSnapshot(state: RawRateLimitsState, now: () => number): AgentUsageProviderSnapshot {
  const windows: AgentUsageWindow[] = []
  for (const raw of [state.primary, state.secondary]) {
    if (!raw) continue
    const kind = kindForDuration(raw.durationMinutes)
    if (!kind || raw.usedPercent === undefined || raw.resetsAt === undefined) continue
    windows.push({ kind, usedPercent: raw.usedPercent, resetsAt: raw.resetsAt })
  }

  const uniqueWindows = WINDOW_KINDS.flatMap((kind) => {
    const window = windows.find((candidate) => candidate.kind === kind)
    return window ? [window] : []
  })
  return {
    provider: 'codex',
    windows: uniqueWindows,
    ...(uniqueWindows.length > 0 ? { updatedAt: snapshotTimestamp(now) } : {}),
    status: uniqueWindows.length > 0 ? 'available' : 'unavailable',
  }
}

/** Normalize only the documented five-hour and weekly Codex windows. */
export function normalizeCodexRateLimits(
  value: unknown,
  options: { now?: () => number } = {},
): AgentUsageProviderSnapshot {
  return stateToSnapshot(extractRawState(value), options.now ?? (() => Date.now()))
}

function sanitizeProviderSnapshot(provider: AgentProvider, value: unknown): AgentUsageProviderSnapshot {
  if (!isRecord(value)) return unavailableSnapshot(provider)
  const windows: AgentUsageWindow[] = []
  if (Array.isArray(value.windows)) {
    for (const item of value.windows) {
      if (!isRecord(item)) continue
      const kind = item.kind
      const usedPercent = normalizePercent(item.usedPercent)
      const resetsAt = normalizeTimestamp(item.resetsAt)
      if (!WINDOW_KINDS.includes(kind as AgentUsageWindowKind) || usedPercent === null || resetsAt === null) continue
      if (!windows.some((window) => window.kind === kind)) {
        windows.push({ kind: kind as AgentUsageWindowKind, usedPercent, resetsAt })
      }
    }
  }
  windows.sort((left, right) => WINDOW_KINDS.indexOf(left.kind) - WINDOW_KINDS.indexOf(right.kind))
  const updatedAt = normalizeTimestamp(value.updatedAt)
  return {
    provider,
    windows,
    ...(updatedAt ? { updatedAt } : {}),
    status: windows.length > 0 ? 'available' : 'unavailable',
  }
}

class StdioCodexAppServerClient implements CodexAppServerClient {
  private readonly reader: Interface

  private readonly pending = new Map<number, PendingRequest>()

  private readonly listeners = new Set<(notification: CodexAppServerNotification) => void>()

  private nextRequestId = 1

  private closed = false

  constructor(private readonly process: ChildProcessWithoutNullStreams) {
    this.reader = createInterface({ input: process.stdout })
    this.reader.on('line', (line) => this.handleLine(line))
    process.stderr.resume()
    process.once('error', () => this.failPending())
    process.once('exit', () => this.failPending())
  }

  async initialize(clientInfo: Record<string, string>): Promise<void> {
    await this.request('initialize', { clientInfo })
    this.send({ method: 'initialized' })
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Codex app-server is closed'))
    const id = this.nextRequestId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject })
      try {
        this.send({ ...(params === undefined ? {} : { params }), method, id })
      } catch {
        this.pending.delete(id)
        reject(new Error('Codex app-server is unavailable'))
      }
    })
  }

  onNotification(listener: (notification: CodexAppServerNotification) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.reader.close()
    this.failPending()
    try {
      if (!this.process.killed) this.process.kill()
    } catch {
      // Process shutdown is best effort.
    }
  }

  private send(message: Record<string, unknown>): void {
    if (this.closed || !this.process.stdin.writable) throw new Error('Codex app-server is unavailable')
    this.process.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private handleLine(line: string): void {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      return
    }
    if (!isRecord(value)) return
    if (typeof value.method === 'string') {
      const notification: CodexAppServerNotification = {
        method: value.method,
        ...(Object.prototype.hasOwnProperty.call(value, 'params') ? { params: value.params } : {}),
      }
      for (const listener of this.listeners) {
        try {
          listener(notification)
        } catch {
          // A notification subscriber must not break the app-server reader.
        }
      }
      return
    }
    if (typeof value.id !== 'number') return
    const pending = this.pending.get(value.id)
    if (!pending) return
    this.pending.delete(value.id)
    if (Object.prototype.hasOwnProperty.call(value, 'error')) {
      pending.reject(new Error('Codex app-server request failed'))
      return
    }
    pending.resolve(value.result)
  }

  private failPending(): void {
    if (this.pending.size === 0) return
    const pending = [...this.pending.values()]
    this.pending.clear()
    for (const request of pending) request.reject(new Error('Codex app-server is unavailable'))
  }
}

export interface CodexAppServerClientOptions {
  command?: string
  args?: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  clientInfo?: Record<string, string>
}

/** Production stdio client; tests can inject CodexAppServerClientFactory instead. */
export async function createCodexAppServerClient(
  options: CodexAppServerClientOptions = {},
): Promise<CodexAppServerClient> {
  let child: ChildProcessWithoutNullStreams
  try {
    child = spawn(options.command ?? 'codex', options.args ?? ['app-server', '--stdio'], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch {
    throw new Error('Unable to start Codex app-server')
  }

  const client = new StdioCodexAppServerClient(child)
  try {
    await client.initialize(options.clientInfo ?? {
      name: 'yira',
      title: 'Yira',
      version: '0.1.54',
    })
    return client
  } catch {
    await client.close()
    throw new Error('Unable to initialize Codex app-server')
  }
}

export class AgentUsageService {
  private readonly configuredProviders: AgentUsageServiceOptions['getConfiguredProviders']

  private readonly codexClientFactory: CodexAppServerClientFactory

  private readonly providerReaders: Partial<Record<AgentProvider, AgentUsageProviderReader>>

  private readonly now: () => number

  private readonly refreshIntervalMs: number

  private readonly setIntervalFn: (callback: () => void, delayMs: number) => unknown

  private readonly clearIntervalFn: (handle: unknown) => void

  private readonly subscribers = new Set<AgentUsageSnapshotSubscriber>()

  private snapshot: AgentUsageSnapshot = emptySnapshot()

  private codexClient: CodexAppServerClient | null = null

  private codexUnsubscribe: (() => void) | null = null

  private codexRawState: RawRateLimitsState = {}

  private refreshTimer: unknown

  private refreshInFlight: Promise<void> | null = null

  private started = false

  constructor(options: AgentUsageServiceOptions) {
    this.configuredProviders = options.getConfiguredProviders
    this.codexClientFactory = options.codexClientFactory ?? (() => createCodexAppServerClient())
    this.providerReaders = options.providerReaders ?? {}
    this.now = options.now ?? (() => Date.now())
    this.refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    this.setIntervalFn = options.setIntervalFn ?? ((callback, delay) => setInterval(callback, delay))
    this.clearIntervalFn = options.clearIntervalFn ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>))
  }

  getSnapshot(): AgentUsageSnapshot {
    return cloneSnapshot(this.snapshot)
  }

  subscribe(subscriber: AgentUsageSnapshotSubscriber): () => void {
    this.subscribers.add(subscriber)
    try {
      subscriber(this.getSnapshot())
    } catch {
      // Subscriber failures must not interrupt usage collection.
    }
    return () => this.subscribers.delete(subscriber)
  }

  async start(): Promise<void> {
    if (this.started) {
      await this.refresh()
      return
    }
    this.started = true
    this.refreshTimer = this.setIntervalFn(() => {
      void this.refresh()
    }, this.refreshIntervalMs)
    await this.refresh()
  }

  async stop(): Promise<void> {
    this.started = false
    if (this.refreshTimer !== undefined) {
      this.clearIntervalFn(this.refreshTimer)
      this.refreshTimer = undefined
    }
    await this.refreshInFlight?.catch(() => undefined)
    await this.closeCodexClient()
  }

  async refresh(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight
    const operation = this.refreshInternal()
      .catch(() => undefined)
      .finally(() => {
        if (this.refreshInFlight === operation) this.refreshInFlight = null
      })
    this.refreshInFlight = operation
    return operation
  }

  private async refreshInternal(): Promise<void> {
    const configured = new Set<AgentProvider>()
    try {
      for (const provider of await this.configuredProviders()) {
        if (provider === 'claude' || provider === 'codex') configured.add(provider)
      }
    } catch {
      // A workspace/config read failure produces the same safe unavailable state.
    }

    const next = emptySnapshot()
    if (configured.has('codex')) next.codex = await this.readCodex()
    else await this.closeCodexClient()

    for (const provider of ['claude'] as const) {
      if (!configured.has(provider)) continue
      const reader = this.providerReaders[provider]
      if (!reader) continue
      try {
        next[provider] = sanitizeProviderSnapshot(provider, await reader())
      } catch {
        next[provider] = unavailableSnapshot(provider)
      }
    }

    this.snapshot = next
    this.emit()
  }

  private async readCodex(): Promise<AgentUsageProviderSnapshot> {
    const client = await this.ensureCodexClient()
    if (!client) return unavailableSnapshot('codex')
    try {
      const response = await client.request(CODEX_RATE_LIMITS_READ)
      this.codexRawState = extractRawState(response)
      return stateToSnapshot(this.codexRawState, this.now)
    } catch {
      return {
        ...cloneProviderSnapshot(this.snapshot.codex),
        status: 'unavailable',
      }
    }
  }

  private async ensureCodexClient(): Promise<CodexAppServerClient | null> {
    if (this.codexClient) return this.codexClient
    try {
      const client = await this.codexClientFactory()
      this.codexClient = client
      this.codexUnsubscribe = client.onNotification((notification) => this.handleCodexNotification(notification))
      return client
    } catch {
      return null
    }
  }

  private handleCodexNotification(notification: CodexAppServerNotification): void {
    if (notification.method !== CODEX_RATE_LIMITS_UPDATED) return
    const update = extractRawState(notification.params)
    this.codexRawState = mergeRawState(this.codexRawState, update)
    const codex = stateToSnapshot(this.codexRawState, this.now)
    this.snapshot = { ...this.snapshot, codex }
    this.emit()
    void this.refresh()
  }

  private async closeCodexClient(): Promise<void> {
    this.codexUnsubscribe?.()
    this.codexUnsubscribe = null
    const client = this.codexClient
    this.codexClient = null
    this.codexRawState = {}
    if (!client) return
    try {
      await client.close()
    } catch {
      // Process shutdown is best effort.
    }
  }

  private emit(): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(this.getSnapshot())
      } catch {
        // One renderer subscriber must not stop other subscribers receiving data.
      }
    }
  }
}
