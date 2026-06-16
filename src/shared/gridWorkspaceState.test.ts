import {
  GRID_MAX_TILES,
  createEmptyGridWorkspaceState,
  insertTileIntoGridLayout,
  normalizeGridWorkspaceState,
  removeTileFromGridLayout,
  resizeGridChild,
  swapGridTiles,
} from './gridWorkspaceState'
import type { GridLayoutNode, GridWorkspaceState, TileState } from './types'

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

const empty = createEmptyGridWorkspaceState()
if (empty.viewMode !== 'gridview') throw new Error('empty grid workspace must open in grid view')
if (empty.gridViewState.rootNode !== null) throw new Error('empty grid workspace must not create a root node')

let root: GridLayoutNode | null = null
for (const id of ['one', 'two', 'three', 'four', 'five', 'six']) {
  root = insertTileIntoGridLayout(root, id)
}

if (!root || root.type !== 'split') throw new Error('grid insertions must create a split root')
if (root.direction !== 'row') throw new Error('second grid insertion must split the root horizontally')
if (root.children.length !== 5) throw new Error('next insert location must fill root to five children before going deeper')
const lastRootChild = root.children[root.children.length - 1]
if (lastRootChild.type !== 'split') throw new Error('sixth grid insertion must go one level deeper')
if (lastRootChild.children.map((child) => child.type === 'leaf' ? child.tileId : '').join(',') !== 'five,six') {
  throw new Error('sixth grid insertion must split the last root leaf')
}

root = insertTileIntoGridLayout(root, 'seven')
if (!root || root.type !== 'split') throw new Error('seventh grid insertion must keep a split root')
const fourthRootChild = root.children[root.children.length - 2]
if (fourthRootChild.type !== 'split') throw new Error('seventh grid insertion must balance into the next shallow leaf')
if (fourthRootChild.children.map((child) => child.type === 'leaf' ? child.tileId : '').join(',') !== 'four,seven') {
  throw new Error('seventh grid insertion must split the next shallow leaf')
}

const resized = resizeGridChild(root, root.id, 0, 22)
if (!resized || resized.type !== 'split') throw new Error('resize must preserve split root')
if (resized.sizes[0] !== 22) throw new Error('resize must update target child size')

const withoutThree = removeTileFromGridLayout(resized, 'three')
if (!withoutThree || withoutThree.type !== 'split') throw new Error('remove must preserve split root when multiple tiles remain')
if (withoutThree.sizes[0] !== 22) throw new Error('remove must preserve sibling sizes that are still present')

const swapped = swapGridTiles(resized, 'one', 'six')
const leavesAfterSwap = JSON.stringify(swapped)
if (!leavesAfterSwap.includes('"tileId":"six"') || !leavesAfterSwap.includes('"tileId":"one"')) {
  throw new Error('swap must preserve both swapped tile leaves')
}

const dirtyState: GridWorkspaceState = {
  tiles: [tile('one', 1), tile('two', 2), tile('three', 3)],
  nextZIndex: 4,
  focusedTileId: 'missing',
  fullviewActiveTileId: 'missing',
  viewMode: 'splitview' as 'gridview',
  gridViewState: {
    rootNode: {
      id: 'root',
      type: 'split',
      direction: 'row',
      sizes: [10, 10, 10],
      children: [
        { id: 'leaf-one', type: 'leaf', tileId: 'one' },
        { id: 'leaf-stale', type: 'leaf', tileId: 'stale' },
        { id: 'leaf-one-duplicate', type: 'leaf', tileId: 'one' },
      ],
    },
  },
}

const normalized = normalizeGridWorkspaceState(dirtyState)
if (normalized.viewMode !== 'gridview') throw new Error('invalid grid view mode must normalize to gridview')
if (normalized.focusedTileId !== null) throw new Error('missing focused tile id must normalize to null')
if (normalized.fullviewActiveTileId !== 'one') throw new Error('missing fullview active id must fall back to first tile')
if (!normalized.gridViewState.rootNode) throw new Error('normalization must keep or rebuild root node')
const normalizedJson = JSON.stringify(normalized.gridViewState.rootNode)
for (const id of ['one', 'two', 'three']) {
  if (!normalizedJson.includes(`"tileId":"${id}"`)) throw new Error(`normalization must include tile ${id}`)
}
if (normalizedJson.includes('stale')) throw new Error('normalization must remove stale tile leaves')

const tooManyTiles = Array.from({ length: GRID_MAX_TILES + 1 }, (_, index) => tile(`tile-${index}`, index + 1))
try {
  normalizeGridWorkspaceState({ ...createEmptyGridWorkspaceState(), tiles: tooManyTiles })
  throw new Error('grid normalization must reject tile 25')
} catch (error) {
  if (!(error instanceof Error) || error.message !== `Grid workspaces can contain at most ${GRID_MAX_TILES} tiles`) throw error
}
