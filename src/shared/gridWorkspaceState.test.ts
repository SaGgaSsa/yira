import {
  GRID_MAX_TILES,
  commitGridDragAction,
  computeGridDragAction,
  createEmptyGridWorkspaceState,
  determineGridDropDirection,
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

const dropRect = { left: 100, top: 200, width: 500, height: 300 }
if (determineGridDropDirection(dropRect, { x: 350, y: 350 }) !== 'center') {
  throw new Error('center fifth must map to center drop direction')
}
if (determineGridDropDirection(dropRect, { x: 110, y: 350 }) !== 'outer-left') {
  throw new Error('left outer fifth must map to outer-left drop direction')
}
if (determineGridDropDirection(dropRect, { x: 590, y: 350 }) !== 'outer-right') {
  throw new Error('right outer fifth must map to outer-right drop direction')
}
if (determineGridDropDirection(dropRect, { x: 350, y: 210 }) !== 'outer-top') {
  throw new Error('top outer fifth must map to outer-top drop direction')
}
if (determineGridDropDirection(dropRect, { x: 350, y: 490 }) !== 'outer-bottom') {
  throw new Error('bottom outer fifth must map to outer-bottom drop direction')
}
if (determineGridDropDirection(dropRect, { x: 220, y: 350 }) !== 'left') {
  throw new Error('left side must map to left drop direction')
}
if (determineGridDropDirection(dropRect, { x: 480, y: 350 }) !== 'right') {
  throw new Error('right side must map to right drop direction')
}
if (determineGridDropDirection(dropRect, { x: 350, y: 275 }) !== 'top') {
  throw new Error('top side must map to top drop direction')
}
if (determineGridDropDirection(dropRect, { x: 350, y: 425 }) !== 'bottom') {
  throw new Error('bottom side must map to bottom drop direction')
}
if (determineGridDropDirection(dropRect, { x: 99, y: 350 }) !== null) {
  throw new Error('points outside the target rect must not produce a drop direction')
}

const dragRoot: GridLayoutNode = {
  id: 'root',
  type: 'split',
  direction: 'row',
  sizes: [15, 25, 35],
  children: [
    { id: 'leaf-a', type: 'leaf', tileId: 'a' },
    {
      id: 'split-bc',
      type: 'split',
      direction: 'column',
      sizes: [12, 18],
      children: [
        { id: 'leaf-b', type: 'leaf', tileId: 'b' },
        { id: 'leaf-c', type: 'leaf', tileId: 'c' },
      ],
    },
    { id: 'leaf-d', type: 'leaf', tileId: 'd' },
  ],
}

const centerAction = computeGridDragAction(dragRoot, 'a', 'd', dropRect, { x: 350, y: 350 })
if (centerAction.type !== 'swap') throw new Error('center drop must compute a swap action')
const centerSwap = commitGridDragAction(dragRoot, centerAction)
if (!centerSwap || centerSwap.type !== 'split') throw new Error('center swap must preserve the split root')
if (centerSwap.children[0].type !== 'leaf' || centerSwap.children[0].tileId !== 'd') {
  throw new Error('center swap must put the target tile in the source slot')
}
if (centerSwap.children[2].type !== 'leaf' || centerSwap.children[2].tileId !== 'a') {
  throw new Error('center swap must put the source tile in the target slot')
}
if (centerSwap.sizes.join(',') !== '15,25,35') throw new Error('center swap must preserve layout sizes')

const staleSourceCenterAction = computeGridDragAction(
  dragRoot,
  'missing-source',
  'd',
  dropRect,
  { x: 350, y: 350 },
)
if (staleSourceCenterAction.type !== 'none') {
  throw new Error('a center drop from a source missing from the committed root must be a no-op')
}
const staleSourceCenterCommit = commitGridDragAction(
  dragRoot,
  { type: 'swap', sourceTileId: 'missing-source', targetTileId: 'd' },
)
if (staleSourceCenterCommit !== dragRoot) {
  throw new Error('committing an invalid-source center action must return the original tree')
}
const missingTargetCenterAction = computeGridDragAction(
  dragRoot,
  'a',
  'missing-target',
  dropRect,
  { x: 350, y: 350 },
)
if (missingTargetCenterAction.type !== 'none') {
  throw new Error('a center drop onto a target missing from the committed root must be a no-op')
}
const missingTargetCenterCommit = commitGridDragAction(
  dragRoot,
  { type: 'swap', sourceTileId: 'a', targetTileId: 'missing-target' },
)
if (missingTargetCenterCommit !== dragRoot) {
  throw new Error('committing an invalid-target center action must return the original tree')
}

const moveRight = commitGridDragAction(
  dragRoot,
  computeGridDragAction(dragRoot, 'b', 'd', dropRect, { x: 480, y: 350 }),
)
if (!moveRight || moveRight.type !== 'split') throw new Error('right move must keep a split root')
if (moveRight.children.map((child) => child.type === 'leaf' ? child.tileId : child.id).join(',') !== 'a,c,d,b') {
  throw new Error('right move must insert the source after the target in a row split')
}
if (moveRight.sizes.slice(0, 3).join(',') !== '15,25,35') {
  throw new Error('right move must preserve unaffected root sibling sizes')
}
const prunedNested = moveRight.children[1]
if (prunedNested.type !== 'leaf' || prunedNested.tileId !== 'c') {
  throw new Error('moving out of a two-child split must prune the single-child split')
}

const moveLeft = commitGridDragAction(
  dragRoot,
  computeGridDragAction(dragRoot, 'd', 'a', dropRect, { x: 220, y: 350 }),
)
if (!moveLeft || moveLeft.type !== 'split') throw new Error('left move must keep a split root')
if (moveLeft.children.map((child) => child.type === 'leaf' ? child.tileId : child.id).join(',') !== 'd,a,split-bc') {
  throw new Error('left move must insert the source before the target in a row split')
}

const moveTop = commitGridDragAction(
  dragRoot,
  computeGridDragAction(dragRoot, 'd', 'a', dropRect, { x: 350, y: 275 }),
)
if (!moveTop || moveTop.type !== 'split') throw new Error('top move must keep a root node')
const firstMoveTopChild = moveTop.children[0]
if (firstMoveTopChild.type !== 'split' || firstMoveTopChild.direction !== 'column') {
  throw new Error('top move onto a row child must create a column split')
}
if (firstMoveTopChild.children.map((child) => child.type === 'leaf' ? child.tileId : '').join(',') !== 'd,a') {
  throw new Error('top move must insert the source above the target')
}

const moveBottom = commitGridDragAction(
  dragRoot,
  computeGridDragAction(dragRoot, 'd', 'a', dropRect, { x: 350, y: 425 }),
)
if (!moveBottom || moveBottom.type !== 'split') throw new Error('bottom move must keep a root node')
const firstMoveBottomChild = moveBottom.children[0]
if (firstMoveBottomChild.type !== 'split' || firstMoveBottomChild.direction !== 'column') {
  throw new Error('bottom move onto a row child must create a column split')
}
if (firstMoveBottomChild.children.map((child) => child.type === 'leaf' ? child.tileId : '').join(',') !== 'a,d') {
  throw new Error('bottom move must insert the source below the target')
}

const outerLeft = commitGridDragAction(
  dragRoot,
  computeGridDragAction(dragRoot, 'd', 'c', dropRect, { x: 110, y: 350 }),
)
if (!outerLeft || outerLeft.type !== 'split') throw new Error('outer-left move must keep a split root')
if (outerLeft.children.map((child) => child.type === 'leaf' ? child.tileId : child.id).join(',') !== 'a,d,split-bc') {
  throw new Error('outer-left move must insert before the target parent when parent/grandparent layout allows it')
}

const outerTopAction = computeGridDragAction(dragRoot, 'd', 'a', dropRect, { x: 350, y: 210 })
if (outerTopAction.type !== 'move' || outerTopAction.direction !== 'outer-top') {
  throw new Error('outer-top must remain available as a move action')
}
const outerTop = commitGridDragAction(dragRoot, outerTopAction)
const outerTopFirstChild = outerTop?.type === 'split' ? outerTop.children[0] : null
if (outerTopFirstChild?.type !== 'split' || outerTopFirstChild.direction !== 'column') {
  throw new Error('outer-top must place the source in a vertical split before the target')
}

const outerLeftAction = computeGridDragAction(dragRoot, 'd', 'c', dropRect, { x: 110, y: 350 })
const outerRight = computeGridDragAction(dragRoot, 'a', 'c', dropRect, { x: 590, y: 350 })
const outerBottom = computeGridDragAction(dragRoot, 'a', 'c', dropRect, { x: 350, y: 490 })
if (outerLeftAction.type !== 'move' || outerLeftAction.direction !== 'outer-left') {
  throw new Error('outer-left must remain available as a move action')
}
if (outerRight.type !== 'move' || outerRight.direction !== 'outer-right') {
  throw new Error('outer-right must remain available as a move action')
}
if (outerBottom.type !== 'move' || outerBottom.direction !== 'outer-bottom') {
  throw new Error('outer-bottom must remain available as a move action')
}
const committedOuterRight = commitGridDragAction(dragRoot, outerRight)
if (
  !committedOuterRight
  || committedOuterRight.type !== 'split'
  || committedOuterRight.direction !== 'row'
  || committedOuterRight.children.map((child) => child.type === 'leaf' ? child.tileId : child.id).join(',') !== 'split-bc,a,d'
) {
  throw new Error('outer-right must place the source after the target parent in the containing row')
}
const committedOuterBottom = commitGridDragAction(dragRoot, outerBottom)
const outerBottomTargetParent = committedOuterBottom?.type === 'split'
  ? committedOuterBottom.children[0]
  : null
if (
  outerBottomTargetParent?.type !== 'split'
  || outerBottomTargetParent.direction !== 'column'
  || outerBottomTargetParent.children.map((child) => child.type === 'leaf' ? child.tileId : child.id).join(',') !== 'b,c,a'
) {
  throw new Error('outer-bottom must place the source after the target in its containing column')
}

const noopRoot: GridLayoutNode = {
  id: 'noop-root',
  type: 'split',
  direction: 'row',
  sizes: [10, 20, 30],
  children: [
    { id: 'noop-a', type: 'leaf', tileId: 'a' },
    { id: 'noop-b', type: 'leaf', tileId: 'b' },
    { id: 'noop-c', type: 'leaf', tileId: 'c' },
  ],
}
const noopLeft = computeGridDragAction(noopRoot, 'a', 'b', dropRect, { x: 220, y: 350 })
if (noopLeft.type !== 'none') throw new Error('dropping a tile immediately left of its current right neighbor must be a no-op')

const dirtyState: GridWorkspaceState = {
  tiles: [
    tile('one', 1),
    tile('two', 2),
    tile('three', 3),
    { id: 'files', type: 'files', x: 0, y: 0, width: 900, height: 400, zIndex: 5 } as unknown as TileState,
    { id: 'kanban', type: 'kanban', x: 0, y: 0, width: 1800, height: 800, zIndex: 4 } as unknown as TileState,
  ],
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
        { id: 'leaf-files', type: 'leaf', tileId: 'files' },
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
if (normalized.tiles.some((entry) => entry.id === 'kanban' || entry.id === 'files') || normalizedJson.includes('kanban') || normalizedJson.includes('files')) {
  throw new Error('grid normalization must drop legacy files and kanban tiles')
}

const tooManyTiles = Array.from({ length: GRID_MAX_TILES + 1 }, (_, index) => tile(`tile-${index}`, index + 1))
try {
  normalizeGridWorkspaceState({ ...createEmptyGridWorkspaceState(), tiles: tooManyTiles })
  throw new Error('grid normalization must reject tile 25')
} catch (error) {
  if (!(error instanceof Error) || error.message !== `Grid workspaces can contain at most ${GRID_MAX_TILES} tiles`) throw error
}
