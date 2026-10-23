import { createReadStream, promises as fs } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'
import { createInterface } from 'node:readline'

import { mapWithConcurrency } from '@shared/mapWithConcurrency'
import type {
  AgentProvider,
  AgentSessionHistoryItem,
  AgentSessionHistoryResult,
} from '@shared/types'
import {
  clearAgentHistoryIndex,
  ensureAgentHistoryIndexLoaded,
  forEachStoredTranscript,
  getStoredTranscript,
  pruneStoredTranscripts,
  setStoredTranscript,
  type StoredTranscriptSession,
} from './historyIndex'
import { getAgentProviderTranscriptRoot, normalizeResumeId } from './providers'
import {
  DEFAULT_HISTORY_RESULT_LIMIT,
  MAX_HISTORY_OFFSET,
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
const MAX_LISTED_TRANSCRIPT_FILES = 20_000
const MAX_HEAD_LINES = 50
const MAX_TRANSCRIPT_DEPTH = 8
const TRANSCRIPT_PARSE_CONCURRENCY = 8
const INCREMENTAL_READ_BYTES = 1024 * 1024
const TAIL_FOOTPRINT_BYTES = 64
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
  offset?: number
  limit?: number
}

export interface AgentSessionHistoryOptions extends AgentHistoryReadOptions {
  provider?: AgentProvider
}

// The parsed state doubles as the persisted index payload, so it must stay
// JSON-serializable and bounded instead of growing with the transcript.
type ParsedSession = StoredTranscriptSession

interface TranscriptFile {
  path: string
  size: number
  mtimeMs: number
}

/** Cheap cwd/exclusion probe taken from the first transcript lines. */
interface TranscriptHead {
  cwd?: string
  excluded: boolean
}

const readStats = { bytesRead: 0 }

export function clearAgentHistoryCache(): void {
  clearAgentHistoryIndex()
  readStats.bytesRead = 0
}

export function getAgentHistoryCacheStats(): { transcripts: number; heads: number } {
  let transcripts = 0
  let heads = 0
  forEachStoredTranscript((entry) => {
    if (entry.session !== undefined) transcripts += 1
    if (entry.head) heads += 1
  })
  return { transcripts, heads }
}

/** Bytes read from transcript files since the last cache clear. */
export function getAgentHistoryReadStats(): { bytesRead: number } {
  return { bytesRead: readStats.bytesRead }
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
  return { identifier, messageCount: 0 }
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
      // Claude writes the blocks of one assistant message in consecutive
      // records sharing the same message.id, so comparing against the last
      // reply id is enough to keep duplicate blocks from counting twice.
      if (parsed.lastReplyId === event.messageId) shouldCount = false
      else parsed.lastReplyId = event.messageId
    }
    if (event.kind === 'prompt') parsed.firstPrompt ??= text
    if (shouldCount) parsed.messageCount += 1
    parsed.preview = text
    if (event.timestamp) {
      parsed.firstTime ??= event.timestamp
      parsed.lastTime = event.timestamp
    }
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
    if (depth > MAX_TRANSCRIPT_DEPTH || files.length >= MAX_LISTED_TRANSCRIPT_FILES) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (files.length >= MAX_LISTED_TRANSCRIPT_FILES) return
      if (entry.name.startsWith('.')) continue
      const candidate = join(directory, entry.name)
      if (entry.isDirectory()) {
        // Claude sidechain transcripts share the parent session id and parse
        // to zero visible messages, so listing them only wastes reads.
        if (entry.name.toLowerCase() === 'subagents') continue
        await visit(candidate, depth + 1)
        continue
      }
      if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.jsonl') continue
      try {
        const stats = await fs.stat(candidate)
        if (!stats.isFile() || stats.size > MAX_TRANSCRIPT_BYTES) continue
        files.push({ path: candidate, size: stats.size, mtimeMs: stats.mtimeMs })
      } catch {
        // Files can disappear while a provider is writing them.
      }
    }
  }

  await visit(rootPath, 0)
  // Paginated reads walk sessions newest first; the path tie-break keeps that
  // order stable across runs for equally timestamped files.
  files.sort((left, right) => right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path))
  return files
}

/** Reads up to 64 base64-encoded bytes of the file ending at `offset`. */
async function readTailFootprint(path: string, offset: number): Promise<string> {
  if (offset <= 0) return ''
  const length = Math.min(TAIL_FOOTPRINT_BYTES, offset)
  const buffer = Buffer.alloc(length)
  const handle = await fs.open(path, 'r')
  try {
    const { bytesRead } = await handle.read(buffer, 0, length, offset - length)
    if (bytesRead <= 0) return ''
    readStats.bytesRead += bytesRead
    return buffer.subarray(0, bytesRead).toString('base64')
  } finally {
    await handle.close()
  }
}

/**
 * Reads complete lines from [startOffset, endOffset) and hands each one to
 * `onLine`, returning true from the callback to stop early. The partial line
 * at the end is left unconsumed: the returned offset lands after the last
 * line break, so a provider finishing that line is picked up on the next
 * read instead of being counted twice. Lines longer than
 * MAX_TRANSCRIPT_LINE_LENGTH are skipped whole without buffering them.
 */
async function readTranscriptLines(
  path: string,
  startOffset: number,
  endOffset: number,
  onLine: (line: string) => boolean,
): Promise<number> {
  if (endOffset <= startOffset) return startOffset
  const handle = await fs.open(path, 'r')
  try {
    const chunk = Buffer.alloc(Math.min(INCREMENTAL_READ_BYTES, endOffset - startOffset))
    const partial: Buffer[] = []
    let partialLength = 0
    let skipping = false
    let position = startOffset
    let consumed = startOffset
    while (position < endOffset) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, position)
      if (bytesRead <= 0) break
      readStats.bytesRead += bytesRead
      const slice = chunk.subarray(0, bytesRead)
      let lineStart = 0
      let stopped = false
      for (let index = 0; index < slice.length && !stopped; index += 1) {
        if (slice[index] !== 0x0a) continue
        const segment = slice.subarray(lineStart, index)
        lineStart = index + 1
        consumed = position + lineStart
        if (skipping) {
          skipping = false
          continue
        }
        if (partialLength + segment.length > MAX_TRANSCRIPT_LINE_LENGTH) {
          skipping = true
          partial.length = 0
          partialLength = 0
          continue
        }
        if (segment.length > 0 || partial.length > 0) {
          partial.push(segment)
          partialLength += segment.length
        }
        if (partialLength === 0) continue
        stopped = onLine(Buffer.concat(partial).toString('utf8'))
        partial.length = 0
        partialLength = 0
      }
      if (stopped) return consumed
      // Bytes after the final line break start the next line unless the
      // oversized line they belong to is being skipped.
      if (!skipping) {
        const trailing = slice.subarray(lineStart)
        if (trailing.length > 0) {
          partial.push(trailing)
          partialLength += trailing.length
          if (partialLength > MAX_TRANSCRIPT_LINE_LENGTH) {
            skipping = true
            partial.length = 0
            partialLength = 0
          }
        }
      }
      position += bytesRead
    }
    return consumed
  } finally {
    await handle.close()
  }
}

async function parseTranscriptFile(
  provider: AgentProvider,
  file: TranscriptFile,
): Promise<{ parsed: ParsedSession | null; modifiedAt: string } | null> {
  // The listing already stat'ed the file; reuse that snapshot instead of
  // paying for a second syscall before every read.
  if (file.size > MAX_TRANSCRIPT_BYTES) return null
  const modifiedAt = new Date(file.mtimeMs).toISOString()

  const stored = getStoredTranscript(file.path)
  const storedSession = stored && stored.provider === provider ? stored.session : undefined
  const storedHead = stored && stored.provider === provider ? stored.head : undefined

  // The size and mtime snapshot check comes before the footprint probe so an
  // untouched file is answered without touching disk. A missing session marks
  // a head-only entry that still awaits its first full parse.
  if (stored && storedSession !== undefined && file.size === stored.size && file.mtimeMs === stored.mtimeMs) {
    return { parsed: storedSession ? { ...storedSession } : null, modifiedAt }
  }

  // Resume from the stored offset only when full session state survived:
  // rewritten, truncated, excluded, or never-parsed files start from zero.
  let startOffset = 0
  let parsed: ParsedSession | null = null
  if (
    stored && storedSession && !stored.excluded &&
    file.size > stored.size && file.size >= stored.offset && stored.offset > 0 &&
    await readTailFootprint(file.path, stored.offset) === stored.tail
  ) {
    startOffset = stored.offset
    parsed = { ...storedSession }
  }

  let excluded = false
  let consumed: number
  try {
    consumed = await readTranscriptLines(file.path, startOffset, file.size, (line) => {
      let row: unknown
      try {
        row = JSON.parse(line)
      } catch {
        // Providers may leave a partial final line while writing. Ignore it.
        return false
      }

      const classification = provider === 'claude'
        ? classifyClaudeRecord(row)
        : classifyCodexRecord(row)
      if (provider === 'codex' && classification.sessionMeta) {
        if (isCodexExecSession(classification.sessionMeta) || isCodexWorkerSession(classification.sessionMeta)) {
          excluded = true
          return true
        }
      }
      parsed = addClassification(provider, parsed, classification)
      return false
    })
  } catch {
    // A read failure is reported like any other malformed transcript.
    return null
  }

  if (excluded || !parsed || parsed.messageCount === 0) parsed = null

  // A final stat keeps the old mid-read existence check: the entry below
  // stores the listing snapshot, and progress through `consumed` stays valid
  // even when the provider appended while we read, because new data can only
  // land after the consumed offset.
  const finalStats = await fs.stat(file.path).catch(() => null)
  if (!finalStats) return null
  setStoredTranscript(file.path, {
    provider,
    size: file.size,
    mtimeMs: file.mtimeMs,
    offset: consumed,
    tail: await readTailFootprint(file.path, consumed),
    excluded,
    head: storedHead,
    session: parsed ? { ...parsed } : null,
  })
  return { parsed, modifiedAt }
}

/** A saved head stays valid while its prefix bytes are still in place. */
async function headEntryMatches(stored: { size: number; mtimeMs: number; offset: number; tail: string }, file: TranscriptFile): Promise<boolean> {
  if (file.size < stored.offset) return false
  if (file.size === stored.size && file.mtimeMs === stored.mtimeMs) return true
  // A zero offset carries no footprint, so head-only entries only trust
  // their own size and mtime snapshot.
  if (stored.offset === 0) return false
  return await readTailFootprint(file.path, stored.offset) === stored.tail
}

async function readTranscriptHead(
  provider: AgentProvider,
  file: TranscriptFile,
): Promise<TranscriptHead> {
  const stored = getStoredTranscript(file.path)
  if (stored && stored.provider === provider) {
    // A fully parsed copy already carries the session cwd; transcripts only
    // grow, so that prefix stays valid across later appends.
    if (stored.session) {
      return stored.session.cwd
        ? { cwd: stored.session.cwd, excluded: false }
        : { excluded: false }
    }
    if (await headEntryMatches(stored, file)) {
      return stored.head?.cwd
        ? { cwd: stored.head.cwd, excluded: stored.excluded }
        : { excluded: stored.excluded }
    }
  }

  const input = createReadStream(file.path, { encoding: 'utf8' })
  const lines = createInterface({ input, crlfDelay: Infinity })
  let head: TranscriptHead = { excluded: false }
  let inspected = 0
  try {
    for await (const line of lines) {
      inspected += 1
      if (line && line.length <= MAX_TRANSCRIPT_LINE_LENGTH) {
        let row: unknown
        try {
          row = JSON.parse(line)
        } catch {
          // Providers may leave a partial final line while writing. Ignore it.
          row = undefined
        }
        if (row !== undefined) {
          const classification = provider === 'claude'
            ? classifyClaudeRecord(row)
            : classifyCodexRecord(row)
          if (provider === 'codex' && classification.sessionMeta) {
            if (isCodexExecSession(classification.sessionMeta) || isCodexWorkerSession(classification.sessionMeta)) {
              input.destroy()
              head = { excluded: true }
              break
            }
          }
          const cwd = normalizedCwd(classification.context.cwd)
          if (cwd) {
            head = { cwd, excluded: false }
            break
          }
        }
      }
      if (inspected >= MAX_HEAD_LINES) break
    }
  } finally {
    lines.close()
    input.destroy()
  }

  await fs.stat(file.path)
  // The probe only claims the prefix, so the entry restarts from a clean
  // offset and lets the next full parse fill in session state.
  setStoredTranscript(file.path, {
    provider,
    size: file.size,
    mtimeMs: file.mtimeMs,
    offset: 0,
    tail: '',
    excluded: head.excluded,
    head: head.cwd ? { cwd: head.cwd } : {},
  })
  return head
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

type CanonicalCwdResolver = (value: string | undefined) => Promise<string | undefined>

function createCanonicalCwdResolver(): CanonicalCwdResolver {
  // Transcripts commonly repeat a cwd; resolve each distinct path once per query.
  const cache = new Map<string, Promise<string | undefined>>()
  return (value) => {
    if (!value) return Promise.resolve(undefined)
    const cached = cache.get(value)
    if (cached) return cached
    const resolved = canonicalCwd(value)
    cache.set(value, resolved)
    return resolved
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

function normalizeOffset(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return 0
  return Math.min(value, MAX_HISTORY_OFFSET)
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
  const startedAt = parsed.firstTime ?? modifiedAt
  const lastActivityAt = parsed.lastTime ?? startedAt
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
  await ensureAgentHistoryIndexLoaded()
  const rootPath = options.rootPath ?? options.roots?.[provider] ?? getAgentProviderTranscriptRoot(provider, options.homeDirectory)
  const canonicalRoot = await canonicalDirectory(rootPath)
  if (!canonicalRoot) return { items: [], hasMore: false }
  const workspaceRoot = options.workspaceRoot === undefined
    ? undefined
    : await canonicalDirectory(options.workspaceRoot)
  if (options.workspaceRoot !== undefined && !workspaceRoot) return { items: [], hasMore: false }

  const search = normalizeSearch(options.search)
  const limit = normalizeLimit(options.limit)
  const offset = normalizeOffset(options.offset)
  // One extra item beyond the requested window settles hasMore without a
  // second pass over the provider roots.
  const target = offset + limit + 1
  const files = await listTranscriptFiles(canonicalRoot)
  pruneStoredTranscripts(canonicalRoot, new Set(files.map((file) => file.path)))
  const resolveCwd = createCanonicalCwdResolver()
  const seen = new Set<string>()
  const collected: AgentSessionHistoryItem[] = []

  // Files arrive newest first, so stop as soon as the page plus the hasMore
  // sentinel is complete instead of parsing the remaining transcripts.
  for (
    let start = 0;
    start < files.length && collected.length < target;
    start += TRANSCRIPT_PARSE_CONCURRENCY
  ) {
    const batch = files.slice(start, start + TRANSCRIPT_PARSE_CONCURRENCY)
    const batchItems = await mapWithConcurrency(batch, TRANSCRIPT_PARSE_CONCURRENCY, async (file): Promise<AgentSessionHistoryItem | null> => {
      try {
        if (workspaceRoot) {
          const head = await readTranscriptHead(provider, file)
          if (head.excluded) return null
          const headCwd = head.cwd ? await resolveCwd(head.cwd) : undefined
          if (headCwd && !pathWithinRoot(headCwd, workspaceRoot)) return null
          // A head without a cwd still gets the full parse and filter below.
        }
        const transcript = await parseTranscriptFile(provider, file)
        if (!transcript) return null
        const { parsed } = transcript
        if (!parsed) return null
        const cwd = await resolveCwd(parsed.cwd)
        if (workspaceRoot && (!cwd || !pathWithinRoot(cwd, workspaceRoot))) return null
        const item = resultItem(parsed, provider, transcript.modifiedAt, relativeCwdWithinRoot(cwd, workspaceRoot ?? undefined))
        return matchesSearch(item, search) ? item : null
      } catch {
        // A malformed or pathological individual transcript must not abort the
        // rest of the provider history query.
        return null
      }
    })

    // Batch results keep file order, so the first sighting of an identifier is
    // the one from the newest file.
    for (const item of batchItems) {
      if (!item || seen.has(item.identifier)) continue
      seen.add(item.identifier)
      collected.push(item)
    }
  }

  return {
    items: collected.slice(offset, offset + limit),
    hasMore: collected.length > offset + limit,
  }
}

/** Find a visible session transcript without exposing its path to the renderer. */
export async function findAgentTranscriptFile(
  provider: AgentProvider,
  identifier: string,
  options: AgentHistoryReadOptions = {},
): Promise<string | null> {
  await ensureAgentHistoryIndexLoaded()
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
  pruneStoredTranscripts(canonicalRoot, new Set(files.map((file) => file.path)))
  const likelyFiles = files.filter((file) => basename(file.path).includes(normalizedIdentifier))
  const remainingFiles = files.filter((file) => !basename(file.path).includes(normalizedIdentifier))
  const resolveCwd = createCanonicalCwdResolver()

  for (const file of [...likelyFiles, ...remainingFiles]) {
    try {
      const transcript = await parseTranscriptFile(provider, file)
      const parsed = transcript?.parsed
      if (!parsed || parsed.identifier !== normalizedIdentifier) continue

      const cwd = await resolveCwd(parsed.cwd)
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
  const offset = normalizeOffset(options.offset)
  const limit = normalizeLimit(options.limit)
  // Each provider only supplies the merged window's share; the sort below
  // slices the page without parsing more provider transcripts.
  const perProviderLimit = Math.min(offset + limit, MAX_HISTORY_OFFSET + MAX_HISTORY_RESULT_LIMIT)
  const [claude, codex] = await Promise.all([
    readProviderSessionHistory('claude', { ...options, offset: 0, limit: perProviderLimit }),
    readProviderSessionHistory('codex', { ...options, offset: 0, limit: perProviderLimit }),
  ])
  const items = [...claude.items, ...codex.items].sort((left, right) => {
    const activity = right.lastActivityAt.localeCompare(left.lastActivityAt)
    return activity || left.identifier.localeCompare(right.identifier)
  })
  return {
    items: items.slice(offset, offset + limit),
    hasMore: items.length > offset + limit || claude.hasMore || codex.hasMore,
  }
}

// Short names are convenient for service and test callers while preserving a
// descriptive API for IPC integrations.
export const readClaudeHistory = readClaudeSessionHistory
export const readCodexHistory = readCodexSessionHistory
export const readAgentHistory = readAgentSessionHistory

export { MAX_TRANSCRIPT_FILES }
