import {
  attachFloatingTile,
  detachTileForFloating,
  getAttachedTiles,
  isTileDetached,
  normalizeFloatingTileState,
  selectFloatingTileWindowOpenRequests,
} from './floatingTiles'
import type { GridLayoutNode, TileState } from './types'

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

const tiles = [
  tile('one', 1),
  { ...tile('two', 2), floating: { detached: true as const } },
  tile('three', 3),
]

if (!isTileDetached(tiles[1])) throw new Error('detached floating state must mark a tile as detached')
if (isTileDetached(tiles[0])) throw new Error('missing floating state must keep a tile attached')
if (getAttachedTiles(tiles).map((entry) => entry.id).join(',') !== 'one,three') {
  throw new Error('attached tiles helper must filter detached tiles out')
}

const dirtyFloatingTile = normalizeFloatingTileState({
  ...tile('dirty', 1),
  floating: { detached: false, bounds: { x: Number.NaN, y: 20, width: 0, height: 400 } } as unknown as TileState['floating'],
})
if (dirtyFloatingTile.floating !== undefined) {
  throw new Error('normalization must remove invalid legacy floating state')
}

const detachedCanvas = detachTileForFloating({
  tiles: [tile('one', 1), tile('two', 2)],
  tileId: 'two',
})
const detachedCanvasTile = detachedCanvas.tiles.find((entry) => entry.id === 'two')
if (!detachedCanvasTile?.floating?.detached) {
  throw new Error('canvas detach must mark the target tile as detached')
}

const attachedCanvas = attachFloatingTile({
  tiles: detachedCanvas.tiles,
  tileId: 'two',
})
const attachedCanvasTile = attachedCanvas.tiles.find((entry) => entry.id === 'two')
if (attachedCanvasTile?.floating !== undefined) {
  throw new Error('canvas attach must clear floating state')
}

const gridRoot: GridLayoutNode = {
  id: 'root',
  type: 'split',
  direction: 'row',
  sizes: [10, 20, 30],
  children: [
    { id: 'leaf-one', type: 'leaf', tileId: 'one' },
    { id: 'leaf-two', type: 'leaf', tileId: 'two' },
    { id: 'leaf-three', type: 'leaf', tileId: 'three' },
  ],
}

const detachedGrid = detachTileForFloating({
  tiles: [tile('one', 1), tile('two', 2), tile('three', 3)],
  tileId: 'two',
  gridRootNode: gridRoot,
})
if (JSON.stringify(detachedGrid.gridRootNode).includes('"tileId":"two"')) {
  throw new Error('grid detach must remove the target tile from the visible layout')
}
const detachedGridTile = detachedGrid.tiles.find((entry) => entry.id === 'two')
if (!detachedGridTile?.floating?.gridPlacement?.rootNode) {
  throw new Error('grid detach must store the previous grid placement')
}

const restoredGrid = attachFloatingTile({
  tiles: detachedGrid.tiles,
  tileId: 'two',
  gridRootNode: detachedGrid.gridRootNode,
})
if (!restoredGrid.gridRootNode || restoredGrid.gridRootNode.type !== 'split') {
  throw new Error('grid attach restore must keep a split root')
}
if (restoredGrid.gridRootNode.children.map((child) => child.type === 'leaf' ? child.tileId : child.id).join(',') !== 'one,two,three') {
  throw new Error('grid attach must restore the saved placement when the visible layout did not change')
}
if (restoredGrid.gridRootNode.sizes.join(',') !== '10,20,30') {
  throw new Error('grid attach restore must preserve saved split sizes')
}

const changedGridRoot: GridLayoutNode = {
  id: 'changed-root',
  type: 'split',
  direction: 'column',
  sizes: [10, 10],
  children: [
    { id: 'leaf-three', type: 'leaf', tileId: 'three' },
    { id: 'leaf-one', type: 'leaf', tileId: 'one' },
  ],
}
const fallbackGrid = attachFloatingTile({
  tiles: detachedGrid.tiles,
  tileId: 'two',
  gridRootNode: changedGridRoot,
})
if (JSON.stringify(fallbackGrid.gridRootNode) === JSON.stringify(gridRoot)) {
  throw new Error('grid attach must not restore stale placement after layout changes')
}
if (!JSON.stringify(fallbackGrid.gridRootNode).includes('"tileId":"two"')) {
  throw new Error('grid attach fallback must insert the tile back into the layout')
}

const firstOpenRequests = selectFloatingTileWindowOpenRequests({
  previousWorkspaceId: null,
  previousDetachedTileIds: new Set(),
  workspaceId: 'workspace',
  tiles: [
    { ...tile('floating', 1), floating: { detached: true, bounds: { x: 10, y: 20, width: 900, height: 500 } } },
  ],
})
if (firstOpenRequests.map((request) => request.tileId).join(',') !== 'floating') {
  throw new Error('detached window restore must open detached tiles when a workspace becomes active')
}

const boundsOnlyOpenRequests = selectFloatingTileWindowOpenRequests({
  previousWorkspaceId: 'workspace',
  previousDetachedTileIds: new Set(['floating']),
  workspaceId: 'workspace',
  tiles: [
    { ...tile('floating', 1), floating: { detached: true, bounds: { x: 30, y: 40, width: 920, height: 520 } } },
  ],
})
if (boundsOnlyOpenRequests.length !== 0) {
  throw new Error('detached window restore must not reopen an already tracked detached tile after bounds-only changes')
}

const newlyDetachedOpenRequests = selectFloatingTileWindowOpenRequests({
  previousWorkspaceId: 'workspace',
  previousDetachedTileIds: new Set(['floating']),
  workspaceId: 'workspace',
  tiles: [
    { ...tile('floating', 1), floating: { detached: true } },
    { ...tile('new-floating', 2), floating: { detached: true } },
  ],
})
if (newlyDetachedOpenRequests.map((request) => request.tileId).join(',') !== 'new-floating') {
  throw new Error('detached window restore must open tiles that newly become detached in the active workspace')
}
