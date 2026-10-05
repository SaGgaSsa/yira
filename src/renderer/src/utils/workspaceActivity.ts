import type { WorkspaceMetadata } from '@shared/types'
import type { TerminalProcessActivity, TerminalProcessAgent } from '@shared/terminalProcessActivity'
import { getWorkspaceSidebarOrder } from './workspaceOrdering'

export type WorkspaceActivityStatus = 'active' | 'unread' | 'idle'

export interface WorkspaceActivityAgentSummary {
  agent: TerminalProcessAgent
  /** Terminals running this agent. */
  count: number
  /** Of those, terminals where the agent is working right now. */
  working: number
}

export interface WorkspaceActivityCardData {
  workspace: WorkspaceMetadata
  status: WorkspaceActivityStatus
  /** Real terminal count supplied by the caller (tiles for the active workspace, live runtimes otherwise). */
  terminalCount: number
  /** Terminals with recent output or a working process. */
  workingTerminalCount: number
  /** Agents detected in the workspace terminals, in a stable order. */
  agents: WorkspaceActivityAgentSummary[]
  attentionCount: number
  isCurrent: boolean
  /** Tile that requires attention, resolved from tile counters only. Null when unknown. */
  attentionTileId: string | null
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

/**
 * Resolve the tile that requires attention using tile counters only.
 * Returns the tile with the highest unread output count above zero,
 * or null when no real target exists.
 */
export function resolveWorkspaceAttentionTileId(
  attentionByTile?: Readonly<Record<string, number>>,
): string | null {
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

const AGENT_ORDER: readonly TerminalProcessAgent[] = ['claude', 'codex', 'opencode']

function summarizeWorkspaceAgents(processes: readonly TerminalProcessActivity[]): WorkspaceActivityAgentSummary[] {
  return AGENT_ORDER
    .map((agent) => {
      const agentProcesses = processes.filter((activity) => activity.agent === agent)
      return {
        agent,
        count: agentProcesses.length,
        working: agentProcesses.filter((activity) => activity.state === 'working').length,
      }
    })
    .filter((summary) => summary.count > 0)
}

export interface BuildWorkspaceActivityCardsOptions {
  workspaces: readonly WorkspaceMetadata[]
  /**
   * Exact sidebar grey/white source of truth: workspace ids activated
   * (clicked) during this Yira session. Only these workspaces get cards.
   */
  sessionActiveIds: ReadonlySet<string>
  attentionCounts: Readonly<Record<string, number>>
  terminalCounts: Readonly<Record<string, number>>
  activeWorkspaceId: string | null
  /** Tile-level unread counts, only known for the active workspace. */
  activeWorkspaceAttentionByTile?: Readonly<Record<string, number>>
  /** Terminals with PTY output inside the recent window, keyed by workspace. */
  recentOutputCounts?: Readonly<Record<string, number>>
  processActivity?: readonly TerminalProcessActivity[]
}

/** Cards for workspaces visited this session, kept in the same order as the left sidebar. */
export function buildWorkspaceActivityCards({
  workspaces,
  sessionActiveIds,
  attentionCounts,
  terminalCounts,
  activeWorkspaceId,
  activeWorkspaceAttentionByTile,
  recentOutputCounts = {},
  processActivity = [],
}: BuildWorkspaceActivityCardsOptions): WorkspaceActivityCardData[] {
  const cards: WorkspaceActivityCardData[] = []

  for (const workspace of getWorkspaceSidebarOrder(workspaces)) {
    if (!sessionActiveIds.has(workspace.id)) continue
    const attentionCount = attentionCounts[workspace.id] ?? 0
    const recentOutput = recentOutputCounts[workspace.id] ?? 0
    const workspaceProcesses = processActivity.filter((activity) => activity.workspaceId === workspace.id)
    const processWorkingCount = workspaceProcesses.filter((activity) => activity.state === 'working').length
    const status: WorkspaceActivityStatus = recentOutput > 0 || processWorkingCount > 0
      ? 'active'
      : attentionCount > 0 ? 'unread' : 'idle'
    cards.push({
      workspace,
      status,
      terminalCount: terminalCounts[workspace.id] ?? 0,
      workingTerminalCount: Math.max(recentOutput, processWorkingCount),
      agents: summarizeWorkspaceAgents(workspaceProcesses),
      attentionCount,
      isCurrent: workspace.id === activeWorkspaceId,
      attentionTileId: resolveWorkspaceAttentionTileId(
        workspace.id === activeWorkspaceId ? activeWorkspaceAttentionByTile : undefined,
      ),
    })
  }

  return cards
}

/** Cards in this list need attention: unreviewed output. */
export function hasWorkspaceActivityAttention(card: WorkspaceActivityCardData): boolean {
  return card.status === 'unread'
}
