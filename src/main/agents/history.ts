import { promises as fs } from 'node:fs'
import { extname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path'

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

const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024
const MAX_TRANSCRIPT_LINE_LENGTH = 256 * 1024
const MAX_TRANSCRIPT_FILES = 1_000
const MAX_TRANSCRIPT_DEPTH = 8
const MAX_TITLE_LENGTH = 120
const MAX_PREVIEW_LENGTH = 280
const MAX_CONTENT_DEPTH = 32

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
  title?: string
  preview?: string
  messageCount: number
  messageTimes: string[]
}

interface TranscriptFile {
  path: string
  modifiedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown, maxLength = 1_024): string | undefined {
  // Tabs, line feeds, and carriage returns are ordinary in provider message
  // bodies. Normalize those whitespace controls below, while rejecting other
  // control characters that should never reach renderer-facing metadata.
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f]/.test(value)) return undefined
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, maxLength) : undefined
}

function timestampValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1_000 : value
    const date = new Date(milliseconds)
    return Number.isNaN(date.valueOf()) ? undefined : date.toISOString()
  }
  if (typeof value !== 'string' || !value.trim()) return undefined
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString()
}

function readTimestamp(row: Record<string, unknown>): string | undefined {
  return timestampValue(row.timestamp)
    ?? timestampValue(row.createdAt)
    ?? timestampValue(row.created_at)
    ?? timestampValue(row.updatedAt)
    ?? timestampValue(row.updated_at)
}

function readNestedTimestamp(row: Record<string, unknown>, payload?: Record<string, unknown>): string | undefined {
  return readTimestamp(row) ?? (payload ? readTimestamp(payload) : undefined)
}

function textFromContent(value: unknown, depth = 0): string | undefined {
  if (depth > MAX_CONTENT_DEPTH) return undefined
  if (typeof value === 'string') return stringValue(value)
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => {
        if (!isRecord(entry)) return undefined
        const type = typeof entry.type === 'string' ? entry.type : ''
        if (type && type !== 'text' && type !== 'output_text' && type !== 'input_text') return undefined
        return textFromContent(entry.text ?? entry.content, depth + 1)
      })
      .filter((entry): entry is string => Boolean(entry))
    return stringValue(parts.join(' '))
  }
  if (isRecord(value)) return textFromContent(value.text ?? value.content ?? value.message, depth + 1)
  return undefined
}

function messageText(row: Record<string, unknown>): string | undefined {
  const message = isRecord(row.message) ? row.message : undefined
  return textFromContent(message?.content ?? message?.text ?? row.content ?? row.text ?? row.message)
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

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = stringValue(value)
    if (normalized) return normalized
  }
  return undefined
}

function addMessage(parsed: ParsedSession, text: string | undefined, timestamp: string | undefined): void {
  // A role marker without readable content is usually a partial or
  // provider-internal record. Do not let it make an otherwise incomplete
  // transcript look like a valid session.
  if (!text) return
  parsed.messageCount += 1
  parsed.title ??= text
  parsed.preview = text
  if (timestamp) parsed.messageTimes.push(timestamp)
}

function parseClaudeRows(rows: unknown[]): ParsedSession | null {
  let parsed: ParsedSession | null = null
  for (const value of rows) {
    if (!isRecord(value)) continue
    const type = typeof value.type === 'string' ? value.type.toLowerCase() : ''
    const message = isRecord(value.message) ? value.message : undefined
    const id = sessionId(value.sessionId ?? value.session_id ?? (type === 'system' ? value.id : undefined))
    if (id && !parsed) parsed = { identifier: id, messageCount: 0, messageTimes: [] }
    if (!parsed) continue
    if (id && parsed.identifier !== id) continue

    const cwd = normalizedCwd(value.cwd)
    if (cwd && !parsed.cwd) parsed.cwd = cwd
    const model = firstString(value.model, message?.model)
    if (model && !parsed.model) parsed.model = model

    if (type === 'user' || type === 'assistant') {
      const role = stringValue(message?.role ?? value.role)?.toLowerCase()
      if (role && role !== type) continue
      addMessage(parsed, messageText(value), readTimestamp(value))
    } else if (type === 'summary' || type === 'title') {
      parsed.title ??= firstString(value.summary, value.title, value.text)
    }
  }

  return parsed && parsed.messageCount > 0 ? parsed : null
}

function parseCodexRows(rows: unknown[]): ParsedSession | null {
  let parsed: ParsedSession | null = null
  for (const value of rows) {
    if (!isRecord(value)) continue
    const type = typeof value.type === 'string' ? value.type.toLowerCase() : ''
    const payload = isRecord(value.payload) ? value.payload : undefined

    if (type === 'session_meta') {
      const id = sessionId(payload?.id ?? payload?.session_id ?? value.sessionId ?? value.session_id)
      if (id && !parsed) parsed = { identifier: id, messageCount: 0, messageTimes: [] }
      if (parsed && id && parsed.identifier !== id) continue
      if (parsed) {
        const cwd = normalizedCwd(payload?.cwd ?? value.cwd)
        if (cwd && !parsed.cwd) parsed.cwd = cwd
        const model = firstString(payload?.model, value.model)
        if (model && !parsed.model) parsed.model = model
      }
      continue
    }

    const id = sessionId(value.sessionId ?? value.session_id ?? payload?.sessionId ?? payload?.session_id)
    if (id && !parsed) parsed = { identifier: id, messageCount: 0, messageTimes: [] }
    if (!parsed) continue
    if (id && parsed.identifier !== id) continue

    if (type === 'turn_context' && payload) {
      const cwd = normalizedCwd(payload.cwd)
      if (cwd && !parsed.cwd) parsed.cwd = cwd
      const model = firstString(payload.model, payload.model_name)
      if (model && !parsed.model) parsed.model = model
    }
    if (type === 'event_msg' && payload?.type === 'user_message') {
      addMessage(parsed, textFromContent(payload.message), readNestedTimestamp(value, payload))
      continue
    }
    if (type === 'response_item' && payload?.type === 'message') {
      const role = stringValue(payload.role)?.toLowerCase()
      if (role === 'assistant' || role === 'user') {
        addMessage(parsed, textFromContent(payload.content ?? payload.message), readNestedTimestamp(value, payload))
      }
      continue
    }
    if (type === 'message') {
      const role = stringValue(value.role ?? payload?.role)?.toLowerCase()
      if (role === 'assistant' || role === 'user') {
        addMessage(parsed, messageText(value), readNestedTimestamp(value, payload))
      }
    }
  }

  return parsed && parsed.messageCount > 0 ? parsed : null
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
        files.push({ path: candidate, modifiedAt: stats.mtime.toISOString() })
      } catch {
        // Files can disappear while a provider is writing them.
      }
    }
  }

  await visit(rootPath, 0)
  return files
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
  return {
    identifier: parsed.identifier,
    provider,
    ...(presentationCwd ? { cwd: presentationCwd } : {}),
    startedAt,
    lastActivityAt,
    ...(parsed.title ? { title: parsed.title.slice(0, MAX_TITLE_LENGTH) } : {}),
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
      const text = await fs.readFile(file.path, 'utf8')
      if (Buffer.byteLength(text, 'utf8') > MAX_TRANSCRIPT_BYTES) continue
      const rows: unknown[] = []
      for (const line of text.split(/\r?\n/)) {
        if (!line || line.length > MAX_TRANSCRIPT_LINE_LENGTH) continue
        try {
          rows.push(JSON.parse(line))
        } catch {
          // Providers may leave a partial final line while writing. Ignore it.
        }
      }
      const parsed = provider === 'claude' ? parseClaudeRows(rows) : parseCodexRows(rows)
      if (!parsed) continue
      const cwd = await canonicalCwd(parsed.cwd)
      if (workspaceRoot && (!cwd || !pathWithinRoot(cwd, workspaceRoot))) continue
      const item = resultItem(parsed, provider, file.modifiedAt, relativeCwdWithinRoot(cwd, workspaceRoot ?? undefined))
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

export { MAX_TRANSCRIPT_BYTES, MAX_TRANSCRIPT_FILES }
