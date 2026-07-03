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
  if (activeWorkspaceType === 'grid' && requestedMode !== 'gridview' && requestedMode !== 'fullview') return null
  if (activeWorkspaceType === 'canvas' && requestedMode === 'gridview') return null

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
