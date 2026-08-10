import { useCanvasStore } from './canvasStore'
import type { CanvasState, GridWorkspaceState, TileState } from '@shared/types'
import { normalizeWorkspaceConfig } from '@shared/workspaceConfig'

function tile(id: string, zIndex: number): TileState {
  return {
    id,
    type: 'terminal',
    x: zIndex * 100,
    y: zIndex * 100,
    width: 900,
    height: 400,
    zIndex,
  }
}

const canvasState: CanvasState = {
  tiles: [tile('one', 1), tile('two', 2)],
  groups: [],
  viewport: { tx: 0, ty: 0, zoom: 1 },
  nextZIndex: 3,
  focusedTileId: 'two',
  viewMode: 'canvas',
  fullviewActiveTileId: 'two',
  splitViewState: {
    leftTileIds: ['one'],
    rightTileIds: ['two'],
    activeLeftTileId: 'one',
    activeRightTileId: 'two',
    focusedPanel: 'right',
    orientation: 'vertical',
  },
}

useCanvasStore.getState().restoreWorkspaceState('workspace-canvas', 'Canvas', normalizeWorkspaceConfig({ type: 'canvas' }), canvasState)
useCanvasStore.getState().detachTileToFloating('two', { x: 20, y: 30, width: 640, height: 420 })

const detachedCanvasTile = useCanvasStore.getState().tiles.find((entry) => entry.id === 'two')
if (!detachedCanvasTile?.floating?.detached) {
  throw new Error('store canvas detach must mark tile floating')
}
if (useCanvasStore.getState().fullviewActiveTileId === 'two') {
  throw new Error('store canvas detach must clear detached fullview active tile')
}
if (useCanvasStore.getState().splitViewState.rightTileIds.includes('two')) {
  throw new Error('store canvas detach must remove tile from split view panels')
}

useCanvasStore.getState().attachFloatingTile('two')
const attachedCanvasTile = useCanvasStore.getState().tiles.find((entry) => entry.id === 'two')
if (attachedCanvasTile?.floating !== undefined) {
  throw new Error('store canvas attach must clear floating state')
}

const gridState: GridWorkspaceState = {
  tiles: [tile('one', 1), tile('two', 2), tile('three', 3)],
  nextZIndex: 4,
  focusedTileId: 'two',
  fullviewActiveTileId: 'two',
  viewMode: 'gridview',
  gridViewState: {
    rootNode: {
      id: 'root',
      type: 'split',
      direction: 'row',
      sizes: [10, 20, 30],
      children: [
        { id: 'leaf-one', type: 'leaf', tileId: 'one' },
        { id: 'leaf-two', type: 'leaf', tileId: 'two' },
        { id: 'leaf-three', type: 'leaf', tileId: 'three' },
      ],
    },
  },
}

useCanvasStore.getState().restoreGridWorkspaceState('workspace-grid', 'Grid', normalizeWorkspaceConfig({ type: 'grid' }), gridState)
useCanvasStore.getState().detachTileToFloating('two')
const detachedGridState = useCanvasStore.getState()
if (JSON.stringify(detachedGridState.gridViewState.rootNode).includes('"tileId":"two"')) {
  throw new Error('store grid detach must remove detached tile from grid root')
}

useCanvasStore.getState().attachFloatingTile('two')
const restoredRoot = useCanvasStore.getState().gridViewState.rootNode
if (!restoredRoot || restoredRoot.type !== 'split') throw new Error('store grid attach must restore a split root')
if (restoredRoot.children.map((child) => child.type === 'leaf' ? child.tileId : child.id).join(',') !== 'one,two,three') {
  throw new Error('store grid attach must restore previous placement')
}
