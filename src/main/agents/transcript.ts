import { createReadStream, promises as fs } from 'node:fs'
import { createInterface } from 'node:readline'

import type {
  AgentProvider,
  AgentSessionTranscriptQuery,
  AgentSessionTranscriptResult,
  AgentTranscriptEntry,
  AgentTranscriptEntryKind,
} from '@shared/types'
import { normalizeResumeId } from './providers'
import {
  findAgentTranscriptFile,
  MAX_TRANSCRIPT_BYTES,
  type AgentHistoryReadOptions,
} from './history'
import {
  classifyClaudeRecord,
  classifyCodexRecord,
  isCodexExecSession,
  isCodexWorkerSession,
  type TranscriptEvent,
} from './transcriptRecords'

export const DEFAULT_AGENT_TRANSCRIPT_LIMIT = 80
export const MAX_AGENT_TRANSCRIPT_LIMIT = 200
export const MAX_AGENT_TRANSCRIPT_ENTRY_BYTES = 32 * 1024
const MAX_TRANSCRIPT_LINE_LENGTH = 256 * 1024

interface PendingReply {
  entry: AgentTranscriptEntry
  messageId?: string
}

function emptyResult(): AgentSessionTranscriptResult {
  return { entries: [], start: 0, total: 0, found: false }
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return DEFAULT_AGENT_TRANSCRIPT_LIMIT
  }
  return Math.min(value, MAX_AGENT_TRANSCRIPT_LIMIT)
}

function normalizeBefore(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function truncateText(text: string): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, 'utf8') <= MAX_AGENT_TRANSCRIPT_ENTRY_BYTES) {
    return { text, truncated: false }
  }

  let bytes = 0
  let end = 0
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, 'utf8')
    if (bytes + characterBytes > MAX_AGENT_TRANSCRIPT_ENTRY_BYTES) break
    bytes += characterBytes
    end += character.length
  }
  return { text: text.slice(0, end), truncated: true }
}

function appendText(entry: AgentTranscriptEntry, text: string): void {
  const candidate = entry.text ? `${entry.text}\n\n${text}` : text
  const bounded = truncateText(candidate)
  entry.text = bounded.text
  if (bounded.truncated) entry.truncated = true
}

function commandText(event: Extract<TranscriptEvent, { kind: 'command' }>): string {
  const name = event.name.startsWith('/') ? event.name : `/${event.name}`
  return event.args ? `${name} ${event.args}` : name
}

function createEntry(event: TranscriptEvent): AgentTranscriptEntry | null {
  if (event.kind === 'title') return null

  const kind: AgentTranscriptEntryKind = event.kind
  const text = event.kind === 'command' ? commandText(event) : event.text
  const bounded = truncateText(text)
  return {
    kind,
    text: bounded.text,
    ...(event.timestamp ? { timestamp: event.timestamp } : {}),
    ...(bounded.truncated ? { truncated: true } : {}),
  }
}

function isValidProvider(value: unknown): value is AgentProvider {
  return value === 'claude' || value === 'codex'
}

export async function readAgentSessionTranscript(
  query: AgentSessionTranscriptQuery,
  options: AgentHistoryReadOptions = {},
): Promise<AgentSessionTranscriptResult> {
  try {
    if (!query || !isValidProvider(query.provider)) return emptyResult()
    const identifier = normalizeResumeId(query.identifier)
    if (!identifier) return emptyResult()

    const filePath = await findAgentTranscriptFile(query.provider, identifier, options)
    if (!filePath) return emptyResult()

    const stats = await fs.stat(filePath)
    if (!stats.isFile() || stats.size > MAX_TRANSCRIPT_BYTES) return emptyResult()

    const limit = normalizeLimit(query.limit)
    const before = normalizeBefore(query.before)
    const entries: AgentTranscriptEntry[] = []
    const recentEntries: AgentTranscriptEntry[] = []
    let total = 0
    let pendingReply: PendingReply | null = null
    let excluded = false

    const keepEntry = (entry: AgentTranscriptEntry): void => {
      const index = total
      total += 1

      if (limit > 0) {
        recentEntries.push(entry)
        if (recentEntries.length > limit) recentEntries.shift()
      }

      if (before !== undefined && index >= Math.max(0, before - limit) && index < before) {
        entries.push(entry)
      }
    }

    const flushReply = (): void => {
      if (!pendingReply) return
      keepEntry(pendingReply.entry)
      pendingReply = null
    }

    const addEvent = (event: TranscriptEvent): void => {
      if (event.kind === 'title') return

      if (event.kind !== 'reply') {
        flushReply()
        const entry = createEntry(event)
        if (entry) keepEntry(entry)
        return
      }

      if (pendingReply && event.messageId && pendingReply.messageId === event.messageId) {
        appendText(pendingReply.entry, event.text)
        return
      }

      flushReply()
      const entry = createEntry(event)
      if (entry) pendingReply = { entry, ...(event.messageId ? { messageId: event.messageId } : {}) }
    }

    const input = createReadStream(filePath, { encoding: 'utf8' })
    const lines = createInterface({ input, crlfDelay: Infinity })
    try {
      for await (const line of lines) {
        if (!line || line.length > MAX_TRANSCRIPT_LINE_LENGTH) continue

        let row: unknown
        try {
          row = JSON.parse(line)
        } catch {
          continue
        }

        const classification = query.provider === 'claude'
          ? classifyClaudeRecord(row)
          : classifyCodexRecord(row)
        const recordIdentifier = normalizeResumeId(classification.context.sessionId)
        if (recordIdentifier && recordIdentifier !== identifier) continue

        if (query.provider === 'codex' && classification.sessionMeta) {
          if (isCodexExecSession(classification.sessionMeta) || isCodexWorkerSession(classification.sessionMeta)) {
            excluded = true
            input.destroy()
            lines.close()
            break
          }
        }
        for (const event of classification.events) addEvent(event)
      }
    } finally {
      lines.close()
      input.destroy()
    }

    flushReply()
    if (excluded || total === 0) return emptyResult()

    const end = before === undefined ? total : Math.min(before, total)
    const start = Math.max(0, end - limit)
    const page = before === undefined || before > total ? recentEntries : entries
    return { entries: page, start, total, found: true }
  } catch {
    return emptyResult()
  }
}
