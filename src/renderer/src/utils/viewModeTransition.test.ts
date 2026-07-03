import { resolveViewModeTransition } from './viewModeTransition'
import type { SplitViewState, TileState } from '@shared/types'

function tile(id: string, zIndex: number): TileState {
  return {
    id,
    type: 'terminal',
    x: 0,
    y: 0,
    width: 900,
    height: 400,
    zIndex,
  }
}

const splitViewState: SplitViewState = {
  leftTileIds: ['left'],
  rightTileIds: ['right'],
  activeLeftTileId: 'left',
  activeRightTileId: 'right',
  focusedPanel: 'left',
  orientation: 'vertical',
}

const gridFocus = resolveViewModeTransition({
  activeWorkspaceType: 'grid',
  currentViewMode: 'gridview',
  requestedMode: 'fullview',
  focusedTileId: 'second',
  fullviewActiveTileId: null,
  tiles: [tile('first', 1), tile('second', 2)],
  splitViewState,
})

if (gridFocus?.viewMode !== 'fullview') {
  throw new Error('Grid Focus must switch to fullview')
}

if (gridFocus.fullviewActiveTileId !== 'second') {
  throw new Error('Grid Focus must use the focused tile as the fullview active tile')
}

const invalidGridMode = resolveViewModeTransition({
  activeWorkspaceType: 'grid',
  currentViewMode: 'gridview',
  requestedMode: 'splitview',
  focusedTileId: 'second',
  fullviewActiveTileId: null,
  tiles: [tile('first', 1), tile('second', 2)],
  splitViewState,
})

if (invalidGridMode !== null) {
  throw new Error('Grid workspaces must reject canvas-only modes')
}
