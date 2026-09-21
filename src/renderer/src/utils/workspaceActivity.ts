import type { AgentActiveSession, AgentProvider, AgentSessionStatus, WorkspaceMetadata } from '@shared/types'
import { summarizeTerminalActivity, type TerminalActivitySummary } from './terminalActivity'

export interface WorkspaceAgentDetail {
  provider: AgentProvider
  sessionId: string
  status: AgentSessionStatus
  tileId: string
}

export interface WorkspaceActivityCardData {
  workspace: WorkspaceMetadata
  activity: TerminalActivitySummary
  /** Live agent sessions with status working or needs-input (unique sessionId). */
  activeAgents: number
  /** Real agent sessions in this workspace, ordered by status priority. */
  agentDetails: WorkspaceAgentDetail[]
  /** Real terminal count supplied by the caller (tiles for the active workspace, live runtimes otherwise). */
  terminalCount: number
  attentionCount: number
  isCurrent: boolean
  /** Tile that requires attention, resolved from real sessions/attention only. Null when unknown. */
  attentionTileId: string | null
}

/** Priority order for activity cards: attention first, then working, then the rest. */
export function getWorkspaceActivityRank(status: TerminalActivitySummary['status']): number {
  switch (status) {
    case 'needs-input': return 0
    case 'working': return 1
    case 'unread': return 2
    case 'done': return 3
    case 'idle': return 4
  }
}

function getAgentStatusRank(status: AgentSessionStatus): number {
  switch (status) {
    case 'needs-input': return 0
    case 'working': return 1
    case 'done': return 2
    case 'exited': return 3
  }
}

/** Real agent sessions for a workspace, ordered by status priority with a stable order. */
export function getWorkspaceAgentDetails(
  sessions: readonly AgentActiveSession[],
  workspaceId: string,
): WorkspaceAgentDetail[] {
  const seen = new Set<string>()
  return sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => {
      if (session.workspaceId !== workspaceId) return false
      const identity = `${session.provider}/${session.sessionId}`
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
    .sort((a, b) => (
      getAgentStatusRank(a.session.status) - getAgentStatusRank(b.session.status) || a.index - b.index
    ))
    .map(({ session }) => ({
      provider: session.provider,
      sessionId: session.sessionId,
      status: session.status,
      tileId: session.tileId,
    }))
}

export interface ActivationFocusTargetOptions {
  tiles: readonly { id: string }[]
  requestedWorkspaceId: string
  activeWorkspaceId: string | null
  tileId: string | null
}

/**
 * Pure staleness guard for post-activation navigation. Returns the tile to
 * focus only when the transition is still current and the tile still exists.
 */
export function resolveActivationFocusTarget({
  tiles,
  requestedWorkspaceId,
  activeWorkspaceId,
  tileId,
}: ActivationFocusTargetOptions): string | null {
  if (!tileId) return null
  if (activeWorkspaceId !== requestedWorkspaceId) return null
  const tile = tiles.find((entry) => entry.id === tileId)
  return tile ? tile.id : null
}

function countUniqueActiveAgents(sessions: readonly AgentActiveSession[], workspaceId: string): number {
  const seen = new Set<string>()
  for (const session of sessions) {
    if (session.workspaceId !== workspaceId) continue
    if (session.status !== 'working' && session.status !== 'needs-input') continue
    seen.add(`${session.sessionId}`)
  }
  return seen.size
}

/**
 * Resolve the tile that requires attention using real data only.
 * Prefers an agent session needing input, then a working session,
 * then the tile with the highest unread output count. Returns null
 * when no real target exists (for example background-workspace output
 * counters without a tile breakdown).
 */
export function resolveWorkspaceAttentionTileId(
  sessions: readonly AgentActiveSession[],
  workspaceId: string,
  attentionByTile?: Readonly<Record<string, number>>,
): string | null {
  let workingTileId: string | null = null
  for (const session of sessions) {
    if (session.workspaceId !== workspaceId || !session.tileId) continue
    if (session.status === 'needs-input') return session.tileId
    if (workingTileId === null && session.status === 'working') workingTileId = session.tileId
  }
  if (workingTileId !== null) return workingTileId

  if (!attentionByTile) return null
  let bestTileId: string | null = null
  let bestCount = 0
  for (const [tileId, count] of Object.entries(attentionByTile)) {
    if (count > bestCount) {
      bestCount = count
      bestTileId = tileId
    }
  }
  return bestTileId
}

export interface BuildWorkspaceActivityCardsOptions {
  workspaces: readonly WorkspaceMetadata[]
  /**
   * Exact sidebar grey/white source of truth: workspace ids activated
   * (clicked) during this Yira session. Only these workspaces get cards.
   */
  sessionActiveIds: ReadonlySet<string>
  sessions: readonly AgentActiveSession[]
  attentionCounts: Readonly<Record<string, number>>
  terminalCounts: Readonly<Record<string, number>>
  activeWorkspaceId: string | null
  /** Tile-level unread counts, only known for the active workspace. */
  activeWorkspaceAttentionByTile?: Readonly<Record<string, number>>
}

export function buildWorkspaceActivityCards({
  workspaces,
  sessionActiveIds,
  sessions,
  attentionCounts,
  terminalCounts,
  activeWorkspaceId,
  activeWorkspaceAttentionByTile,
}: BuildWorkspaceActivityCardsOptions): WorkspaceActivityCardData[] {
  const cards: WorkspaceActivityCardData[] = []

  for (const workspace of workspaces) {
    if (!sessionActiveIds.has(workspace.id)) continue
    const attentionCount = attentionCounts[workspace.id] ?? 0
    const activity = summarizeTerminalActivity(sessions, workspace.id, attentionCount)
    cards.push({
      workspace,
      activity,
      activeAgents: countUniqueActiveAgents(sessions, workspace.id),
      agentDetails: getWorkspaceAgentDetails(sessions, workspace.id),
      terminalCount: terminalCounts[workspace.id] ?? 0,
      attentionCount,
      isCurrent: workspace.id === activeWorkspaceId,
      attentionTileId: resolveWorkspaceAttentionTileId(
        sessions,
        workspace.id,
        workspace.id === activeWorkspaceId ? activeWorkspaceAttentionByTile : undefined,
      ),
    })
  }

  return sortWorkspaceActivityCards(cards)
}

export function sortWorkspaceActivityCards(cards: readonly WorkspaceActivityCardData[]): WorkspaceActivityCardData[] {
  return cards.slice().sort((a, b) => {
    const rank = getWorkspaceActivityRank(a.activity.status) - getWorkspaceActivityRank(b.activity.status)
    if (rank !== 0) return rank
    if (b.attentionCount !== a.attentionCount) return b.attentionCount - a.attentionCount
    if (b.activity.working !== a.activity.working) return b.activity.working - a.activity.working
    const name = a.workspace.name.localeCompare(b.workspace.name)
    if (name !== 0) return name
    return a.workspace.id.localeCompare(b.workspace.id)
  })
}

/** Cards in this list need attention: intervention requested or unreviewed output. */
export function hasWorkspaceActivityAttention(card: WorkspaceActivityCardData): boolean {
  return card.activity.needsInput > 0 || card.activity.unread > 0
}
