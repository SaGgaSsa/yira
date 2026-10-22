import type { SplitViewState, TileState, ViewMode, WorkspaceType } from '@shared/types'

interface ResolveViewModeTransitionInput {
  activeWorkspaceType: WorkspaceType
  currentViewMode: ViewMode
  requestedMode: ViewMode
  focusedTileId: string | null
  fullviewActiveTileId: string | null
  tiles: TileState[]
  splitViewState: SplitViewState
}

interface ViewModeTransition {
  viewMode: ViewMode
  fullviewActiveTileId?: string | null
  workspaceTypeSwitch?: WorkspaceType
}

function topTileId(tiles: TileState[]): string | null {
  return tiles.slice().sort((a, b) => b.zIndex - a.zIndex)[0]?.id ?? null
}

function existingTileId(tiles: TileState[], tileId: string | null): string | null {
  return tileId && tiles.some((tile) => tile.id === tileId) ? tileId : null
}

export function resolveViewModeTransition({
  activeWorkspaceType,
  currentViewMode,
  requestedMode,
  focusedTileId,
  fullviewActiveTileId,
  tiles,
  splitViewState,
}: ResolveViewModeTransitionInput): ViewModeTransition | null {
  if (activeWorkspaceType === 'canvas' && requestedMode === 'gridview') {
    return {
      viewMode: 'gridview',
      workspaceTypeSwitch: 'grid',
    }
  }

  if (activeWorkspaceType === 'grid' && requestedMode === 'canvas') {
    return {
      viewMode: 'canvas',
      workspaceTypeSwitch: 'canvas',
    }
  }

  if (activeWorkspaceType === 'grid' && requestedMode !== 'gridview' && requestedMode !== 'fullview' && requestedMode !== 'board' && requestedMode !== 'splitview') return null

  if (requestedMode === 'fullview') {
    const splitActiveId = splitViewState.focusedPanel === 'left'
      ? splitViewState.activeLeftTileId
      : splitViewState.activeRightTileId
    const nextActive = currentViewMode === 'splitview'
      ? splitActiveId ?? topTileId(tiles)
      : existingTileId(tiles, focusedTileId)
        ?? existingTileId(tiles, fullviewActiveTileId)
        ?? topTileId(tiles)

    return {
      viewMode: 'fullview',
      fullviewActiveTileId: nextActive,
    }
  }

  return {
    viewMode: requestedMode,
  }
}

interface ResolveAgentsViewSwitchInput {
  workspaceType: WorkspaceType
  requestedMode: ViewMode
  /** Synthetic tileIds of the sessions the Agents View shows for the active workspace. */
  visibleSessionIds: string[]
  focusedSessionId: string | null
  maximizedSessionId: string | null
}

export type AgentsViewSwitchAction =
  | { type: 'maximize'; sessionId: string }
  | { type: 'toggle-reading-mode' }
  | { type: 'show-all' }
  | { type: 'none' }

/**
 * Maps a view switcher click made inside Agents View to an action on the view
 * itself. Null means the click leaves Agents View for the workspace tiles:
 * Split, Board, and every button while there are no sessions to arrange.
 */
export function resolveAgentsViewSwitch({
  workspaceType,
  requestedMode,
  visibleSessionIds,
  focusedSessionId,
  maximizedSessionId,
}: ResolveAgentsViewSwitchInput): AgentsViewSwitchAction | null {
  if (visibleSessionIds.length === 0) return null

  if (requestedMode === 'fullview') {
    if (maximizedSessionId !== null) return { type: 'toggle-reading-mode' }
    const sessionId = focusedSessionId !== null && visibleSessionIds.includes(focusedSessionId)
      ? focusedSessionId
      : visibleSessionIds[0]
    return { type: 'maximize', sessionId }
  }

  if (requestedMode === (workspaceType === 'grid' ? 'gridview' : 'canvas')) {
    return maximizedSessionId !== null ? { type: 'show-all' } : { type: 'none' }
  }

  return null
}
