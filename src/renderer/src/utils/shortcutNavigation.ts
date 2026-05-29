import type { SplitPanelId, SplitViewState } from '@shared/types'

export type TabShortcutDirection = 'previous' | 'next'

export function focusSplitPanelByShortcut(state: SplitViewState, panel: SplitPanelId): SplitViewState {
  if (state.focusedPanel === panel) return state
  return { ...state, focusedPanel: panel }
}

export function switchSplitPanelTabByShortcut(state: SplitViewState, direction: TabShortcutDirection): SplitViewState {
  const panel = state.focusedPanel
  const tileIds = panel === 'left' ? state.leftTileIds : state.rightTileIds
  const activeTileId = panel === 'left' ? state.activeLeftTileId : state.activeRightTileId
  const nextActiveTileId = switchFocusViewTabByShortcut(tileIds, activeTileId, direction)

  if (nextActiveTileId === activeTileId) return state

  return panel === 'left'
    ? { ...state, activeLeftTileId: nextActiveTileId, focusedPanel: 'left' }
    : { ...state, activeRightTileId: nextActiveTileId, focusedPanel: 'right' }
}

export function switchFocusViewTabByShortcut(
  tileIds: string[],
  activeTileId: string | null,
  direction: TabShortcutDirection,
): string | null {
  if (!activeTileId) return activeTileId

  const currentIndex = tileIds.indexOf(activeTileId)
  if (currentIndex === -1) return activeTileId

  const nextIndex = currentIndex + (direction === 'next' ? 1 : -1)
  if (nextIndex < 0 || nextIndex >= tileIds.length) return activeTileId

  return tileIds[nextIndex] ?? activeTileId
}
