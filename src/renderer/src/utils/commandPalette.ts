import type { AgentActiveSession, FileSearchEntry, WorkspaceMetadata } from '@shared/types'
import { isActivityPaletteSession } from '@/utils/activityPalette'

export type CommandPaletteMode = 'all' | 'actions' | 'sessions' | 'workspaces' | 'files'

export interface CommandPaletteQuery {
  mode: CommandPaletteMode
  text: string
}

const PREFIX_MODES: Record<string, CommandPaletteMode> = {
  '>': 'actions',
  '@': 'sessions',
  '#': 'workspaces',
  '/': 'files',
}

export function parseCommandPaletteQuery(raw: string): CommandPaletteQuery {
  const mode = PREFIX_MODES[raw.charAt(0)]
  if (!mode) return { mode: 'all', text: raw.trim() }
  return { mode, text: raw.slice(1).trim() }
}

/** Highlighted ranges are [start, end) offsets in the label. */
export interface CommandPaletteMatch {
  score: number
  ranges: Array<[number, number]>
}

/**
 * Lowercase, accent-free text next to the index each character came from.
 * Removing diacritics can drop characters, so ranges must be mapped back.
 */
function normalizeWithMap(value: string): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    const normalized = value[index].normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    for (let offset = 0; offset < normalized.length; offset += 1) {
      text += normalized[offset]
      map.push(index)
    }
  }
  return { text, map }
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function rangeFor(map: number[], start: number, length: number): [number, number] {
  return [map[start], map[start + length - 1] + 1]
}

function findWordStart(text: string, query: string): number {
  let index = text.indexOf(query)
  while (index !== -1) {
    if (index === 0 || !/[\p{L}\p{N}]/u.test(text[index - 1])) return index
    index = text.indexOf(query, index + 1)
  }
  return -1
}

interface FuzzyMatch {
  positions: number[]
  gaps: number
}

/** Picks the tightest spread of query characters inside the label. */
function findFuzzyMatch(text: string, query: string): FuzzyMatch | null {
  let best: FuzzyMatch | null = null
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== query[0]) continue
    const positions = [start]
    let cursor = start
    let matched = true
    for (let index = 1; index < query.length; index += 1) {
      const next = text.indexOf(query[index], cursor + 1)
      if (next === -1) {
        matched = false
        break
      }
      positions.push(next)
      cursor = next
    }
    if (!matched) continue
    const gaps = cursor - start + 1 - query.length
    if (!best || gaps < best.gaps) best = { positions, gaps }
    if (gaps === 0) break
  }
  return best
}

function fuzzyRanges(positions: readonly number[], map: readonly number[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let rangeStart = 0
  for (let index = 1; index <= positions.length; index += 1) {
    if (index < positions.length && positions[index] === positions[index - 1] + 1) continue
    ranges.push([map[positions[rangeStart]], map[positions[index - 1]] + 1])
    rangeStart = index
  }
  return ranges
}

export function matchCommandPaletteText(
  label: string,
  query: string,
  keywords: readonly string[] = [],
): CommandPaletteMatch | null {
  const normalizedQuery = normalizeText(query)
  if (normalizedQuery.length === 0) return { score: 0, ranges: [] }

  const { text, map } = normalizeWithMap(label)
  const shorterLabel = label.length / 100

  if (text.startsWith(normalizedQuery)) {
    return { score: 400 - shorterLabel, ranges: [rangeFor(map, 0, normalizedQuery.length)] }
  }

  const wordStart = findWordStart(text, normalizedQuery)
  if (wordStart !== -1) {
    return { score: 300 - shorterLabel, ranges: [rangeFor(map, wordStart, normalizedQuery.length)] }
  }

  const substring = text.indexOf(normalizedQuery)
  if (substring !== -1) {
    return { score: 200 - shorterLabel, ranges: [rangeFor(map, substring, normalizedQuery.length)] }
  }

  if (keywords.some((keyword) => normalizeText(keyword).includes(normalizedQuery))) {
    return { score: 150 - shorterLabel, ranges: [] }
  }

  const fuzzy = findFuzzyMatch(text, normalizedQuery)
  if (fuzzy) {
    return {
      score: Math.max(1, 100 - fuzzy.gaps - shorterLabel),
      ranges: fuzzyRanges(fuzzy.positions, map),
    }
  }

  return null
}

export type CommandPaletteIcon =
  | 'plus'
  | 'focus'
  | 'split'
  | 'grid'
  | 'canvas'
  | 'home'
  | 'terminal'
  | 'agent'
  | 'note'
  | 'browser'
  | 'sidebar'
  | 'panel'
  | 'settings'
  | 'script'
  | 'workspace'
  | 'file'

export interface CommandPaletteAction {
  id: string
  label: string
  icon: CommandPaletteIcon
  /** Extra search terms, for example English and Spanish synonyms. */
  keywords?: string[]
  /** Accelerator label shown at the right, for example `Ctrl+I`. */
  shortcut?: string
  /** Muted text at the right when there is no shortcut, for example a script command. */
  detail?: string
}

export type CommandPaletteItem =
  | { key: 'new-session'; kind: 'new-session' }
  | { key: string; kind: 'session'; session: AgentActiveSession }
  | { key: string; kind: 'workspace'; workspace: WorkspaceMetadata }
  | { key: string; kind: 'action'; action: CommandPaletteAction }
  | { key: string; kind: 'file'; workspaceId: string; entry: FileSearchEntry }
  | { key: 'new-session-prompt'; kind: 'new-session-prompt'; prompt: string }

export function sessionItemKey(sessionId: string): string {
  return `session:${sessionId}`
}

export function workspaceItemKey(workspaceId: string): string {
  return `workspace:${workspaceId}`
}

export function actionItemKey(actionId: string): string {
  return `action:${actionId}`
}

export function fileItemKey(workspaceId: string, relativePath: string): string {
  return `file:${workspaceId}:${relativePath}`
}

export type CommandPaletteSectionId =
  | 'top'
  | 'attention'
  | 'recent'
  | 'active'
  | 'sessions'
  | 'workspaces'
  | 'actions'
  | 'files'
  | 'create'

export interface CommandPaletteSection {
  id: CommandPaletteSectionId
  items: CommandPaletteItem[]
  /** Full size of the group when `items` is cut short (Activos). */
  total: number
  /** Match per item key, for highlighting; only in search results. */
  matches?: Record<string, CommandPaletteMatch>
}

/** What the store remembers of a used item; files keep their entry because a search found them. */
export interface CommandPaletteRecent {
  key: string
  file?: { workspaceId: string; entry: FileSearchEntry }
}

export interface CommandPaletteCatalog {
  sessions: readonly AgentActiveSession[]
  workspaces: readonly WorkspaceMetadata[]
  actions: readonly CommandPaletteAction[]
  activeWorkspaceId: string
}

export const COMMAND_PALETTE_ACTIVE_PREVIEW = 3
export const COMMAND_PALETTE_RECENT_LIMIT = 5
export const COMMAND_PALETTE_RESULT_LIMIT = 8

const PROVIDER_KEYWORDS = { claude: 'Claude', codex: 'Codex' } as const

function compareSessionsByStart(left: AgentActiveSession, right: AgentActiveSession): number {
  return left.startedAt.localeCompare(right.startedAt) || left.tileId.localeCompare(right.tileId)
}

function isActiveSession(session: AgentActiveSession): boolean {
  return session.status === 'working' || session.status === 'done'
}

function activeStatusOrder(session: AgentActiveSession): number {
  return session.status === 'working' ? 0 : 1
}

function findWorkspaceName(catalog: CommandPaletteCatalog, workspaceId: string): string {
  return catalog.workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? ''
}

/** Turns a recent into a live item, or null when its target is gone (closed session, removed action, file of another workspace). */
export function resolveCommandPaletteRecent(
  recent: CommandPaletteRecent,
  catalog: CommandPaletteCatalog,
): CommandPaletteItem | null {
  if (recent.key === 'new-session') return { key: 'new-session', kind: 'new-session' }

  if (recent.key.startsWith('session:')) {
    const sessionId = recent.key.slice('session:'.length)
    const session = catalog.sessions.find((entry) => (
      entry.sessionId === sessionId && isActivityPaletteSession(entry)
    ))
    return session ? { key: sessionItemKey(session.sessionId), kind: 'session', session } : null
  }

  if (recent.key.startsWith('workspace:')) {
    const workspaceId = recent.key.slice('workspace:'.length)
    const workspace = catalog.workspaces.find((entry) => entry.id === workspaceId)
    return workspace ? { key: workspaceItemKey(workspace.id), kind: 'workspace', workspace } : null
  }

  if (recent.key.startsWith('action:')) {
    const actionId = recent.key.slice('action:'.length)
    const action = catalog.actions.find((entry) => entry.id === actionId)
    return action ? { key: actionItemKey(action.id), kind: 'action', action } : null
  }

  if (recent.key.startsWith('file:')) {
    if (!recent.file || recent.file.workspaceId !== catalog.activeWorkspaceId) return null
    return {
      key: fileItemKey(recent.file.workspaceId, recent.file.entry.relativePath),
      kind: 'file',
      workspaceId: recent.file.workspaceId,
      entry: recent.file.entry,
    }
  }

  return null
}

export function buildCommandPaletteHome(input: {
  catalog: CommandPaletteCatalog
  recents: readonly CommandPaletteRecent[]
  activeExpanded: boolean
}): CommandPaletteSection[] {
  const { catalog, recents, activeExpanded } = input
  const liveSessions = catalog.sessions
    .filter(isActivityPaletteSession)
    .slice()
    .sort(compareSessionsByStart)
  const seen = new Set<string>()
  const sections: CommandPaletteSection[] = []

  const top: CommandPaletteItem[] = []
  const lastUsed = recents[0] ? resolveCommandPaletteRecent(recents[0], catalog) : null
  if (lastUsed) {
    top.push(lastUsed)
    seen.add(lastUsed.key)
  }
  const newSession: CommandPaletteItem = { key: 'new-session', kind: 'new-session' }
  if (!seen.has(newSession.key)) {
    top.push(newSession)
    seen.add(newSession.key)
  }
  sections.push({ id: 'top', items: top, total: top.length })

  const attentionItems = liveSessions
    .filter((session) => session.status === 'needs-input' && !seen.has(sessionItemKey(session.sessionId)))
    .map((session): CommandPaletteItem => ({ key: sessionItemKey(session.sessionId), kind: 'session', session }))
  for (const item of attentionItems) seen.add(item.key)
  if (attentionItems.length > 0) {
    sections.push({ id: 'attention', items: attentionItems, total: attentionItems.length })
  }

  const recentItems: CommandPaletteItem[] = []
  for (const recent of recents.slice(1)) {
    if (recentItems.length >= COMMAND_PALETTE_RECENT_LIMIT) break
    const item = resolveCommandPaletteRecent(recent, catalog)
    if (!item || item.kind === 'new-session' || seen.has(item.key)) continue
    recentItems.push(item)
    seen.add(item.key)
  }
  if (recentItems.length > 0) {
    sections.push({ id: 'recent', items: recentItems, total: recentItems.length })
  }

  const activeItems = liveSessions
    .filter(isActiveSession)
    .slice()
    .sort((left, right) => activeStatusOrder(left) - activeStatusOrder(right) || compareSessionsByStart(left, right))
    .filter((session) => !seen.has(sessionItemKey(session.sessionId)))
    .map((session): CommandPaletteItem => ({ key: sessionItemKey(session.sessionId), kind: 'session', session }))
  if (activeItems.length > 0) {
    sections.push({
      id: 'active',
      items: activeExpanded ? activeItems : activeItems.slice(0, COMMAND_PALETTE_ACTIVE_PREVIEW),
      total: activeItems.length,
    })
  }

  return sections
}

interface MatchedItem {
  item: CommandPaletteItem
  match: CommandPaletteMatch
}

const SEARCH_SECTION_ORDER: CommandPaletteSectionId[] = ['sessions', 'workspaces', 'actions', 'files']

export function buildCommandPaletteResults(input: {
  catalog: CommandPaletteCatalog
  query: CommandPaletteQuery
  files: readonly FileSearchEntry[]
  sessionLabel: (session: AgentActiveSession) => string
}): CommandPaletteSection[] {
  const { catalog, query, files, sessionLabel } = input
  const text = query.text.trim()
  const groups: Array<{ id: CommandPaletteSectionId; matched: MatchedItem[] }> = []

  if (query.mode === 'all' || query.mode === 'sessions') {
    const matched = catalog.sessions
      .filter(isActivityPaletteSession)
      .slice()
      .sort(compareSessionsByStart)
      .flatMap((session): MatchedItem[] => {
        const match = matchCommandPaletteText(sessionLabel(session), text, [
          findWorkspaceName(catalog, session.workspaceId),
          PROVIDER_KEYWORDS[session.provider],
          session.worktreeBranch ?? '',
        ])
        return match ? [{ item: { key: sessionItemKey(session.sessionId), kind: 'session', session }, match }] : []
      })
    groups.push({ id: 'sessions', matched })
  }

  if (query.mode === 'all' || query.mode === 'workspaces') {
    const matched = catalog.workspaces.flatMap((workspace): MatchedItem[] => {
      const match = matchCommandPaletteText(workspace.name, text)
      return match ? [{ item: { key: workspaceItemKey(workspace.id), kind: 'workspace', workspace }, match }] : []
    })
    groups.push({ id: 'workspaces', matched })
  }

  if (query.mode === 'all' || query.mode === 'actions') {
    const matched = catalog.actions.flatMap((action): MatchedItem[] => {
      const match = matchCommandPaletteText(action.label, text, action.keywords)
      return match ? [{ item: { key: actionItemKey(action.id), kind: 'action', action }, match }] : []
    })
    groups.push({ id: 'actions', matched })
  }

  if ((query.mode === 'all' || query.mode === 'files') && text.length >= 2) {
    const matched = files.flatMap((entry): MatchedItem[] => {
      const match = matchCommandPaletteText(entry.name, text, [entry.relativePath])
      return match
        ? [{ item: { key: fileItemKey(catalog.activeWorkspaceId, entry.relativePath), kind: 'file', workspaceId: catalog.activeWorkspaceId, entry }, match }]
        : []
    })
    groups.push({ id: 'files', matched })
  }

  const sections = groups
    .filter((group) => group.matched.length > 0)
    .map((group) => {
      const sorted = group.matched
        .slice()
        .sort((left, right) => right.match.score - left.match.score)
        .slice(0, COMMAND_PALETTE_RESULT_LIMIT)
      const matches: Record<string, CommandPaletteMatch> = {}
      for (const entry of sorted) matches[entry.item.key] = entry.match
      return {
        id: group.id,
        items: sorted.map((entry) => entry.item),
        total: sorted.length,
        matches,
        bestScore: sorted[0].match.score,
      }
    })
    .sort((left, right) => (
      right.bestScore - left.bestScore
      || SEARCH_SECTION_ORDER.indexOf(left.id) - SEARCH_SECTION_ORDER.indexOf(right.id)
    ))

  const result: CommandPaletteSection[] = sections.map(({ bestScore: _bestScore, ...section }) => section)

  if ((query.mode === 'all' || query.mode === 'sessions') && text.length > 0) {
    result.push({
      id: 'create',
      items: [{ key: 'new-session-prompt', kind: 'new-session-prompt', prompt: text }],
      total: 1,
    })
  }

  return result
}
