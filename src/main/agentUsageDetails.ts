import { createReadStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, resolve, sep, win32 } from 'node:path'
import { createInterface } from 'node:readline'
import type {
  AgentProvider,
  AgentTokenBreakdown,
  AgentUsageDetailsSnapshot,
  AgentUsageProviderDetails,
  AgentUsageRecentSession,
} from '@shared/types'
import { getAgentProviderTranscriptRoot } from './agents/providers'

const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_LINE_LENGTH = 1024 * 1024
const MAX_FILES = 2_000
const DAY_MS = 24 * 60 * 60 * 1000

export interface AgentUsageWorkspaceRoot {
  id: string
  rootFolderPath: string
}
export interface AgentUsageDetailsOptions {
  roots?: Partial<Record<AgentProvider, string>>
  now?: () => number
  getWorkspaces?: () => Promise<AgentUsageWorkspaceRoot[]>
  getConfiguredProviders?: () => Promise<AgentProvider[]>
  homeDirectory?: string
  statusLineRoot?: string
}

interface UsageFileCache {
  mtimeMs: number
  size: number
  rows: unknown[]
}
interface SessionData {
  provider: AgentProvider
  sessionId: string
  cwd?: string
  model?: string
  lastActivityAt: string
  contextTokens?: number
  contextWindow?: number
  contextWindowApprox?: boolean
  tokens: AgentTokenBreakdown
  hourly: number[]
  sessionCounted: boolean
  modelTokens: Map<string, number>
  workspaceId?: string
}

const fileCache = new Map<string, UsageFileCache>()
const emptyTokens = (): AgentTokenBreakdown => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 })
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
const number = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
const string = (value: unknown): string | undefined => typeof value === 'string' && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined
const localDay = (time: number): string => {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const localStart = (time: number): number => {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}
const within = (candidate: string, root: string): boolean => {
  const pathApi = process.platform === 'win32' ? win32 : undefined
  const resolvedCandidate = pathApi ? pathApi.resolve(candidate).toLowerCase() : resolve(candidate)
  const resolvedRoot = pathApi ? pathApi.resolve(root).toLowerCase() : resolve(root)
  const rel = pathApi ? pathApi.relative(resolvedRoot, resolvedCandidate) : relative(resolvedRoot, resolvedCandidate)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !(pathApi ? pathApi.isAbsolute(rel) : rel.startsWith('/')))
}

async function walkJsonl(root: string, provider: AgentProvider, today: Date): Promise<string[]> {
  const found: string[] = []
  const targetFolders = provider === 'codex'
    ? [join(root, String(today.getFullYear()), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')),
      (() => {
        const yesterday = new Date(today.getTime() - DAY_MS)
        return join(root, String(yesterday.getFullYear()), String(yesterday.getMonth() + 1).padStart(2, '0'), String(yesterday.getDate()).padStart(2, '0'))
      })()]
    : [root]
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (found.length >= MAX_FILES || depth > (provider === 'claude' ? 3 : 0)) return
    let entries
    try { entries = await fs.readdir(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (found.length >= MAX_FILES) break
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path, depth + 1)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          const stat = await fs.stat(path)
          if (stat.size <= MAX_FILE_BYTES && stat.mtimeMs >= localStart(today.getTime())) found.push(path)
        } catch { /* stale file */ }
      }
    }
  }
  for (const folder of targetFolders) await visit(folder, 0)
  return found
}

// Keep only the fields the parsers read so cached transcripts stay small.
function compactRow(provider: AgentProvider, value: unknown): unknown | null {
  const row = record(value)
  if (provider === 'claude') {
    if (row.type !== 'assistant') return null
    const message = record(row.message)
    return {
      type: row.type,
      timestamp: row.timestamp,
      sessionId: row.sessionId ?? row.session_id,
      cwd: row.cwd,
      isSidechain: row.isSidechain,
      message: { id: message.id, model: message.model, usage: message.usage },
    }
  }
  const payload = record(row.payload)
  if (row.type === 'session_meta') {
    return {
      type: row.type,
      payload: {
        id: payload.id,
        cwd: payload.cwd,
        model: payload.model,
        // Presence matters to isCodexWorkerMeta, so copy these keys only when set.
        ...('thread_source' in payload ? { thread_source: payload.thread_source } : {}),
        ...('source' in payload ? { source: payload.source } : {}),
      },
    }
  }
  if (row.type === 'turn_context') return { type: row.type, payload: { model: payload.model } }
  if (row.type === 'event_msg' && payload.type === 'token_count') {
    const info = record(payload.info)
    return { type: row.type, timestamp: row.timestamp, payload: { type: payload.type, info: payload.info ? { last_token_usage: info.last_token_usage, model_context_window: info.model_context_window } : null } }
  }
  return null
}

async function readRows(provider: AgentProvider, path: string, mtimeMs: number, size: number): Promise<unknown[]> {
  const cached = fileCache.get(path)
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) return cached.rows
  const rows: unknown[] = []
  const lines = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      if (line.length > MAX_LINE_LENGTH) continue
      let parsed: unknown
      try { parsed = JSON.parse(line) } catch { continue /* partial JSONL row */ }
      const compact = compactRow(provider, parsed)
      if (compact) rows.push(compact)
    }
  } catch { return [] }
  fileCache.set(path, { mtimeMs, size, rows })
  return rows
}

function isWorkerSession(id: string, cwd?: string): boolean {
  return /(?:^|[-_])(?:worker|subagent)(?:[-_]|$)/i.test(id) || /(?:^|[\\/])\.codex[\\/]sessions[\\/].*(?:worker|subagent)/i.test(cwd ?? '')
}

function isCodexWorkerMeta(payload: Record<string, any>): boolean {
  if (Object.prototype.hasOwnProperty.call(payload, 'thread_source')) return string(payload.thread_source)?.toLowerCase() !== 'user'
  return Boolean(record(payload.source).subagent && typeof record(payload.source).subagent === 'object')
}

function dateOf(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function newSession(provider: AgentProvider, sessionId: string, timestamp: Date): SessionData {
  return { provider, sessionId, lastActivityAt: timestamp.toISOString(), tokens: emptyTokens(), hourly: Array(24).fill(0), sessionCounted: true, modelTokens: new Map() }
}

export class AgentUsageDetailsService {
  private readonly now: () => number
  private readonly getWorkspaces: () => Promise<AgentUsageWorkspaceRoot[]>
  private readonly getConfiguredProviders: () => Promise<AgentProvider[]>
  private readonly roots: Partial<Record<AgentProvider, string>>
  private readonly homeDirectory: string
  private readonly statusLineRoot: string
  private cachedAt = 0
  private snapshot: AgentUsageDetailsSnapshot | null = null
  private inFlight: Promise<AgentUsageDetailsSnapshot> | null = null

  constructor(options: AgentUsageDetailsOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.getWorkspaces = options.getWorkspaces ?? (async () => [])
    this.getConfiguredProviders = options.getConfiguredProviders ?? (async () => [])
    this.roots = options.roots ?? {}
    this.homeDirectory = options.homeDirectory ?? homedir()
    this.statusLineRoot = options.statusLineRoot ?? join(this.homeDirectory, '.claude', 'statusline')
  }

  getSnapshot(): Promise<AgentUsageDetailsSnapshot> {
    if (this.snapshot && this.now() - this.cachedAt < 60_000) return Promise.resolve(this.snapshot)
    if (this.inFlight) return this.inFlight
    const operation = this.readSnapshot().then((snapshot) => {
      this.snapshot = snapshot
      this.cachedAt = this.now()
      return snapshot
    }).finally(() => { if (this.inFlight === operation) this.inFlight = null })
    this.inFlight = operation
    return operation
  }

  invalidate(): void {
    this.snapshot = null
    this.cachedAt = 0
  }

  private async readSnapshot(): Promise<AgentUsageDetailsSnapshot> {
    const now = this.now()
    const start = localStart(now)
    const today = new Date(now)
    const day = localDay(now)
    const [workspaces, configuredProviders] = await Promise.all([
      this.getWorkspaces().catch(() => []),
      this.getConfiguredProviders().catch(() => []),
    ])
    const configured = new Set<AgentProvider>(configuredProviders)
    // Provider roots are read only for providers selected by the workspace config.
    const allRows = new Map<AgentProvider, unknown[]>()
    const listed = new Set<string>()
    for (const provider of ['claude', 'codex'] as const) {
      if (!configured.has(provider)) continue
      const root = this.roots[provider] ?? getAgentProviderTranscriptRoot(provider, this.homeDirectory)
      const files = await walkJsonl(root, provider, today)
      const rows: unknown[] = []
      for (const path of files) {
        listed.add(path)
        try {
          const stat = await fs.stat(path)
          for (const row of await readRows(provider, path, stat.mtimeMs, stat.size)) rows.push(row)
        } catch { /* skip files that disappear during enumeration */ }
      }
      allRows.set(provider, rows)
    }
    for (const path of fileCache.keys()) {
      if (!listed.has(path)) fileCache.delete(path)
    }
    const sessions = new Map<string, SessionData>()
    for (const [provider, rows] of allRows) {
      if (provider === 'claude') this.parseClaude(rows, start, sessions)
      else this.parseCodex(rows, start, sessions)
    }
    const byWorkspace = (cwd?: string): string | undefined => {
      if (!cwd) return undefined
      return workspaces.find((workspace) => workspace.rootFolderPath && within(cwd, workspace.rootFolderPath))?.id
    }
    const details: Partial<Record<AgentProvider, AgentUsageProviderDetails>> = {}
    const claudeLines = configured.has('claude') ? await readClaudeLines(this.statusLineRoot, start) : undefined
    for (const provider of configured) {
      const selected = [...sessions.values()].filter((session) => session.provider === provider)
      const tokens = emptyTokens()
      const hourly = Array(24).fill(0) as number[]
      const tokensByWorkspace: Record<string, number> = {}
      const modelTokens = new Map<string, number>()
      for (const session of selected) {
        session.workspaceId = byWorkspace(session.cwd)
        for (const key of Object.keys(tokens) as (keyof AgentTokenBreakdown)[]) tokens[key] += session.tokens[key]
        session.hourly.forEach((value, hour) => { hourly[hour] += value })
        if (session.workspaceId) tokensByWorkspace[session.workspaceId] = (tokensByWorkspace[session.workspaceId] ?? 0) + Object.values(session.tokens).reduce((sum, value) => sum + value, 0)
        for (const [model, count] of session.modelTokens) modelTokens.set(model, (modelTokens.get(model) ?? 0) + count)
      }
      const total = [...modelTokens.values()].reduce((sum, value) => sum + value, 0)
      const top = [...modelTokens.entries()].sort((a, b) => b[1] - a[1])[0]
      details[provider] = {
        provider, day, tokens, hourly, sessionCount: selected.filter((session) => session.sessionCounted).length,
        tokensByWorkspace,
        ...(provider === 'claude' && claudeLines ? claudeLines : {}),
        ...(top && total > 0 ? { topModel: { name: top[0], share: top[1] / total } } : {}),
      }
    }
    return {
      updatedAt: new Date(now).toISOString(), providers: details,
      recentSessions: [...sessions.values()].filter((session) => now - new Date(session.lastActivityAt).getTime() <= 30 * 60_000)
        .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)).slice(0, 8).map(({ tokens: _tokens, hourly: _hourly, modelTokens: _models, sessionCounted: _counted, cwd: _cwd, ...session }) => session),
    }
  }

  private parseClaude(rows: unknown[], start: number, sessions: Map<string, SessionData>): void {
    const messages = new Map<string, {
      row: Record<string, any>
      date: Date
      id: string
      sessionId: string
    }>()
    for (const value of rows) {
      const row = record(value)
      if (row.type !== 'assistant') continue
      const date = dateOf(row.timestamp)
      const id = string(row.message?.id)
      const sessionId = string(row.sessionId ?? row.session_id)
      if (!date || date.getTime() < start || !id || !sessionId) continue
      messages.set(id, { row, date, id, sessionId })
    }
    for (const { row, date, id, sessionId } of messages.values()) {
      const session = sessions.get(`claude:${sessionId}`) ?? newSession('claude', sessionId, date)
      const usage = record(row.message?.usage)
      const input = number(usage.input_tokens)
      const cacheWrite = number(usage.cache_creation_input_tokens)
      const cacheRead = number(usage.cache_read_input_tokens)
      const output = number(usage.output_tokens)
      session.tokens.input += input
      session.tokens.cacheWrite += cacheWrite
      session.tokens.cacheRead += cacheRead
      session.tokens.output += output
      const total = input + cacheWrite + cacheRead + output
      session.hourly[date.getHours()] += total
      session.lastActivityAt = date.toISOString()
      session.cwd ??= string(row.cwd)
      session.model = string(row.message?.model) ?? session.model
      session.contextTokens = input + cacheWrite + cacheRead
      // Transcripts do not record the window; a prompt above 200k implies the 1M variant.
      const long = /(?:\[1m\]|1m)/i.test(session.model ?? '') || session.contextTokens > 200_000
      session.contextWindow = long ? 1_000_000 : 200_000
      if (long) session.contextWindowApprox = true
      session.sessionCounted = row.isSidechain !== true
      if (session.model) session.modelTokens.set(session.model, (session.modelTokens.get(session.model) ?? 0) + total)
      sessions.set(`claude:${sessionId}`, session)
    }
  }

  private parseCodex(rows: unknown[], start: number, sessions: Map<string, SessionData>): void {
    let sessionId = ''
    let cwd: string | undefined
    let model: string | undefined
    let worker = false
    for (const value of rows) {
      const row = record(value)
      const payload = record(row.payload)
      if (row.type === 'session_meta') {
        sessionId = string(payload.id) ?? sessionId
        cwd = string(payload.cwd) ?? cwd
        model = string(payload.model) ?? model
        worker = isCodexWorkerMeta(payload)
      }
      if (row.type === 'turn_context') model = string(payload.model) ?? model
      if (row.type !== 'event_msg' || payload.type !== 'token_count') continue
      const date = dateOf(row.timestamp)
      const info = record(payload.info)
      const usage = record(info.last_token_usage)
      if (!date || date.getTime() < start || !sessionId || !Object.keys(usage).length) continue
      const session = sessions.get(`codex:${sessionId}`) ?? newSession('codex', sessionId, date)
      const input = number(usage.input_tokens)
      const cached = number(usage.cached_input_tokens)
      const cacheWrite = number(usage.cache_write_input_tokens)
      const output = number(usage.output_tokens)
      const reasoning = number(usage.reasoning_output_tokens)
      session.tokens.input += Math.max(0, input - cached)
      session.tokens.cacheRead += cached
      session.tokens.cacheWrite += cacheWrite
      session.tokens.output += output
      session.tokens.reasoning += reasoning
      session.hourly[date.getHours()] += Math.max(0, input - cached) + cached + cacheWrite + output + reasoning
      session.lastActivityAt = date.toISOString()
      session.cwd = cwd ?? session.cwd
      session.model = model ?? session.model
      session.contextTokens = input
      session.contextWindow = number(info.model_context_window) || session.contextWindow
      session.sessionCounted = !worker && !isWorkerSession(sessionId, cwd)
      if (session.model) session.modelTokens.set(session.model, (session.modelTokens.get(session.model) ?? 0) + input + cacheWrite + output + reasoning)
      sessions.set(`codex:${sessionId}`, session)
    }
  }
}

async function readClaudeLines(root: string, start: number): Promise<{
  linesAdded: number
  linesRemoved: number
} | undefined> {
  let entries
  try { entries = await fs.readdir(root, { withFileTypes: true }) } catch { return undefined }
  const latest = new Map<string, {
    modifiedAt: number
    added: number
    removed: number
  }>()
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const path = join(root, entry.name)
    try {
      const stat = await fs.stat(path)
      if (stat.mtimeMs < start || stat.size > MAX_LINE_LENGTH) continue
      const parsed = record(JSON.parse(await fs.readFile(path, 'utf8')))
      const sessionId = string(parsed.session_id)
      const cost = record(parsed.cost)
      if (!sessionId || typeof cost.total_lines_added !== 'number' || typeof cost.total_lines_removed !== 'number') continue
      const previous = latest.get(sessionId)
      if (!previous || stat.mtimeMs >= previous.modifiedAt) {
        latest.set(sessionId, {
          modifiedAt: stat.mtimeMs,
          added: number(cost.total_lines_added),
          removed: number(cost.total_lines_removed),
        })
      }
    } catch { /* malformed or transient status-line payload */ }
  }
  if (latest.size === 0) return undefined
  return {
    linesAdded: [...latest.values()].reduce((sum, value) => sum + value.added, 0),
    linesRemoved: [...latest.values()].reduce((sum, value) => sum + value.removed, 0),
  }
}
