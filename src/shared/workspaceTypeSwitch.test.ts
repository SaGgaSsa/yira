import {
  createCanvasStateForWorkspaceTypeSwitch,
  reconcileCanvasStateWithSharedTiles,
  reconcileGridStateWithSharedTiles,
} from './workspaceTypeSwitch'
import type { CanvasState, GridLayoutNode, GridWorkspaceState, TileState } from './types'

function tile(id: string, zIndex: number, patch: Partial<TileState> = {}): TileState {
  return {
    id,
    type: 'terminal',
    x: zIndex * 100,
    y: zIndex * 120,
    width: 900,
    height: 400,
    zIndex,
    ...patch,
  }
}

function canvasState(tiles: TileState[], boardVisible = true): CanvasState {
  return {
    tiles,
    viewport: { tx: 12, ty: 24, zoom: 0.75 },
    nextZIndex: 20,
    focusedTileId: tiles[0]?.id ?? null,
    viewMode: 'canvas',
    fullviewActiveTileId: tiles[0]?.id ?? null,
    boardVisible,
    splitViewState: {
      leftTileIds: tiles[0] ? [tiles[0].id] : [],
      rightTileIds: tiles[1] ? [tiles[1].id] : [],
      activeLeftTileId: tiles[0]?.id ?? null,
      activeRightTileId: tiles[1]?.id ?? null,
      focusedPanel: 'left',
      orientation: 'vertical',
    },
  }
}

function leafIds(node: GridLayoutNode | null): string[] {
  if (!node) return []
  if (node.type === 'leaf') return [node.tileId]
  return node.children.flatMap(leafIds)
}

const firstGrid = reconcileGridStateWithSharedTiles(null, [
  tile('one', 1),
  tile('two', 2),
  tile('three', 3),
])

if (firstGrid.viewMode !== 'gridview') throw new Error('first Canvas to Grid switch must open Grid view')
if (leafIds(firstGrid.gridViewState.rootNode).join(',') !== 'one,two,three') {
  throw new Error('first Canvas to Grid switch must create a grid layout from shared attached tiles')
}

const firstCanvas = createCanvasStateForWorkspaceTypeSwitch([
  tile('one', 1, { label: 'Shared one' }),
  tile('two', 2),
])
if (firstCanvas.viewMode !== 'canvas') throw new Error('first Grid to Canvas switch must open Canvas view')
if (firstCanvas.boardVisible !== true) throw new Error('new Canvas state must show the board by default')
if (firstCanvas.tiles.map((entry) => entry.id).join(',') !== 'one,two') {
  throw new Error('first Grid to Canvas switch must keep shared tiles')
}
if (firstCanvas.splitViewState?.leftTileIds.length !== 0) {
  throw new Error('first Grid to Canvas switch must not invent Canvas-only layout state')
}

const preservedCanvas = reconcileCanvasStateWithSharedTiles(
  canvasState([
    tile('one', 1, { x: 420, y: 520, width: 700, height: 360, label: 'Old label' }),
    tile('two', 2),
  ]),
  [
    tile('one', 10, { x: 999, y: 999, width: 1200, height: 600, label: 'New label' }),
    tile('two', 20),
  ],
)
const preservedCanvasOne = preservedCanvas.tiles.find((entry) => entry.id === 'one')
if (!preservedCanvasOne) throw new Error('Canvas reconciliation must keep shared tile one')
if (preservedCanvasOne.label !== 'New label') throw new Error('Canvas reconciliation must copy shared tile edits')
if (preservedCanvasOne.x !== 420 || preservedCanvasOne.y !== 520 || preservedCanvasOne.width !== 700 || preservedCanvasOne.height !== 360) {
  throw new Error('Canvas reconciliation must preserve existing Canvas geometry')
}
if (preservedCanvas.nextZIndex <= Math.max(...preservedCanvas.tiles.map((entry) => entry.zIndex))) {
  throw new Error('Canvas reconciliation must keep nextZIndex ahead of reconciled tile z-indexes')
}

const hiddenCanvas = reconcileCanvasStateWithSharedTiles(
  canvasState([tile('one', 1)], false),
  [tile('one', 10)],
)
if (hiddenCanvas.boardVisible !== false) {
  throw new Error('Canvas reconciliation must preserve an explicitly hidden board')
}

const sourceHiddenCanvas = reconcileCanvasStateWithSharedTiles(
  canvasState([tile('one', 1)], true),
  [tile('one', 10)],
  false,
)
if (sourceHiddenCanvas.boardVisible !== false) {
  throw new Error('Canvas reconciliation must preserve source board visibility over a visible target layout')
}

const gridRoot: GridLayoutNode = {
  id: 'root',
  type: 'split',
  direction: 'row',
  sizes: [30, 70],
  children: [
    { id: 'leaf-two', type: 'leaf', tileId: 'two' },
    { id: 'leaf-one', type: 'leaf', tileId: 'one' },
  ],
}
const preservedGrid = reconcileGridStateWithSharedTiles(
  {
    tiles: [tile('one', 1, { label: 'Old one' }), tile('two', 2)],
    nextZIndex: 5,
    focusedTileId: 'one',
    fullviewActiveTileId: 'one',
    viewMode: 'fullview',
    boardVisible: false,
    gridViewState: { rootNode: gridRoot },
  },
  [tile('one', 10, { label: 'New one' }), tile('two', 20)],
)
const preservedGridRoot = preservedGrid.gridViewState.rootNode
if (!preservedGridRoot || preservedGridRoot.type !== 'split') throw new Error('Grid reconciliation must preserve split root')
if (preservedGridRoot.sizes.join(',') !== '30,70') throw new Error('Grid reconciliation must preserve grid split sizes')
if (leafIds(preservedGridRoot).join(',') !== 'two,one') throw new Error('Grid reconciliation must preserve grid leaf order')
if (preservedGrid.tiles.find((entry) => entry.id === 'one')?.label !== 'New one') {
  throw new Error('Grid reconciliation must copy shared tile edits')
}
if (preservedGrid.boardVisible !== false) {
  throw new Error('Grid reconciliation must preserve an explicitly hidden board')
}

const sourceHiddenGrid = reconcileGridStateWithSharedTiles(
  {
    tiles: [tile('one', 1)],
    nextZIndex: 5,
    focusedTileId: 'one',
    fullviewActiveTileId: 'one',
    viewMode: 'gridview',
    boardVisible: true,
    gridViewState: { rootNode: { id: 'visible-target', type: 'leaf', tileId: 'one' } },
  },
  [tile('one', 10)],
  false,
)
if (sourceHiddenGrid.boardVisible !== false) {
  throw new Error('Grid reconciliation must preserve source board visibility over a visible target layout')
}

const deletedAndAddedGrid = reconcileGridStateWithSharedTiles(
  {
    tiles: [tile('one', 1), tile('two', 2), tile('three', 3)],
    nextZIndex: 4,
    focusedTileId: 'one',
    fullviewActiveTileId: 'one',
    viewMode: 'gridview',
    gridViewState: {
      rootNode: {
        id: 'root-delete-add',
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
  },
  [tile('two', 2), tile('four', 4)],
)
if (leafIds(deletedAndAddedGrid.gridViewState.rootNode).join(',') !== 'two,four') {
  throw new Error('Grid reconciliation must remove deleted tiles and insert added shared tiles')
}

const deletedAndAddedCanvas = reconcileCanvasStateWithSharedTiles(
  canvasState([tile('one', 1), tile('two', 2, { x: 777 })]),
  [tile('two', 20, { x: 1000, label: 'Shared two' }), tile('four', 4)],
)
if (deletedAndAddedCanvas.tiles.map((entry) => entry.id).join(',') !== 'two,four') {
  throw new Error('Canvas reconciliation must remove deleted tiles and append added shared tiles')
}
const reconciledTwo = deletedAndAddedCanvas.tiles.find((entry) => entry.id === 'two')
if (!reconciledTwo || reconciledTwo.x !== 777 || reconciledTwo.label !== 'Shared two') {
  throw new Error('Canvas reconciliation must preserve existing geometry while copying shared edits')
}
