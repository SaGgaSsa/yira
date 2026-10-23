import { promises as fs } from 'node:fs'
import { dirname, relative, resolve, sep, win32 } from 'node:path'

import type { AgentProvider } from '@shared/types'
import { writeFileAtomic } from '@shared/atomicWrite'

const VERSION = 1
const FLUSH_DELAY_MS = 2_000
const MAX_ENTRIES = 20_000

/** Fully parsed session state, kept JSON-serializable for the index file. */
export interface StoredTranscriptSession {
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
  firstTime?: string
  lastTime?: string
  lastReplyId?: string
}

export interface StoredTranscriptHead {
  cwd?: string
}

export interface StoredTranscript {
  provider: AgentProvider
  size: number
  mtimeMs: number
  /** Bytes of complete transcript lines already consumed. */
  offset: number
  /** Up to 64 bytes ending at `offset`, base64; detects rewrites vs appends. */
  tail: string
  excluded: boolean
  head?: StoredTranscriptHead
  /**
   * Absent: never fully parsed yet (head probe only). `null`: fully parsed
   * with no visible messages, or excluded. Otherwise the serializable state.
   */
  session?: StoredTranscriptSession | null
}

interface SavedIndex {
  version: number
  files: Record<string, StoredTranscript>
}

let indexPath: string | null = null
let entries = new Map<string, StoredTranscript>()
let loadPromise: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let flushChain: Promise<void> = Promise.resolve()
let dirty = false

export function configureAgentHistoryIndex(path: string | null): void {
  cancelSaveTimer()
  indexPath = path
  entries = new Map()
  loadPromise = null
  dirty = false
}

export function ensureAgentHistoryIndexLoaded(): Promise<void> {
  if (!indexPath) return Promise.resolve()
  if (!loadPromise) loadPromise = loadFromDisk().catch(() => undefined)
  return loadPromise
}

export function getStoredTranscript(path: string): StoredTranscript | undefined {
  return entries.get(path)
}

export function forEachStoredTranscript(callback: (entry: StoredTranscript) => void): void {
  for (const entry of entries.values()) callback(entry)
}

export function setStoredTranscript(path: string, entry: StoredTranscript): void {
  entries.delete(path)
  entries.set(path, entry)
  evictOldestEntries()
  markChanged()
}

export function pruneStoredTranscripts(root: string, livePaths: Set<string>): void {
  let removed = false
  for (const path of entries.keys()) {
    if (livePaths.has(path)) continue
    if (!isPathWithinRoot(path, root)) continue
    entries.delete(path)
    removed = true
  }
  if (removed) markChanged()
}

export function clearAgentHistoryIndex(): void {
  cancelSaveTimer()
  entries = new Map()
  loadPromise = null
  dirty = false
}

export function flushAgentHistoryIndex(): Promise<void> {
  if (!indexPath) return Promise.resolve()
  cancelSaveTimer()
  const run = flushChain.catch(() => undefined).then(() => writeStore())
  flushChain = run
  return run
}

function cancelSaveTimer(): void {
  if (!saveTimer) return
  clearTimeout(saveTimer)
  saveTimer = null
}

function markChanged(): void {
  if (!indexPath) return
  dirty = true
  cancelSaveTimer()
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushAgentHistoryIndex().catch(() => undefined)
  }, FLUSH_DELAY_MS)
  if (typeof saveTimer.unref === 'function') saveTimer.unref()
}

async function writeStore(): Promise<void> {
  if (!dirty || !indexPath) return
  const saved: SavedIndex = { version: VERSION, files: Object.fromEntries(entries) }
  dirty = false
  try {
    await fs.mkdir(dirname(indexPath), { recursive: true })
    await writeFileAtomic(indexPath, JSON.stringify(saved))
  } catch (error) {
    dirty = true
    throw error
  }
}

async function loadFromDisk(): Promise<void> {
  if (!indexPath) return
  let parsed: unknown
  try {
    parsed = JSON.parse(await fs.readFile(indexPath, 'utf8'))
  } catch {
    return
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
  const saved = parsed as Partial<SavedIndex>
  if (saved.version !== VERSION || !saved.files || typeof saved.files !== 'object' || Array.isArray(saved.files)) return

  const loaded: Array<[string, StoredTranscript]> = []
  for (const [path, value] of Object.entries(saved.files)) {
    const entry = decodeEntry(value)
    if (entry) loaded.push([path, entry])
  }
  // Keep the newest entries when a corrupt or oversized file exceeds the cap.
  loaded.sort((left, right) => right[1].mtimeMs - left[1].mtimeMs)
  entries = new Map(loaded.slice(0, MAX_ENTRIES))
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function decodeEntry(value: unknown): StoredTranscript | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const provider = raw.provider
  if ((provider !== 'claude' && provider !== 'codex') || !isFiniteNumber(raw.size) || !isFiniteNumber(raw.mtimeMs)) return null
  if (!isFiniteNumber(raw.offset) || raw.size < 0 || raw.mtimeMs < 0 || raw.offset < 0) return null
  if (typeof raw.tail !== 'string' || typeof raw.excluded !== 'boolean') return null

  const entry: StoredTranscript = {
    provider,
    size: raw.size,
    mtimeMs: raw.mtimeMs,
    offset: raw.offset,
    tail: raw.tail,
    excluded: raw.excluded,
  }
  if (raw.head !== undefined) {
    if (!raw.head || typeof raw.head !== 'object' || Array.isArray(raw.head)) return null
    const head = raw.head as Record<string, unknown>
    if (head.cwd !== undefined && typeof head.cwd !== 'string') return null
    entry.head = head.cwd === undefined ? {} : { cwd: head.cwd }
  }
  if (raw.session !== undefined) {
    if (raw.session === null) {
      entry.session = null
    } else {
      const session = decodeSession(raw.session)
      if (!session) return null
      entry.session = session
    }
  }
  return entry
}

function decodeSession(value: unknown): StoredTranscriptSession | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.identifier !== 'string' || !raw.identifier) return null
  if (!isFiniteNumber(raw.messageCount) || raw.messageCount < 0) return null
  const session: StoredTranscriptSession = { identifier: raw.identifier, messageCount: raw.messageCount }
  for (const field of ['cwd', 'model', 'customTitle', 'aiTitle', 'summaryTitle', 'firstPrompt', 'firstCommand', 'preview', 'firstTime', 'lastTime', 'lastReplyId'] as const) {
    if (raw[field] === undefined) continue
    const text = optionalString(raw[field])
    if (text === undefined) return null
    session[field] = text
  }
  return session
}

function evictOldestEntries(): void {
  while (entries.size > MAX_ENTRIES) {
    let oldestPath: string | null = null
    let oldestTime = Infinity
    for (const [path, entry] of entries) {
      if (entry.mtimeMs < oldestTime) {
        oldestTime = entry.mtimeMs
        oldestPath = path
      }
    }
    if (!oldestPath) break
    entries.delete(oldestPath)
  }
}

function isPathWithinRoot(candidate: string, root: string): boolean {
  const pathApi = process.platform === 'win32' ? win32 : undefined
  const child = pathApi ? pathApi.resolve(candidate).toLowerCase() : resolve(candidate)
  const base = pathApi ? pathApi.resolve(root).toLowerCase() : resolve(root)
  if (child === base) return true
  const rel = pathApi ? pathApi.relative(base, child) : relative(base, child)
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !(pathApi ? pathApi.isAbsolute(rel) : rel.startsWith('/'))
}
