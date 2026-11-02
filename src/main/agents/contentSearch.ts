import { createReadStream, promises as fs } from 'node:fs'
import { createInterface } from 'node:readline'

import type { AgentProvider, AgentSessionHistoryItem } from '@shared/types'
import { findAgentTranscriptFile, MAX_TRANSCRIPT_BYTES, readAgentSessionHistory, type AgentHistoryRoots } from './history'
import { isAgentProvider } from './query'

const MIN_QUERY_LENGTH = 2
const MAX_QUERY_LENGTH = 200
const MAX_TERMS = 8
const MAX_WORKSPACE_ROOTS = 50
const DEFAULT_MATCH_LIMIT = 10
const MAX_MATCH_LIMIT = 20
const HISTORY_PAGE_SIZE = 50
const MAX_CANDIDATES = 100
const MAX_LINE_LENGTH = 256 * 1024
const MAX_SCANNED_BYTES = 256 * 1024 * 1024
const MAX_LEAF_LENGTH = 20_000
const MAX_LEAF_DEPTH = 64
const MAX_SNIPPETS = 2
const SNIPPET_RADIUS = 110
const SKIPPED_KEYS = new Set(['signature', 'id', 'uuid', 'parentUuid'])

export interface SessionContentSearchInput {
  query: string
  /** Search sessions whose cwd is inside any of these (1..50). */
  workspaceRoots: string[]
  provider?: AgentProvider
  /** Matches to return, default 10, max 20. */
  limit?: number
  /** Test override for transcript roots, forwarded to the history functions as `roots`. */
  roots?: AgentHistoryRoots
  homeDirectory?: string
}

export interface SessionContentMatch {
  provider: AgentProvider
  identifier: string
  workspaceRoot: string
  title?: string
  lastActivityAt: string
  /** Matching transcript lines; a title or preview match counts once. */
  matchCount: number
  snippets: string[]
}

interface Candidate {
  item: AgentSessionHistoryItem
  workspaceRoot: string
}

interface ValidatedSearch {
  terms: string[]
  workspaceRoots: string[]
  provider?: AgentProvider
  limit: number
}

function validateInput(input: SessionContentSearchInput): ValidatedSearch {
  const query = typeof input.query === 'string' ? input.query.trim() : ''
  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
    throw new Error(`Search query must be ${MIN_QUERY_LENGTH} to ${MAX_QUERY_LENGTH} characters`)
  }
  const roots = input.workspaceRoots
  if (
    !Array.isArray(roots) || roots.length < 1 || roots.length > MAX_WORKSPACE_ROOTS ||
    roots.some((root) => typeof root !== 'string' || !root.trim())
  ) {
    throw new Error(`Search needs 1 to ${MAX_WORKSPACE_ROOTS} workspace roots`)
  }
  if (input.provider !== undefined && !isAgentProvider(input.provider)) {
    throw new Error('Invalid agent provider')
  }
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1)) {
    throw new Error('Search limit must be a positive integer')
  }
  return {
    terms: query.toLowerCase().split(/\s+/).slice(0, MAX_TERMS),
    workspaceRoots: roots,
    ...(input.provider ? { provider: input.provider } : {}),
    limit: Math.min(input.limit ?? DEFAULT_MATCH_LIMIT, MAX_MATCH_LIMIT),
  }
}

async function collectCandidates(search: ValidatedSearch, input: SessionContentSearchInput): Promise<Candidate[]> {
  const perRoot = await Promise.all(search.workspaceRoots.map(async (workspaceRoot) => {
    const history = await readAgentSessionHistory({
      workspaceRoot,
      provider: search.provider,
      limit: HISTORY_PAGE_SIZE,
      roots: input.roots,
      homeDirectory: input.homeDirectory,
    }).catch(() => null)
    return (history?.items ?? []).map((item): Candidate => ({ item, workspaceRoot }))
  }))

  const seen = new Set<string>()
  const candidates: Candidate[] = []
  for (const candidate of perRoot.flat()) {
    const key = `${candidate.item.provider}:${candidate.item.identifier}`
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(candidate)
  }
  candidates.sort((left, right) => right.item.lastActivityAt.localeCompare(left.item.lastActivityAt))
  return candidates.slice(0, MAX_CANDIDATES)
}

function containsAllTerms(text: string, terms: string[]): boolean {
  const lowered = text.toLowerCase()
  return terms.every((term) => lowered.includes(term))
}

/** Plain ASCII terms appear verbatim in the raw JSON line, so they can rule it out before parsing. */
function mayMatchRawLine(rawLine: string, terms: string[]): boolean {
  const lowered = rawLine.toLowerCase()
  return terms.every((term) => !/^[\x20-\x7e]+$/.test(term) || /["\\]/.test(term) || lowered.includes(term))
}

function collectStringLeaves(value: unknown, leaves: string[], depth = 0): void {
  if (typeof value === 'string') {
    if (value.length <= MAX_LEAF_LENGTH) leaves.push(value)
    return
  }
  if (depth >= MAX_LEAF_DEPTH || value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const entry of value) collectStringLeaves(entry, leaves, depth + 1)
    return
  }
  for (const [key, entry] of Object.entries(value)) {
    if (!SKIPPED_KEYS.has(key)) collectStringLeaves(entry, leaves, depth + 1)
  }
}

function lineText(rawLine: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawLine)
  } catch {
    return rawLine.replace(/\s+/g, ' ').trim()
  }
  const leaves: string[] = []
  collectStringLeaves(parsed, leaves)
  return leaves.join(' ').replace(/\s+/g, ' ').trim()
}

function snippetAround(text: string, firstTerm: string): string {
  const position = Math.max(0, text.toLowerCase().indexOf(firstTerm))
  const start = Math.max(0, position - SNIPPET_RADIUS)
  const end = Math.min(text.length, position + Math.min(firstTerm.length, 20) + SNIPPET_RADIUS)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

interface TranscriptScan {
  matchCount: number
  snippets: string[]
}

async function scanTranscript(path: string, terms: string[]): Promise<TranscriptScan> {
  const scan: TranscriptScan = { matchCount: 0, snippets: [] }
  const input = createReadStream(path, { encoding: 'utf8' })
  const lines = createInterface({ input, crlfDelay: Infinity })
  try {
    for await (const rawLine of lines) {
      if (!rawLine || rawLine.length > MAX_LINE_LENGTH || !mayMatchRawLine(rawLine, terms)) continue
      const text = lineText(rawLine)
      if (!containsAllTerms(text, terms)) continue
      scan.matchCount += 1
      if (scan.snippets.length < MAX_SNIPPETS) scan.snippets.push(snippetAround(text, terms[0]))
    }
  } finally {
    lines.close()
    input.destroy()
  }
  return scan
}

function metadataMatch(item: AgentSessionHistoryItem, terms: string[]): TranscriptScan {
  const field = [item.title, item.preview].find((text) => text && containsAllTerms(text, terms))
  return field ? { matchCount: 1, snippets: [snippetAround(field, terms[0])] } : { matchCount: 0, snippets: [] }
}

async function transcriptSize(path: string): Promise<number | null> {
  try {
    const stats = await fs.stat(path)
    return stats.isFile() && stats.size <= MAX_TRANSCRIPT_BYTES ? stats.size : null
  } catch {
    return null
  }
}

export async function searchSessionContent(input: SessionContentSearchInput): Promise<SessionContentMatch[]> {
  const search = validateInput(input)
  const candidates = await collectCandidates(search, input)
  const matches: SessionContentMatch[] = []
  let scannedBytes = 0

  for (const { item, workspaceRoot } of candidates) {
    const found = metadataMatch(item, search.terms)

    if (scannedBytes < MAX_SCANNED_BYTES) {
      try {
        const path = await findAgentTranscriptFile(item.provider, item.identifier, {
          workspaceRoot,
          roots: input.roots,
          homeDirectory: input.homeDirectory,
        })
        const size = path ? await transcriptSize(path) : null
        if (path && size !== null) {
          scannedBytes += size
          const scan = await scanTranscript(path, search.terms)
          found.matchCount += scan.matchCount
          found.snippets.push(...scan.snippets)
        }
      } catch {
        // One unreadable transcript must not hide matches in the others.
      }
    }

    if (found.matchCount === 0) continue
    matches.push({
      provider: item.provider,
      identifier: item.identifier,
      workspaceRoot,
      ...(item.title ? { title: item.title } : {}),
      lastActivityAt: item.lastActivityAt,
      matchCount: found.matchCount,
      snippets: found.snippets.slice(0, MAX_SNIPPETS),
    })
  }

  matches.sort((left, right) =>
    right.matchCount - left.matchCount || right.lastActivityAt.localeCompare(left.lastActivityAt))
  return matches.slice(0, search.limit)
}
