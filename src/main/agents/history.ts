import { createReadStream, promises as fs } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'
import { createInterface } from 'node:readline'

import type {
  AgentProvider,
  AgentSessionHistoryItem,
  AgentSessionHistoryResult,
} from '@shared/types'
import { getAgentProviderTranscriptRoot, normalizeResumeId } from './providers'
import {
  DEFAULT_HISTORY_RESULT_LIMIT,
  MAX_HISTORY_RESULT_LIMIT,
} from './query'
import {
  classifyClaudeRecord,
  classifyCodexRecord,
  isCodexExecSession,
  isCodexWorkerSession,
  type TranscriptEvent,
  type TranscriptRecordClassification,
} from './transcriptRecords'

export const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024
const MAX_TRANSCRIPT_LINE_LENGTH = 256 * 1024
const MAX_TRANSCRIPT_FILES = 1_000
const MAX_TRANSCRIPT_DEPTH = 8
const MAX_TITLE_LENGTH = 120
const MAX_PREVIEW_LENGTH = 280

export interface AgentHistoryRoots {
  claude?: string
  codex?: string
}

export interface AgentHistoryReadOptions {
  /** Test/integration override; production callers use the fixed provider roots. */
  rootPath?: string
  roots?: AgentHistoryRoots
  homeDirectory?: string
  workspaceRoot?: string
  search?: string
  limit?: number
}

export interface AgentSessionHistoryOptions extends AgentHistoryReadOptions {
  provider?: AgentProvider
}

interface ParsedSession {
  identifier: string
  cwd?: string
  model?: string
  customTitle?: string
  aiTitle?: string
  summaryTitle?: string
  firstPrompt?: string
  firstCommand?: string
  preview?: string
  messageCount: number
  messageTimes: string[]
  replyIds: Set<string>
}

interface TranscriptFile {
  path: string
}

interface TranscriptCacheEntry {
  size: number
  mtimeMs: number
  parsed: ParsedSession | null
}

const transcriptCache = new Map<string, TranscriptCacheEntry>()

export function clearAgentHistoryCache(): void {
  transcriptCache.clear()
}

function stringValue(value: unknown, maxLength = 1_024): string | undefined {
  // Tabs, line feeds, and carriage returns are ordinary in provider message
  // bodies. Normalize those whitespace controls below, while rejecting other
  // control characters that should never reach renderer-facing metadata.
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f]/.test(value)) return undefined
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, maxLength) : undefined
}

function normalizedCwd(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return undefined
  const cwd = value.trim().slice(0, 4_096)
  if (!cwd) return undefined
  // Provider metadata should already contain an absolute path. Relative paths
  // are intentionally dropped rather than resolved against an arbitrary cwd.
  if (!isAbsolute(cwd) && !/^[A-Za-z]:[\\/]/.test(cwd) && !cwd.startsWith('\\\\')) return undefined
  return cwd
}

function sessionId(value: unknown): string | undefined {
  const candidate = normalizeResumeId(value)
  return candidate ?? undefined
}

function createParsedSession(identifier: string): ParsedSession {
  return { identifier, messageCount: 0, messageTimes: [], replyIds: new Set() }
}

function commandTitle(event: Extract<TranscriptEvent, { kind: 'command' }>): string {
  const name = event.name.startsWith('/') ? event.name : `/${event.name}`
  return event.args ? `${name} ${event.args}` : name
}

function addEvents(parsed: ParsedSession, events: TranscriptEvent[], provider: AgentProvider): void {
  for (const event of events) {
    if (event.kind === 'title') {
      const text = stringValue(event.text)
      if (!text) continue
      if (event.source === 'custom') parsed.customTitle = text
      else if (event.source === 'ai') parsed.aiTitle = text
      else parsed.summaryTitle = text
      continue
    }

    if (event.kind === 'command') {
      parsed.firstCommand ??= stringValue(commandTitle(event))
      continue
    }

    const text = stringValue(event.text)
    if (!text) continue
    let shouldCount = true
    if (event.kind === 'reply' && provider === 'claude' && event.messageId) {
      if (parsed.replyIds.has(event.messageId)) shouldCount = false
      else parsed.replyIds.add(event.messageId)
    }
    if (event.kind === 'prompt') parsed.firstPrompt ??= text
    if (shouldCount) parsed.messageCount += 1
    parsed.preview = text
    if (event.timestamp) parsed.messageTimes.push(event.timestamp)
  }
}

function addClassification(
  provider: AgentProvider,
  current: ParsedSession | null,
  classification: TranscriptRecordClassification,
): ParsedSession | null {
  const id = sessionId(classification.context.sessionId)
  const parsed = current ?? (id ? createParsedSession(id) : null)
  if (!parsed || (id && parsed.identifier !== id)) return current

  const cwd = normalizedCwd(classification.context.cwd)
  if (cwd && !parsed.cwd) parsed.cwd = cwd
  const model = stringValue(classification.context.model)
  if (model && !parsed.model) parsed.model = model
  addEvents(parsed, classification.events, provider)
  return parsed
}

async function listTranscriptFiles(rootPath: string): Promise<TranscriptFile[]> {
  const files: TranscriptFile[] = []
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > MAX_TRANSCRIPT_DEPTH || files.length >= MAX_TRANSCRIPT_FILES) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (files.length >= MAX_TRANSCRIPT_FILES) return
      if (entry.name.startsWith('.')) continue
      const candidate = join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(candidate, depth + 1)
        continue
      }
      if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.jsonl') continue
      try {
        const stats = await fs.stat(candidate)
        if (!stats.isFile() || stats.size > MAX_TRANSCRIPT_BYTES) continue
        files.push({ path: candidate })
      } catch {
        // Files can disappear while a provider is writing them.
      }
    }
  }

  await visit(rootPath, 0)
  return files
}

function cacheTranscript(path: string, size: number, mtimeMs: number, parsed: ParsedSession | null): void {
  transcriptCache.delete(path)
  transcriptCache.set(path, { size, mtimeMs, parsed })
  while (transcriptCache.size > MAX_TRANSCRIPT_FILES) {
    const oldestPath = transcriptCache.keys().next().value
    if (!oldestPath) break
    transcriptCache.delete(oldestPath)
  }
}

async function parseTranscriptFile(
  provider: AgentProvider,
  path: string,
): Promise<{ parsed: ParsedSession | null; modifiedAt: string } | null> {
  const initialStats = await fs.stat(path)
  if (!initialStats.isFile() || initialStats.size > MAX_TRANSCRIPT_BYTES) return null

  const cached = transcriptCache.get(path)
  if (cached && cached.size === initialStats.size && cached.mtimeMs === initialStats.mtimeMs) {
    transcriptCache.delete(path)
    transcriptCache.set(path, cached)
    return { parsed: cached.parsed, modifiedAt: initialStats.mtime.toISOString() }
  }

  const input = createReadStream(path, { encoding: 'utf8' })
  const lines = createInterface({ input, crlfDelay: Infinity })
  let parsed: ParsedSession | null = null
  let excluded = false

  try {
    for await (const line of lines) {
      if (!line || line.length > MAX_TRANSCRIPT_LINE_LENGTH) continue
      let row: unknown
      try {
        row = JSON.parse(line)
      } catch {
        // Providers may leave a partial final line while writing. Ignore it.
        continue
      }

      const classification = provider === 'claude'
        ? classifyClaudeRecord(row)
        : classifyCodexRecord(row)
      if (provider === 'codex' && classification.sessionMeta) {
        if (isCodexExecSession(classification.sessionMeta) || isCodexWorkerSession(classification.sessionMeta)) {
          excluded = true
          input.destroy()
          lines.close()
          break
        }
      }
      parsed = addClassification(provider, parsed, classification)
    }
  } finally {
    lines.close()
    input.destroy()
  }

  if (excluded || !parsed || parsed.messageCount === 0) parsed = null
  const finalStats = await fs.stat(path)
  if (finalStats.size === initialStats.size && finalStats.mtimeMs === initialStats.mtimeMs) {
    cacheTranscript(path, initialStats.size, initialStats.mtimeMs, parsed)
  }
  return { parsed, modifiedAt: initialStats.mtime.toISOString() }
}

async function canonicalDirectory(value: string | undefined): Promise<string | null> {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || (!isAbsolute(trimmed) && !/^[A-Za-z]:[\\/]/.test(trimmed) && !trimmed.startsWith('\\\\'))) return null
  try {
    const canonical = await fs.realpath(trimmed)
    const stats = await fs.stat(canonical)
    return stats.isDirectory() ? canonical : null
  } catch {
    return null
  }
}

function normalizeComparisonPath(value: string): string {
  const windowsPath = /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('//')
  const normalized = value === '/' || /^[A-Za-z]:[\\/]?$/.test(value)
    ? value.replace(/\\/g, sep)
    : value.replace(/[\\/]+$/, '').replace(/\\/g, sep)
  return windowsPath
    ? normalized.toLowerCase()
    : normalized
}

function pathWithinRoot(candidate: string, root: string): boolean {
  const normalizedCandidate = normalizeComparisonPath(candidate)
  const normalizedRoot = normalizeComparisonPath(root)
  if (normalizedCandidate === normalizedRoot) return true
  const windowsPath = /^[A-Za-z]:[\\/]/.test(normalizedRoot) || normalizedRoot.startsWith('\\\\') || normalizedRoot.startsWith('//')
  const relativePath = windowsPath
    ? win32.relative(normalizedRoot, normalizedCandidate)
    : relative(normalizedRoot, normalizedCandidate)
  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

function relativeCwdWithinRoot(candidate: string | undefined, root: string | undefined): string | undefined {
  if (!candidate || !root || !pathWithinRoot(candidate, root)) return undefined
  const normalizedCandidate = normalizeComparisonPath(candidate)
  const normalizedRoot = normalizeComparisonPath(root)
  const windowsPath = /^[A-Za-z]:[\\/]/.test(normalizedRoot) || normalizedRoot.startsWith('\\\\') || normalizedRoot.startsWith('//')
  const relativePath = windowsPath
    ? win32.relative(normalizedRoot, normalizedCandidate)
    : relative(normalizedRoot, normalizedCandidate)
  return relativePath ? relativePath.replace(/\\/g, '/') : '.'
}

async function canonicalCwd(value: string | undefined): Promise<string | undefined> {
  if (!value) return undefined
  try {
    const canonical = await fs.realpath(value)
    const stats = await fs.stat(canonical)
    return stats.isDirectory() ? canonical : undefined
  } catch {
    return resolve(value)
  }
}

function normalizeSearch(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return undefined
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase()
  return normalized ? normalized.slice(0, 200) : undefined
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return DEFAULT_HISTORY_RESULT_LIMIT
  return Math.min(value, MAX_HISTORY_RESULT_LIMIT)
}

function matchesSearch(item: AgentSessionHistoryItem, search: string | undefined): boolean {
  if (!search) return true
  const haystack = [item.identifier, item.title, item.preview, item.model].filter(Boolean).join(' ').toLowerCase()
  return haystack.includes(search)
}

function resultItem(
  parsed: ParsedSession,
  provider: AgentProvider,
  modifiedAt: string,
  presentationCwd: string | undefined,
): AgentSessionHistoryItem {
  const timestamps = parsed.messageTimes
  const startedAt = timestamps[0] ?? modifiedAt
  const lastActivityAt = timestamps.at(-1) ?? startedAt
  const title = parsed.customTitle ?? parsed.aiTitle ?? parsed.summaryTitle ?? parsed.firstPrompt ?? parsed.firstCommand
  return {
    identifier: parsed.identifier,
    provider,
    ...(presentationCwd ? { cwd: presentationCwd } : {}),
    startedAt,
    lastActivityAt,
    ...(title ? { title: title.slice(0, MAX_TITLE_LENGTH) } : {}),
    ...(parsed.preview ? { preview: parsed.preview.slice(0, MAX_PREVIEW_LENGTH) } : {}),
    ...(parsed.model ? { model: parsed.model.slice(0, 160) } : {}),
    messageCount: parsed.messageCount,
  }
}

async function readProviderSessionHistory(
  provider: AgentProvider,
  options: AgentHistoryReadOptions,
): Promise<AgentSessionHistoryResult> {
  const rootPath = options.rootPath ?? options.roots?.[provider] ?? getAgentProviderTranscriptRoot(provider, options.homeDirectory)
  const canonicalRoot = await canonicalDirectory(rootPath)
  if (!canonicalRoot) return { items: [], hasMore: false }
  const workspaceRoot = options.workspaceRoot === undefined
    ? undefined
    : await canonicalDirectory(options.workspaceRoot)
  if (options.workspaceRoot !== undefined && !workspaceRoot) return { items: [], hasMore: false }

  const search = normalizeSearch(options.search)
  const limit = normalizeLimit(options.limit)
  const files = await listTranscriptFiles(canonicalRoot)
  const sessions = new Map<string, AgentSessionHistoryItem>()

  for (const file of files) {
    try {
      const transcript = await parseTranscriptFile(provider, file.path)
      if (!transcript) continue
      const { parsed } = transcript
      if (!parsed) continue
      const cwd = await canonicalCwd(parsed.cwd)
      if (workspaceRoot && (!cwd || !pathWithinRoot(cwd, workspaceRoot))) continue
      const item = resultItem(parsed, provider, transcript.modifiedAt, relativeCwdWithinRoot(cwd, workspaceRoot ?? undefined))
      if (!matchesSearch(item, search)) continue
      const current = sessions.get(item.identifier)
      if (!current || current.lastActivityAt < item.lastActivityAt) sessions.set(item.identifier, item)
    } catch {
      // A malformed or pathological individual transcript must not abort the
      // rest of the provider history query.
      continue
    }
  }

  const sorted = [...sessions.values()].sort((left, right) => {
    const activity = right.lastActivityAt.localeCompare(left.lastActivityAt)
    return activity || left.identifier.localeCompare(right.identifier)
  })
  return {
    items: sorted.slice(0, limit),
    hasMore: sorted.length > limit,
  }
}

/** Find a visible session transcript without exposing its path to the renderer. */
export async function findAgentTranscriptFile(
  provider: AgentProvider,
  identifier: string,
  options: AgentHistoryReadOptions = {},
): Promise<string | null> {
  const normalizedIdentifier = normalizeResumeId(identifier)
  if (!normalizedIdentifier) return null

  const rootPath = options.rootPath ?? options.roots?.[provider] ?? getAgentProviderTranscriptRoot(provider, options.homeDirectory)
  const canonicalRoot = await canonicalDirectory(rootPath)
  if (!canonicalRoot) return null

  const workspaceRoot = options.workspaceRoot === undefined
    ? undefined
    : await canonicalDirectory(options.workspaceRoot)
  if (options.workspaceRoot !== undefined && !workspaceRoot) return null

  const files = await listTranscriptFiles(canonicalRoot)
  const likelyFiles = files.filter((file) => basename(file.path).includes(normalizedIdentifier))
  const remainingFiles = files.filter((file) => !basename(file.path).includes(normalizedIdentifier))

  for (const file of [...likelyFiles, ...remainingFiles]) {
    try {
      const transcript = await parseTranscriptFile(provider, file.path)
      const parsed = transcript?.parsed
      if (!parsed || parsed.identifier !== normalizedIdentifier) continue

      const cwd = await canonicalCwd(parsed.cwd)
      if (workspaceRoot && (!cwd || !pathWithinRoot(cwd, workspaceRoot))) continue
      return file.path
    } catch {
      // A damaged transcript must not prevent other files from matching the ID.
    }
  }

  return null
}

export function readClaudeSessionHistory(options: AgentHistoryReadOptions = {}): Promise<AgentSessionHistoryResult> {
  return readProviderSessionHistory('claude', options)
}

export function readCodexSessionHistory(options: AgentHistoryReadOptions = {}): Promise<AgentSessionHistoryResult> {
  return readProviderSessionHistory('codex', options)
}

export async function readAgentSessionHistory(
  options: AgentSessionHistoryOptions = {},
): Promise<AgentSessionHistoryResult> {
  if (options.provider) return readProviderSessionHistory(options.provider, options)
  const limit = normalizeLimit(options.limit)
  const [claude, codex] = await Promise.all([
    readProviderSessionHistory('claude', options),
    readProviderSessionHistory('codex', options),
  ])
  const items = [...claude.items, ...codex.items].sort((left, right) => {
    const activity = right.lastActivityAt.localeCompare(left.lastActivityAt)
    return activity || left.identifier.localeCompare(right.identifier)
  })
  return { items: items.slice(0, limit), hasMore: items.length > limit || claude.hasMore || codex.hasMore }
}

// Short names are convenient for service and test callers while preserving a
// descriptive API for IPC integrations.
export const readClaudeHistory = readClaudeSessionHistory
export const readCodexHistory = readCodexSessionHistory
export const readAgentHistory = readAgentSessionHistory

export { MAX_TRANSCRIPT_FILES }
