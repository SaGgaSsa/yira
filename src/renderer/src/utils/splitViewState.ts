import type { SplitOrientation, SplitPanelId, SplitViewState, ViewMode } from '@shared/types'

export const DEFAULT_SPLIT_ORIENTATION: SplitOrientation = 'vertical'

export function normalizeSplitOrientation(value: unknown): SplitOrientation {
  return value === 'horizontal' || value === 'vertical'
    ? value
    : DEFAULT_SPLIT_ORIENTATION
}

export function toggleSplitOrientation(orientation: SplitOrientation): SplitOrientation {
  return orientation === 'vertical' ? 'horizontal' : 'vertical'
}

/** Shows two tiles next to each other, keeping the other tabs of each panel, with focus on the right one. */
export function placeTilesSideBySide(
  state: SplitViewState,
  leftTileId: string,
  rightTileId: string,
): SplitViewState {
  const withoutPlacedTiles = (tileIds: string[]) => tileIds.filter((tileId) => tileId !== leftTileId && tileId !== rightTileId)

  return {
    ...state,
    leftTileIds: [leftTileId, ...withoutPlacedTiles(state.leftTileIds)],
    rightTileIds: [rightTileId, ...withoutPlacedTiles(state.rightTileIds)],
    activeLeftTileId: leftTileId,
    activeRightTileId: rightTileId,
    focusedPanel: 'right',
  }
}

/** Only tiles that would change what is on screen can be dropped: Focus needs a different tile to pair with. */
export function canDropTileInSplit(viewMode: ViewMode, tileId: string, fullviewActiveTileId: string | null): boolean {
  if (viewMode === 'splitview') return true
  return viewMode === 'fullview' && fullviewActiveTileId !== null && fullviewActiveTileId !== tileId
}

/** Shows a tile in a panel with another tile opposite it, and focuses the panel of the first one. */
export function placeTileBeside(
  state: SplitViewState,
  tileId: string,
  besideTileId: string,
  panel: SplitPanelId,
): SplitViewState {
  const placed = panel === 'left'
    ? placeTilesSideBySide(state, tileId, besideTileId)
    : placeTilesSideBySide(state, besideTileId, tileId)
  return { ...placed, focusedPanel: panel }
}

/** Shows a tile in a panel. A tile alone in the other panel trades places with the active tile, so no panel is left empty. */
export function showTileInSplitPanel(state: SplitViewState, tileId: string, panel: SplitPanelId): SplitViewState {
  const targetTileIds = panel === 'left' ? state.leftTileIds : state.rightTileIds
  const sourceTileIds = panel === 'left' ? state.rightTileIds : state.leftTileIds
  const targetActiveTileId = panel === 'left' ? state.activeLeftTileId : state.activeRightTileId
  const sourceActiveTileId = panel === 'left' ? state.activeRightTileId : state.activeLeftTileId

  if (sourceTileIds.length === 1 && sourceTileIds[0] === tileId) {
    const replacedTileId = targetActiveTileId ?? targetTileIds[0]
    if (!replacedTileId) return state
    return placeTileBeside(state, tileId, replacedTileId, panel)
  }

  const nextTargetTileIds = [tileId, ...targetTileIds.filter((id) => id !== tileId)]
  const nextSourceTileIds = sourceTileIds.filter((id) => id !== tileId)
  const nextSourceActiveTileId = sourceActiveTileId === tileId
    ? nextSourceTileIds[0] ?? null
    : sourceActiveTileId

  return {
    ...state,
    leftTileIds: panel === 'left' ? nextTargetTileIds : nextSourceTileIds,
    rightTileIds: panel === 'right' ? nextTargetTileIds : nextSourceTileIds,
    activeLeftTileId: panel === 'left' ? tileId : nextSourceActiveTileId,
    activeRightTileId: panel === 'right' ? tileId : nextSourceActiveTileId,
    focusedPanel: panel,
  }
}
