import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, resolve, sep, win32 } from 'node:path'
import type {
  AgentProvider,
  AgentTokenBreakdown,
  AgentUsageHistoryRequest,
  AgentUsageHistorySnapshot,
  AgentUsageRecentSession,
} from '@shared/types'
import { getAgentHomeDirectory, getAgentProviderTranscriptRoot } from './agents/providers'
import { YIRA_HOME } from './paths'

const VERSION = 1
const RETENTION = 31 * 24 * 60 * 60 * 1000
const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_LINE_LENGTH = 1024 * 1024
const MAX_FILES = 2_000
const providers: AgentProvider[] = ['claude', 'codex']

type Usage = AgentTokenBreakdown
type StoredUsage = [number, number, number, number, number]
type StoredEvent = [string | undefined, string, string | undefined, string | undefined, number, StoredUsage, boolean, number | undefined, number | undefined, boolean | undefined]
type StoredFile = [AgentProvider, number, number, number, string, string | undefined, string | undefined, string | undefined, boolean | undefined, StoredEvent[]]

interface Event {
  id?: string
  sessionId: string
  cwd?: string
  model?: string
  time: number
  usage: Usage
  counted: boolean
  contextTokens?: number
  contextWindow?: number
  contextWindowApprox?: boolean
}

interface FileEntry {
  path: string
  provider: AgentProvider
  size: number
  mtimeMs: number
  offset: number
  partial: string
  sessionId?: string
  cwd?: string
  model?: string
  worker?: boolean
  events: Event[]
}

interface SavedIndex {
  version: number
  files: Record<string, StoredFile>
}

export interface AgentUsageIndexOptions {
  indexPath?: string
  roots?: Partial<Record<AgentProvider, string>>
  homeDirectory?: string
  statusLineRoot?: string
  now?: () => number
  onPersist?: () => void
}

export interface AgentUsageIndexWorkspace {
  id: string
  rootFolderPath: string
}

const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 })
const obj = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
const string = (value: unknown): string | undefined => typeof value === 'string' && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined
const number = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
const total = (usage: Usage): number => usage.input + usage.output + usage.cacheRead + usage.cacheWrite + usage.reasoning

function localStart(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function localHourStart(time: number): number {
  const date = new Date(time)
  date.setMinutes(0, 0, 0)
  return date.getTime()
}

function dayKey(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function inRoot(path: string, root: string): boolean {
  const pathApi = process.platform === 'win32' ? win32 : undefined
  const candidate = pathApi ? pathApi.resolve(path).toLowerCase() : resolve(path)
  const base = pathApi ? pathApi.resolve(root).toLowerCase() : resolve(root)
  const rel = pathApi ? pathApi.relative(base, candidate) : relative(base, candidate)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !(pathApi ? pathApi.isAbsolute(rel) : rel.startsWith('/')))
}

function isWorkerSession(id: string, cwd?: string): boolean {
  return /(?:^|[-_])(?:worker|subagent)(?:[-_]|$)/i.test(id) || /(?:^|[\\/])\.codex[\\/]sessions[\\/].*(?:worker|subagent)/i.test(cwd ?? '')
}

function isCodexWorkerMeta(meta: Record<string, any>): boolean {
  if (Object.prototype.hasOwnProperty.call(meta, 'thread_source')) return string(meta.thread_source)?.toLowerCase() !== 'user'
  return Boolean(obj(meta.source).subagent && typeof obj(meta.source).subagent === 'object')
}

function dayOffset(now: number, days: number): number {
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function encodeEvent(event: Event): StoredEvent {
  return [
    event.id,
    event.sessionId,
    event.cwd,
    event.model,
    event.time,
    [event.usage.input, event.usage.output, event.usage.cacheRead, event.usage.cacheWrite, event.usage.reasoning],
    event.counted,
    event.contextTokens,
    event.contextWindow,
    event.contextWindowApprox,
  ]
}

function decodeEvent(event: StoredEvent): Event {
  return {
    ...(typeof event[0] === 'string' && event[0] ? { id: event[0] } : {}),
    sessionId: event[1],
    ...(typeof event[2] === 'string' && event[2] ? { cwd: event[2] } : {}),
    ...(typeof event[3] === 'string' && event[3] ? { model: event[3] } : {}),
    time: event[4],
    usage: { input: event[5][0], output: event[5][1], cacheRead: event[5][2], cacheWrite: event[5][3], reasoning: event[5][4] },
    counted: event[6],
    ...(typeof event[7] === 'number' ? { contextTokens: event[7] } : {}),
    ...(typeof event[8] === 'number' ? { contextWindow: event[8] } : {}),
    ...(typeof event[9] === 'boolean' ? { contextWindowApprox: event[9] } : {}),
  }
}

function encodeFile(file: FileEntry): StoredFile {
  return [file.provider, file.size, file.mtimeMs, file.offset, file.partial, file.sessionId, file.cwd, file.model, file.worker, file.events.map(encodeEvent)]
}

function decodeFile(path: string, saved: StoredFile): FileEntry {
  return {
    path,
    provider: saved[0],
    size: saved[1],
    mtimeMs: saved[2],
    offset: saved[3],
    partial: saved[4],
    ...(typeof saved[5] === 'string' ? { sessionId: saved[5] } : {}),
    ...(typeof saved[6] === 'string' ? { cwd: saved[6] } : {}),
    ...(typeof saved[7] === 'string' ? { model: saved[7] } : {}),
    ...(typeof saved[8] === 'boolean' ? { worker: saved[8] } : {}),
    events: saved[9].map(decodeEvent),
  }
}

function equalFileContent(a: FileEntry, b: FileEntry): boolean {
  return a.provider === b.provider && a.size === b.size && a.offset === b.offset && a.partial === b.partial &&
    a.sessionId === b.sessionId && a.cwd === b.cwd && a.model === b.model && a.worker === b.worker &&
    JSON.stringify(a.events) === JSON.stringify(b.events)
}

export class AgentUsageIndex {
  private readonly path: string
  private readonly roots: Partial<Record<AgentProvider, string>>
  private readonly home: string
  private readonly statusLineRoot: string
  private readonly now: () => number
  private readonly onPersist?: () => void
  private saved: SavedIndex = { version: VERSION, files: {} }
  private loaded = false
  private scanned = false
  private indexing = false
  private scannedProviders = ''
  private scanning: Promise<void> | null = null
  private cachedAt = 0
  private readonly cache = new Map<string, AgentUsageHistorySnapshot>()

  constructor(options: AgentUsageIndexOptions = {}) {
    this.path = options.indexPath ?? join(YIRA_HOME, 'usage-index.json')
    this.roots = options.roots ?? {}
    this.home = options.homeDirectory ?? homedir()
    this.statusLineRoot = options.statusLineRoot ?? join(getAgentHomeDirectory('claude', this.home), 'statusline')
    this.now = options.now ?? Date.now
    this.onPersist = options.onPersist
  }

  private async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const parsed = JSON.parse(await fs.readFile(this.path, 'utf8'))
      if (parsed?.version !== VERSION || !parsed.files || typeof parsed.files !== 'object') return
      const files: Record<string, StoredFile> = {}
      for (const [path, value] of Object.entries(parsed.files)) {
        if (!Array.isArray(value) || value.length !== 10 || !Array.isArray(value[9])) throw new Error('Invalid usage index entry')
        const stored = value as StoredFile
        decodeFile(path, stored)
        files[path] = stored
      }
      this.saved = { version: VERSION, files }
    } catch {
      this.saved = { version: VERSION, files: {} }
    }
  }

  async refresh(enabled: AgentProvider[] = providers): Promise<void> {
    const selection = [...enabled].sort().join(',')
    if (this.scanning) return this.scanning
    if (this.scanned && this.scannedProviders === selection && this.now() - this.cachedAt < 60_000) return
    this.indexing = true
    const job = this.scan(enabled).finally(() => {
      this.indexing = false
      if (this.scanning === job) this.scanning = null
    })
    this.scanning = job
    return job
  }

  private async scan(enabled: AgentProvider[]): Promise<void> {
    await this.load()
    const now = this.now()
    const cutoff = now - RETENTION
    const listed = new Map<string, AgentProvider>()

    for (const provider of providers) {
      if (!enabled.includes(provider)) continue
      const root = this.roots[provider] ?? getAgentProviderTranscriptRoot(provider, this.home)
      if (provider === 'codex') {
        for (let dayIndex = 0; dayIndex < 31; dayIndex += 1) {
          const date = new Date(now)
          date.setDate(date.getDate() - dayIndex)
          const folder = join(root, String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0'))
          await this.listDirectory(folder, provider, cutoff, listed, 0)
        }
      } else {
        await this.listDirectory(root, provider, cutoff, listed, 0)
      }
    }

    const next: Record<string, FileEntry> = {}
    for (const [path, provider] of listed) {
      let stat
      try {
        stat = await fs.stat(path)
      } catch {
        continue
      }
      const priorStored = this.saved.files[path]
      const prior = priorStored ? decodeFile(path, priorStored) : undefined
      const file: FileEntry = prior && prior.provider === provider && stat.size >= prior.offset
        ? { ...prior, events: [...prior.events] }
        : { path, provider, size: 0, mtimeMs: 0, offset: 0, partial: '', events: [] }
      if (stat.size > file.size || stat.size < file.offset) await this.readAppend(file, stat.size, stat.mtimeMs)
      file.mtimeMs = stat.mtimeMs
      file.events = file.events.filter((event) => event.time >= cutoff)
      for (const event of file.events) {
        if (now - event.time > 60 * 60_000) {
          delete event.contextTokens
          delete event.contextWindow
          delete event.contextWindowApprox
        }
      }
      next[path] = file
    }

    const changed = Object.keys(this.saved.files).length !== Object.keys(next).length ||
      Object.entries(next).some(([path, file]) => {
        const prior = this.saved.files[path]
        return !prior || !equalFileContent(decodeFile(path, prior), file)
      })
    this.saved = { version: VERSION, files: Object.fromEntries(Object.entries(next).map(([path, file]) => [path, encodeFile(file)])) }
    if (changed) await this.persist()
    this.scanned = true
    this.scannedProviders = [...enabled].sort().join(',')
    this.cachedAt = now
    this.cache.clear()
  }

  private async listDirectory(
    directory: string,
    provider: AgentProvider,
    cutoff: number,
    listed: Map<string, AgentProvider>,
    depth: number,
  ): Promise<void> {
    if (listed.size >= MAX_FILES || depth > 3) return
    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (listed.size >= MAX_FILES) break
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (provider === 'claude') await this.listDirectory(path, provider, cutoff, listed, depth + 1)
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          const stat = await fs.stat(path)
          if (stat.size <= MAX_FILE_BYTES && stat.mtimeMs >= cutoff) listed.set(path, provider)
        } catch {
          // The file rotated during enumeration.
        }
      }
    }
  }

  private async readAppend(file: FileEntry, size: number, mtimeMs: number): Promise<void> {
    if (size < file.offset) {
      file.offset = 0
      file.partial = ''
      file.events = []
      file.sessionId = undefined
      file.cwd = undefined
      file.model = undefined
      file.worker = undefined
    }
    const handle = await fs.open(file.path, 'r')
    try {
      const previousPartial = Buffer.from(file.partial, 'base64')
      const readAt = file.offset + previousPartial.length
      const length = Math.min(size - readAt, MAX_FILE_BYTES - readAt)
      if (length <= 0) {
        file.size = size
        file.mtimeMs = mtimeMs
        return
      }
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buffer, 0, length, readAt)
      const combined = Buffer.concat([previousPartial, buffer.subarray(0, bytesRead)])
      const lastNewline = combined.lastIndexOf(0x0a)
      const complete = lastNewline < 0 ? Buffer.alloc(0) : combined.subarray(0, lastNewline + 1)
      file.partial = combined.subarray(lastNewline + 1).toString('base64')
      file.offset += complete.length
      const lines = complete.toString('utf8').split('\n')
      lines.pop()
      for (const line of lines) {
        if (line.length > MAX_LINE_LENGTH) continue
        let raw: unknown
        try {
          raw = JSON.parse(line)
        } catch {
          continue
        }
        this.addRow(file, obj(raw))
      }
      file.size = size
      file.mtimeMs = mtimeMs
    } finally {
      await handle.close()
    }
  }

  private addRow(file: FileEntry, row: Record<string, any>): void {
    const payload = obj(row.payload)
    if (file.provider === 'claude') {
      if (row.type !== 'assistant') return
      const time = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN
      const message = obj(row.message)
      const id = string(message.id)
      const sessionId = string(row.sessionId ?? row.session_id)
      if (!Number.isFinite(time) || !id || !sessionId) return
      const usage = obj(message.usage)
      const input = number(usage.input_tokens)
      const cacheRead = number(usage.cache_read_input_tokens)
      const cacheWrite = number(usage.cache_creation_input_tokens)
      const contextTokens = input + cacheRead + cacheWrite
      const model = string(message.model)
      const longContext = /(?:\[1m\]|1m)/i.test(model ?? '') || contextTokens > 200_000
      file.events.push({
        id,
        sessionId,
        cwd: string(row.cwd),
        model,
        time,
        usage: { input, output: number(usage.output_tokens), cacheRead, cacheWrite, reasoning: 0 },
        counted: row.isSidechain !== true,
        contextTokens,
        contextWindow: longContext ? 1_000_000 : 200_000,
        ...(longContext ? { contextWindowApprox: true } : {}),
      })
      return
    }
    if (row.type === 'session_meta') {
      file.sessionId = string(payload.id) ?? file.sessionId
      file.cwd = string(payload.cwd) ?? file.cwd
      file.model = string(payload.model) ?? file.model
      file.worker = isCodexWorkerMeta(payload)
      return
    }
    if (row.type === 'turn_context') {
      file.model = string(payload.model) ?? file.model
      return
    }
    if (row.type !== 'event_msg' || payload.type !== 'token_count') return
    const time = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN
    const info = obj(payload.info)
    const usage = obj(info.last_token_usage)
    if (!Number.isFinite(time) || !file.sessionId || !Object.keys(usage).length) return
    const input = number(usage.input_tokens)
    const cached = number(usage.cached_input_tokens)
    const cacheWrite = number(usage.cache_write_input_tokens)
    const output = number(usage.output_tokens)
    const reasoning = number(usage.reasoning_output_tokens)
    file.events.push({
      sessionId: file.sessionId,
      cwd: file.cwd,
      model: file.model,
      time,
      usage: { input: Math.max(0, input - cached), output, cacheRead: cached, cacheWrite, reasoning },
      counted: !file.worker && !isWorkerSession(file.sessionId, file.cwd),
      contextTokens: input,
      contextWindow: number(info.model_context_window) || undefined,
    })
  }

  private async persist(): Promise<void> {
    await fs.mkdir(join(this.path, '..'), { recursive: true })
    const temp = `${this.path}.${process.pid}.tmp`
    await fs.writeFile(temp, JSON.stringify(this.saved), 'utf8')
    await fs.rename(temp, this.path)
    this.onPersist?.()
  }

  async getHistory(
    request: AgentUsageHistoryRequest,
    enabled: AgentProvider[],
    workspaces: AgentUsageIndexWorkspace[] = [],
  ): Promise<AgentUsageHistorySnapshot> {
    await this.load()
    if (!this.scanned) {
      if (!this.scanning) void this.refresh(enabled).catch(() => undefined)
    } else {
      await this.refresh(enabled)
    }
    const selected = (request.providers?.length ? request.providers : enabled)
      .filter((provider) => providers.includes(provider) && enabled.includes(provider))
    const now = this.now()
    const key = `${request.period}:${selected.join(',')}:${workspaces.map((workspace) => `${workspace.id}:${workspace.rootFolderPath}`).join('|')}`
    const cached = this.cache.get(key)
    if (cached && now - this.cachedAt < 60_000 && cached.indexing === this.indexing) return cached
    const from = request.period === 'today' ? localStart(now) : dayOffset(now, request.period === '7d' ? 6 : 29)
    const events: Array<{ provider: AgentProvider; event: Event }> = []
    for (const provider of selected) {
      for (const file of Object.values(this.saved.files)) {
        if (file[0] !== provider) continue
        for (const event of file[9].map(decodeEvent)) {
          if (event.time >= from && event.time <= now) events.push({ provider, event })
        }
      }
    }
    const dedup = new Map<string, { provider: AgentProvider; event: Event }>()
    const regular: typeof events = []
    for (const entry of events) {
      if (entry.event.id) dedup.set(entry.event.id, entry)
      else regular.push(entry)
    }
    const all = [...regular, ...dedup.values()]
    const totals = Object.assign(emptyUsage(), { total: 0, messages: 0, sessions: 0 })
    const models = new Map<string, number>()
    const workspaceTotals = new Map<string, number>()
    const providerTotals = new Map<AgentProvider, number>()
    const sessionMap = new Map<string, { provider: AgentProvider; event: Event }>()
    const series = new Map<string, Partial<Record<AgentProvider, number>>>()
    const bucket = request.period === 'today' ? 'hour' : 'day'

    for (const { event, provider } of all) {
      const tokens = total(event.usage)
      for (const field of Object.keys(emptyUsage()) as (keyof Usage)[]) totals[field] += event.usage[field]
      totals.total += tokens
      totals.messages += 1
      providerTotals.set(provider, (providerTotals.get(provider) ?? 0) + tokens)
      if (event.model && tokens > 0) {
        const key = `${provider}\0${event.model}`
        models.set(key, (models.get(key) ?? 0) + tokens)
      }
      if (tokens > 0 && event.cwd) {
        const workspace = workspaces.find((candidate) => inRoot(event.cwd!, candidate.rootFolderPath))
        if (workspace) workspaceTotals.set(workspace.id, (workspaceTotals.get(workspace.id) ?? 0) + tokens)
      }
      const start = bucket === 'hour' ? localHourStart(event.time) : localStart(event.time)
      const startKey = new Date(start).toISOString()
      const point = series.get(startKey) ?? {}
      point[provider] = (point[provider] ?? 0) + tokens
      series.set(startKey, point)
      const sessionKey = `${provider}:${dayKey(event.time)}:${event.sessionId}`
      const previous = sessionMap.get(sessionKey)
      if (!previous || event.time > previous.event.time) sessionMap.set(sessionKey, { provider, event })
    }

    const sessionIds = new Set([...sessionMap.values()]
      .filter(({ event }) => event.counted)
      .map(({ provider, event }) => `${provider}:${dayKey(event.time)}:${event.sessionId}`))
    totals.sessions = sessionIds.size
    const rangeStarts: number[] = []
    if (bucket === 'hour') {
      const start = new Date(localStart(now))
      for (let hour = 0; hour < 24; hour += 1) {
        const date = new Date(start)
        date.setHours(hour, 0, 0, 0)
        rangeStarts.push(date.getTime())
      }
    } else {
      for (let days = request.period === '7d' ? 6 : 29; days >= 0; days -= 1) {
        rangeStarts.push(dayOffset(now, days))
      }
    }
    for (const start of rangeStarts) {
      const key = new Date(start).toISOString()
      if (!series.has(key)) series.set(key, {})
    }
    const recent = new Map<string, { provider: AgentProvider; event: Event }>()
    for (const entry of all) {
      const { event, provider } = entry
      if (now - event.time > 30 * 60_000 || event.time > now) continue
      const key = `${provider}:${event.sessionId}`
      const previous = recent.get(key)
      if (!previous || previous.event.time < event.time) recent.set(key, entry)
    }
    const recentSessions: AgentUsageRecentSession[] = [...recent.values()]
      .sort((a, b) => b.event.time - a.event.time)
      .slice(0, 8)
      .map(({ provider, event }) => {
        const workspace = event.cwd && workspaces.find((candidate) => inRoot(event.cwd!, candidate.rootFolderPath))
        return {
          provider,
          sessionId: event.sessionId,
          ...(workspace ? { workspaceId: workspace.id } : {}),
          ...(event.model ? { model: event.model } : {}),
          lastActivityAt: new Date(event.time).toISOString(),
          ...(event.contextTokens !== undefined ? { contextTokens: event.contextTokens } : {}),
          ...(event.contextWindow !== undefined ? { contextWindow: event.contextWindow } : {}),
          ...(event.contextWindowApprox ? { contextWindowApprox: true } : {}),
        }
      })
    const snapshot: AgentUsageHistorySnapshot = {
      updatedAt: new Date(now).toISOString(),
      period: request.period,
      providers: selected,
      indexing: this.indexing,
      totals,
      series: {
        bucket,
        points: [...series.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([start, point]) => ({ start, ...point })),
      },
      byModel: [...models.entries()]
        .map(([key, tokens]) => {
          const [provider, model] = key.split('\0') as [AgentProvider, string]
          return { provider, model, tokens }
        })
        .sort((a, b) => b.tokens - a.tokens),
      byWorkspace: [...workspaceTotals.entries()]
        .map(([workspaceId, tokens]) => ({ workspaceId, tokens }))
        .sort((a, b) => b.tokens - a.tokens),
      byProvider: selected.map((provider) => ({ provider, tokens: providerTotals.get(provider) ?? 0 })),
      recentSessions,
    }
    if (selected.includes('claude')) {
      const lines = await this.readClaudeLines(from)
      if (lines) snapshot.lines = lines
    }
    this.cache.set(key, snapshot)
    return snapshot
  }

  private async readClaudeLines(from: number): Promise<{ added: number; removed: number } | undefined> {
    let entries
    try {
      entries = await fs.readdir(this.statusLineRoot, { withFileTypes: true })
    } catch {
      return undefined
    }
    const sessions = new Map<string, { mtime: number; added: number; removed: number }>()
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      try {
        const path = join(this.statusLineRoot, entry.name)
        const stat = await fs.stat(path)
        if (stat.mtimeMs < from || stat.size > MAX_LINE_LENGTH) continue
        const payload = obj(JSON.parse(await fs.readFile(path, 'utf8')))
        const id = string(payload.session_id)
        const cost = obj(payload.cost)
        if (!id || typeof cost.total_lines_added !== 'number' || typeof cost.total_lines_removed !== 'number') continue
        const previous = sessions.get(id)
        if (!previous || stat.mtimeMs >= previous.mtime) {
          sessions.set(id, {
            mtime: stat.mtimeMs,
            added: number(cost.total_lines_added),
            removed: number(cost.total_lines_removed),
          })
        }
      } catch {
        // Ignore malformed or transient status-line files.
      }
    }
    if (sessions.size === 0) return undefined
    return {
      added: [...sessions.values()].reduce((sum, session) => sum + session.added, 0),
      removed: [...sessions.values()].reduce((sum, session) => sum + session.removed, 0),
    }
  }
}
