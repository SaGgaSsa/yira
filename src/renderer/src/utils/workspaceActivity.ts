import type { WorkspaceMetadata } from '@shared/types'
import { getWorkspaceSidebarOrder } from './workspaceOrdering'

export type WorkspaceActivityStatus = 'active' | 'unread' | 'idle'

export interface WorkspaceActivityCardData {
  workspace: WorkspaceMetadata
  status: WorkspaceActivityStatus
  /** Real terminal count supplied by the caller (tiles for the active workspace, live runtimes otherwise). */
  terminalCount: number
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
}: BuildWorkspaceActivityCardsOptions): WorkspaceActivityCardData[] {
  const cards: WorkspaceActivityCardData[] = []

  for (const workspace of getWorkspaceSidebarOrder(workspaces)) {
    if (!sessionActiveIds.has(workspace.id)) continue
    const attentionCount = attentionCounts[workspace.id] ?? 0
    const recentOutput = recentOutputCounts[workspace.id] ?? 0
    const status: WorkspaceActivityStatus = recentOutput > 0 ? 'active' : attentionCount > 0 ? 'unread' : 'idle'
    cards.push({
      workspace,
      status,
      terminalCount: terminalCounts[workspace.id] ?? 0,
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
