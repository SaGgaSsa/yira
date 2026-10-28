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

const gridSplitMode = resolveViewModeTransition({
  activeWorkspaceType: 'grid',
  currentViewMode: 'gridview',
  requestedMode: 'splitview',
  focusedTileId: 'second',
  fullviewActiveTileId: null,
  tiles: [tile('first', 1), tile('second', 2)],
  splitViewState,
})

if (gridSplitMode?.viewMode !== 'splitview' || gridSplitMode.workspaceTypeSwitch) {
  throw new Error('Grid workspaces must allow split view without changing workspace type')
}

const canvasToGridSwitch = resolveViewModeTransition({
  activeWorkspaceType: 'canvas',
  currentViewMode: 'canvas',
  requestedMode: 'gridview',
  focusedTileId: 'second',
  fullviewActiveTileId: null,
  tiles: [tile('first', 1), tile('second', 2)],
  splitViewState,
})

if (canvasToGridSwitch?.workspaceTypeSwitch !== 'grid' || canvasToGridSwitch.viewMode !== 'gridview') {
  throw new Error('Canvas must transition to Grid through the workspace type switch path')
}

const gridToCanvasSwitch = resolveViewModeTransition({
  activeWorkspaceType: 'grid',
  currentViewMode: 'gridview',
  requestedMode: 'canvas',
  focusedTileId: 'second',
  fullviewActiveTileId: null,
  tiles: [tile('first', 1), tile('second', 2)],
  splitViewState,
})

if (gridToCanvasSwitch?.workspaceTypeSwitch !== 'canvas' || gridToCanvasSwitch.viewMode !== 'canvas') {
  throw new Error('Grid must transition to Canvas through the workspace type switch path')
}
