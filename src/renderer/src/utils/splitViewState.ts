import type { SplitOrientation, SplitViewState } from '@shared/types'

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
