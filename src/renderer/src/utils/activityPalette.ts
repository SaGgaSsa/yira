import type { AgentActiveSession, AgentSessionSurface, WorkspaceMetadata } from '@shared/types'

/** Most cards a single row of the Activity palette grid holds. */
export const ACTIVITY_PALETTE_MAX_COLUMNS = 3
/** Grid tracks per row; divisible by every row size from 1 to 3. */
export const ACTIVITY_PALETTE_GRID_TRACKS = 6

export interface ActivityPaletteGroup {
  workspace: WorkspaceMetadata
  sessions: AgentActiveSession[]
  needsInputCount: number
  workingCount: number
}

export interface ActivityPaletteSummary {
  agentCount: number
  workspaceCount: number
  needsInputCount: number
}

export type ActivityPaletteNavigationKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

export function isActivityPaletteSession(session: AgentActiveSession): boolean {
  return session.status === 'working' || session.status === 'needs-input'
}

export function getAgentSessionSurface(session: AgentActiveSession): AgentSessionSurface {
  return session.surface ?? 'tile'
}

function compareSessions(left: AgentActiveSession, right: AgentActiveSession): number {
  const leftNeedsInput = left.status === 'needs-input' ? 0 : 1
  const rightNeedsInput = right.status === 'needs-input' ? 0 : 1
  return leftNeedsInput - rightNeedsInput
    || left.startedAt.localeCompare(right.startedAt)
    || left.tileId.localeCompare(right.tileId)
}

/**
 * Groups working and waiting agents by workspace. `workspaces` must already be
 * in sidebar order: workspaces with an agent waiting for input come first and
 * each group keeps its sidebar position otherwise.
 */
export function buildActivityPaletteGroups(
  workspaces: readonly WorkspaceMetadata[],
  sessions: readonly AgentActiveSession[],
): ActivityPaletteGroup[] {
  const groups = workspaces.flatMap((workspace): ActivityPaletteGroup[] => {
    const workspaceSessions = sessions
      .filter((session) => session.workspaceId === workspace.id && isActivityPaletteSession(session))
      .sort(compareSessions)
    if (workspaceSessions.length === 0) return []

    const needsInputCount = workspaceSessions.filter((session) => session.status === 'needs-input').length
    return [{
      workspace,
      sessions: workspaceSessions,
      needsInputCount,
      workingCount: workspaceSessions.length - needsInputCount,
    }]
  })

  return [
    ...groups.filter((group) => group.needsInputCount > 0),
    ...groups.filter((group) => group.needsInputCount === 0),
  ]
}

export function summarizeActivityPalette(groups: readonly ActivityPaletteGroup[]): ActivityPaletteSummary {
  return groups.reduce<ActivityPaletteSummary>((summary, group) => ({
    agentCount: summary.agentCount + group.sessions.length,
    workspaceCount: summary.workspaceCount + 1,
    needsInputCount: summary.needsInputCount + group.needsInputCount,
  }), { agentCount: 0, workspaceCount: 0, needsInputCount: 0 })
}

/** Splits `count` cards into rows of at most three, as even as possible, larger rows first. */
export function getActivityPaletteRowSizes(count: number): number[] {
  if (count <= 0) return []
  const rows = Math.ceil(count / ACTIVITY_PALETTE_MAX_COLUMNS)
  const base = Math.floor(count / rows)
  const extra = count % rows
  return Array.from({ length: rows }, (_, row) => (row < extra ? base + 1 : base))
}

/** Grid column span for each card so that every row fills the full width. */
export function getActivityPaletteCardSpans(count: number): number[] {
  return getActivityPaletteRowSizes(count).flatMap((rowSize) => (
    Array.from({ length: rowSize }, () => ACTIVITY_PALETTE_GRID_TRACKS / rowSize)
  ))
}

/** Short elapsed time such as `30 s`, `4 min` or `2 h`. */
export function formatActivityElapsed(startedAt: string, now: number): string {
  const started = Date.parse(startedAt)
  const seconds = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : 0
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h`
}

/** Collapses line breaks and repeated whitespace so a message fits on one line. */
export function flattenActivityMessage(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Moves the keyboard selection: up/down walk agents in visual order, left/right
 * jump to the first agent of the previous/next card. Returns the session id to
 * select, or the current one when there is nowhere to move.
 */
export function moveActivityPaletteSelection(
  groups: readonly ActivityPaletteGroup[],
  selectedSessionId: string | null,
  key: ActivityPaletteNavigationKey,
): string | null {
  const ordered = groups.flatMap((group, groupIndex) => (
    group.sessions.map((session) => ({ sessionId: session.sessionId, groupIndex }))
  ))
  if (ordered.length === 0) return null

  const currentIndex = ordered.findIndex((entry) => entry.sessionId === selectedSessionId)
  if (currentIndex === -1) return ordered[0].sessionId

  if (key === 'ArrowUp') return ordered[Math.max(0, currentIndex - 1)].sessionId
  if (key === 'ArrowDown') return ordered[Math.min(ordered.length - 1, currentIndex + 1)].sessionId

  const targetGroupIndex = ordered[currentIndex].groupIndex + (key === 'ArrowLeft' ? -1 : 1)
  const targetGroup = groups[targetGroupIndex]
  return targetGroup?.sessions[0]?.sessionId ?? ordered[currentIndex].sessionId
}
