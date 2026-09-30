import {
  GRID_MAX_TILES,
  type GridLayoutNode,
  type GridLayoutSplitNode,
  type GridViewMode,
  type GridWorkspaceState,
  type TileState,
} from './types'
import { normalizeFileMarkdownViewMode, normalizeTileSize } from './types'

export { GRID_MAX_TILES } from './types'

const DEFAULT_NODE_SIZE = 10
const DEFAULT_MAX_CHILDREN = 5
const DEFAULT_ROOT_DIRECTION: GridLayoutSplitNode['direction'] = 'row'

export type GridDropDirection =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'outer-top'
  | 'outer-right'
  | 'outer-bottom'
  | 'outer-left'
  | 'center'

export interface GridDropRect {
  left: number
  top: number
  width: number
  height: number
}

export interface GridPointerPosition {
  x: number
  y: number
}

export type PendingGridDragAction =
  | { type: 'none' }
  | { type: 'swap'; sourceTileId: string; targetTileId: string }
  | { type: 'move'; sourceTileId: string; targetTileId: string; direction: Exclude<GridDropDirection, 'center'> }

function createNodeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createLeaf(tileId: string): GridLayoutNode {
  return {
    id: `grid-leaf-${tileId}`,
    type: 'leaf',
    tileId,
  }
}

function reverseDirection(direction: GridLayoutSplitNode['direction']): GridLayoutSplitNode['direction'] {
  return direction === 'row' ? 'column' : 'row'
}

function normalizeViewMode(mode: unknown): GridViewMode {
  return mode === 'fullview' || mode === 'splitview' ? mode : 'gridview'
}

function normalizeTile(tile: TileState): TileState {
  const size = normalizeTileSize(tile.type, tile)
  const { hideTitlebar: _hideTitlebar, fileRevealRequest: _fileRevealRequest, ...tileWithoutTitlebar } = tile as TileState & { hideTitlebar?: unknown }
  const normalizedTile = tileWithoutTitlebar.type === 'files'
    ? { ...tileWithoutTitlebar, fileMarkdownView: normalizeFileMarkdownViewMode(tileWithoutTitlebar.fileMarkdownView) }
    : tileWithoutTitlebar

  return {
    ...normalizedTile,
    width: size.width,
    height: size.height,
  }
}

function isSupportedTile(tile: TileState): boolean {
  return tile.type === 'terminal' ||
    tile.type === 'note' ||
    tile.type === 'browser' ||
    tile.type === 'timer' ||
    (tile.type === 'files' && typeof tile.filePath === 'string' && tile.filePath.trim().length > 0)
}

function isDetachedTile(tile: TileState): boolean {
  return tile.floating?.detached === true
}

function collectLeafTileIds(node: GridLayoutNode | null): string[] {
  if (!node) return []
  if (node.type === 'leaf') return [node.tileId]
  return node.children.flatMap(collectLeafTileIds)
}

function sameGridTree(first: GridLayoutNode | null, second: GridLayoutNode | null): boolean {
  return JSON.stringify(first) === JSON.stringify(second)
}

interface LocatedLeaf {
  node: Extract<GridLayoutNode, { type: 'leaf' }>
  path: number[]
  parent: GridLayoutSplitNode | null
  parentPath: number[]
  index: number
}

function findLeafByTileId(
  node: GridLayoutNode | null,
  tileId: string,
  path: number[] = [],
  parent: GridLayoutSplitNode | null = null,
  parentPath: number[] = [],
): LocatedLeaf | null {
  if (!node) return null

  if (node.type === 'leaf') {
    if (node.tileId !== tileId) return null
    return {
      node,
      path,
      parent,
      parentPath,
      index: path[path.length - 1] ?? 0,
    }
  }

  for (let index = 0; index < node.children.length; index += 1) {
    const found = findLeafByTileId(node.children[index], tileId, [...path, index], node, path)
    if (found) return found
  }

  return null
}

function getSplitAtPath(rootNode: GridLayoutNode, path: number[]): GridLayoutSplitNode | null {
  let node = rootNode

  for (const index of path) {
    if (node.type !== 'split') return null
    const child = node.children[index]
    if (!child) return null
    node = child
  }

  return node.type === 'split' ? node : null
}

function makeMovedLeaf(tileId: string): GridLayoutNode {
  return createLeaf(tileId)
}

function insertChildAt(
  splitNode: GridLayoutSplitNode,
  index: number,
  child: GridLayoutNode,
  size: number,
): GridLayoutSplitNode {
  const boundedIndex = Math.max(0, Math.min(index, splitNode.children.length))
  const sizes = normalizeSplitSizes(splitNode.children, splitNode.sizes)

  return {
    ...splitNode,
    children: [
      ...splitNode.children.slice(0, boundedIndex),
      child,
      ...splitNode.children.slice(boundedIndex),
    ],
    sizes: [
      ...sizes.slice(0, boundedIndex),
      Math.max(1, size),
      ...sizes.slice(boundedIndex),
    ],
  }
}

function updateSplitAtPath(
  rootNode: GridLayoutNode,
  path: number[],
  update: (splitNode: GridLayoutSplitNode) => GridLayoutSplitNode,
): GridLayoutNode {
  if (path.length === 0) {
    if (rootNode.type !== 'split') return rootNode
    return update(rootNode)
  }

  if (rootNode.type === 'leaf') return rootNode
  const [nextIndex, ...remainingPath] = path

  return {
    ...rootNode,
    children: rootNode.children.map((child, index) => {
      if (index !== nextIndex) return child
      return updateSplitAtPath(child, remainingPath, update)
    }),
    sizes: normalizeSplitSizes(rootNode.children, rootNode.sizes),
  }
}

function replaceLeafWithSplit(
  rootNode: GridLayoutNode,
  targetTileId: string,
  splitDirection: GridLayoutSplitNode['direction'],
  movedLeaf: GridLayoutNode,
  movedSize: number,
  insertBefore: boolean,
): GridLayoutNode {
  if (rootNode.type === 'leaf') {
    if (rootNode.tileId !== targetTileId) return rootNode
    const children = insertBefore ? [movedLeaf, rootNode] : [rootNode, movedLeaf]
    const sizes = insertBefore ? [movedSize, DEFAULT_NODE_SIZE] : [DEFAULT_NODE_SIZE, movedSize]
    return {
      id: createNodeId('grid-split'),
      type: 'split',
      direction: splitDirection,
      children,
      sizes,
    }
  }

  return {
    ...rootNode,
    children: rootNode.children.map((child) => (
      replaceLeafWithSplit(child, targetTileId, splitDirection, movedLeaf, movedSize, insertBefore)
    )),
    sizes: normalizeSplitSizes(rootNode.children, rootNode.sizes),
  }
}

function normalizeSplitSizes(children: GridLayoutNode[], sizes: number[] | undefined): number[] {
  return children.map((_, index) => {
    const size = sizes?.[index]
    return typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : DEFAULT_NODE_SIZE
  })
}

function insertIntoLeaf(
  node: GridLayoutNode,
  tileId: string,
  parentDirection?: GridLayoutSplitNode['direction'],
): GridLayoutNode {
  if (node.type === 'split') return node

  const direction = parentDirection ? reverseDirection(parentDirection) : DEFAULT_ROOT_DIRECTION
  return {
    id: createNodeId('grid-split'),
    type: 'split',
    direction,
    children: [node, createLeaf(tileId)],
    sizes: [DEFAULT_NODE_SIZE, DEFAULT_NODE_SIZE],
  }
}

interface InsertTarget {
  nodeId: string
  insertAtParent: boolean
  childIndex: number
  depth: number
}

function insertTargetScore(target: InsertTarget): number {
  return Math.pow(target.depth, target.childIndex + DEFAULT_MAX_CHILDREN)
}

function findNextInsertTarget(node: GridLayoutNode, depth = 1): InsertTarget {
  if (node.type === 'leaf') {
    return {
      nodeId: node.id,
      insertAtParent: false,
      childIndex: 1,
      depth,
    }
  }

  const candidates: InsertTarget[] = []
  if (node.children.length < DEFAULT_MAX_CHILDREN) {
    candidates.push({
      nodeId: node.id,
      insertAtParent: true,
      childIndex: node.children.length,
      depth,
    })
  }

  for (const child of node.children.slice().reverse()) {
    candidates.push(findNextInsertTarget(child, depth + 1))
  }

  return candidates.sort((a, b) => insertTargetScore(a) - insertTargetScore(b))[0] ?? {
    nodeId: node.id,
    insertAtParent: true,
    childIndex: node.children.length,
    depth,
  }
}

function insertAtTarget(
  node: GridLayoutNode,
  target: InsertTarget,
  tileId: string,
  parentDirection?: GridLayoutSplitNode['direction'],
): GridLayoutNode {
  if (node.id === target.nodeId) {
    if (target.insertAtParent && node.type === 'split') {
      const sizes = normalizeSplitSizes(node.children, node.sizes)
      const childIndex = Math.max(0, Math.min(target.childIndex, node.children.length))
      return {
        ...node,
        children: [
          ...node.children.slice(0, childIndex),
          createLeaf(tileId),
          ...node.children.slice(childIndex),
        ],
        sizes: [
          ...sizes.slice(0, childIndex),
          DEFAULT_NODE_SIZE,
          ...sizes.slice(childIndex),
        ],
      }
    }

    return insertIntoLeaf(node, tileId, parentDirection)
  }

  if (node.type === 'leaf') return node

  return {
    ...node,
    children: node.children.map((child) => insertAtTarget(child, target, tileId, node.direction)),
    sizes: normalizeSplitSizes(node.children, node.sizes),
  }
}

export function insertTileIntoGridLayout(rootNode: GridLayoutNode | null, tileId: string): GridLayoutNode {
  if (!rootNode) return createLeaf(tileId)

  const target = findNextInsertTarget(rootNode)
  return insertAtTarget(rootNode, target, tileId)
}

function cleanGridNode(
  node: GridLayoutNode | null | undefined,
  validTileIds: Set<string>,
  seenTileIds: Set<string>,
): GridLayoutNode | null {
  if (!node) return null

  if (node.type === 'leaf') {
    if (!validTileIds.has(node.tileId) || seenTileIds.has(node.tileId)) return null
    seenTileIds.add(node.tileId)
    return {
      id: node.id || `grid-leaf-${node.tileId}`,
      type: 'leaf',
      tileId: node.tileId,
    }
  }

  const childrenWithSizes = node.children
    .map((child, index) => {
      const cleaned = cleanGridNode(child, validTileIds, seenTileIds)
      if (!cleaned) return null
      const size = node.sizes?.[index]
      return {
        child: cleaned,
        size: typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : DEFAULT_NODE_SIZE,
      }
    })
    .filter((entry): entry is { child: GridLayoutNode; size: number } => Boolean(entry))
  const children = childrenWithSizes.map((entry) => entry.child)

  if (children.length === 0) return null
  if (children.length === 1) return children[0]

  return {
    id: node.id || createNodeId('grid-split'),
    type: 'split',
    direction: node.direction === 'column' ? 'column' : 'row',
    children,
    sizes: childrenWithSizes.map((entry) => entry.size),
  }
}

export function normalizeGridLayout(rootNode: GridLayoutNode | null | undefined, tiles: TileState[]): GridLayoutNode | null {
  const attachedTiles = tiles.filter((tile) => !isDetachedTile(tile))
  const validTileIds = new Set(attachedTiles.map((tile) => tile.id))
  const seenTileIds = new Set<string>()
  let nextRoot = cleanGridNode(rootNode, validTileIds, seenTileIds)

  for (const tile of attachedTiles) {
    if (seenTileIds.has(tile.id)) continue
    nextRoot = insertTileIntoGridLayout(nextRoot, tile.id)
    seenTileIds.add(tile.id)
  }

  return nextRoot
}

export function createEmptyGridWorkspaceState(): GridWorkspaceState {
  return {
    tiles: [],
    nextZIndex: 1,
    focusedTileId: null,
    fullviewActiveTileId: null,
    viewMode: 'gridview',
    boardVisible: true,
    gridViewState: {
      rootNode: null,
    },
  }
}

export function normalizeGridWorkspaceState(state: GridWorkspaceState): GridWorkspaceState {
  if (state.tiles.length > GRID_MAX_TILES) {
    throw new Error(`Grid workspaces can contain at most ${GRID_MAX_TILES} tiles`)
  }

  const tiles = state.tiles.filter(isSupportedTile).map(normalizeTile)
  const attachedTileIds = new Set(tiles.filter((tile) => !isDetachedTile(tile)).map((tile) => tile.id))
  const focusedTileId = state.focusedTileId && attachedTileIds.has(state.focusedTileId)
    ? state.focusedTileId
    : null
  const fullviewActiveTileId = state.fullviewActiveTileId && attachedTileIds.has(state.fullviewActiveTileId)
    ? state.fullviewActiveTileId
    : focusedTileId ?? tiles.find((tile) => attachedTileIds.has(tile.id))?.id ?? null

  return {
    tiles,
    nextZIndex: Number.isFinite(state.nextZIndex) && state.nextZIndex > 0 ? state.nextZIndex : tiles.length + 1,
    focusedTileId,
    fullviewActiveTileId,
    viewMode: normalizeViewMode(state.viewMode),
    splitViewState: state.splitViewState,
    boardVisible: state.boardVisible !== false,
    gridViewState: {
      rootNode: normalizeGridLayout(state.gridViewState?.rootNode, tiles),
    },
  }
}

function dropDirectionToSplitDirection(direction: Exclude<GridDropDirection, 'center'>): GridLayoutSplitNode['direction'] {
  return direction === 'left' || direction === 'right' || direction === 'outer-left' || direction === 'outer-right'
    ? 'row'
    : 'column'
}

function dropDirectionInsertsBefore(direction: Exclude<GridDropDirection, 'center'>): boolean {
  return direction === 'left' || direction === 'top' || direction === 'outer-left' || direction === 'outer-top'
}

function isOuterDropDirection(direction: Exclude<GridDropDirection, 'center'>): boolean {
  return direction === 'outer-left' || direction === 'outer-right' || direction === 'outer-top' || direction === 'outer-bottom'
}

function isSameLocationMove(
  rootNode: GridLayoutNode,
  sourceTileId: string,
  targetTileId: string,
  direction: Exclude<GridDropDirection, 'center'>,
): boolean {
  if (isOuterDropDirection(direction)) return false

  const source = findLeafByTileId(rootNode, sourceTileId)
  const target = findLeafByTileId(rootNode, targetTileId)
  const splitDirection = dropDirectionToSplitDirection(direction)
  if (!source?.parent || !target?.parent || source.parent.id !== target.parent.id) return false
  if (source.parent.direction !== splitDirection) return false

  const insertsBefore = dropDirectionInsertsBefore(direction)
  return insertsBefore
    ? source.index === target.index - 1
    : source.index === target.index + 1
}

interface RemoveMoveResult {
  rootNode: GridLayoutNode | null
  movedSize: number
}

function removeTileForMove(rootNode: GridLayoutNode, tileId: string): RemoveMoveResult {
  let movedSize = DEFAULT_NODE_SIZE

  const removeFromNode = (node: GridLayoutNode): GridLayoutNode | null => {
    if (node.type === 'leaf') {
      return node.tileId === tileId ? null : node
    }

    const nextChildren: GridLayoutNode[] = []
    const nextSizes: number[] = []
    const sizes = normalizeSplitSizes(node.children, node.sizes)

    for (let index = 0; index < node.children.length; index += 1) {
      const child = node.children[index]
      const nextChild = removeFromNode(child)
      if (!nextChild) {
        if (child.type === 'leaf' && child.tileId === tileId) {
          movedSize = sizes[index] ?? DEFAULT_NODE_SIZE
        }
        continue
      }

      nextChildren.push(nextChild)
      nextSizes.push(sizes[index] ?? DEFAULT_NODE_SIZE)
    }

    if (nextChildren.length === 0) return null
    if (nextChildren.length === 1) return nextChildren[0]

    return {
      ...node,
      children: nextChildren,
      sizes: nextSizes,
    }
  }

  return {
    rootNode: removeFromNode(rootNode),
    movedSize,
  }
}

function insertMovedTile(
  rootNode: GridLayoutNode | null,
  sourceTileId: string,
  targetTileId: string,
  direction: Exclude<GridDropDirection, 'center'>,
  movedSize: number,
): GridLayoutNode | null {
  const movedLeaf = makeMovedLeaf(sourceTileId)
  if (!rootNode) return movedLeaf

  const target = findLeafByTileId(rootNode, targetTileId)
  if (!target) return rootNode

  const splitDirection = dropDirectionToSplitDirection(direction)
  const insertBefore = dropDirectionInsertsBefore(direction)

  if (isOuterDropDirection(direction) && target.parentPath.length > 0) {
    const grandparentPath = target.parentPath.slice(0, -1)
    const parentIndex = target.parentPath[target.parentPath.length - 1]
    const grandparent = getSplitAtPath(rootNode, grandparentPath)
    if (grandparent?.direction === splitDirection) {
      return updateSplitAtPath(rootNode, grandparentPath, (splitNode) => (
        insertChildAt(splitNode, insertBefore ? parentIndex : parentIndex + 1, movedLeaf, movedSize)
      ))
    }
  }

  if (target.parent?.direction === splitDirection) {
    return updateSplitAtPath(rootNode, target.parentPath, (splitNode) => (
      insertChildAt(splitNode, insertBefore ? target.index : target.index + 1, movedLeaf, movedSize)
    ))
  }

  return replaceLeafWithSplit(rootNode, targetTileId, splitDirection, movedLeaf, movedSize, insertBefore)
}

export function determineGridDropDirection(
  rect: GridDropRect | null | undefined,
  pointer: GridPointerPosition | null | undefined,
): GridDropDirection | null {
  if (!rect || !pointer) return null

  const { width, height, left, top } = rect
  const x = pointer.x - left
  const y = pointer.y - top

  if (x < 0 || x > width || y < 0 || y > height) return null

  const centerX1 = (2 * width) / 5
  const centerX2 = (3 * width) / 5
  const centerY1 = (2 * height) / 5
  const centerY2 = (3 * height) / 5
  if (x > centerX1 && x < centerX2 && y > centerY1 && y < centerY2) return 'center'

  const diagonal1 = y * width - x * height
  const diagonal2 = y * width + x * height - height * width
  if (diagonal1 === 0 || diagonal2 === 0) return null

  let directionIndex = 0
  if (diagonal2 > 0) directionIndex += 1
  if (diagonal1 > 0) {
    directionIndex += 2
    directionIndex = 5 - directionIndex
  }

  const isOuter = y < height / 5 || y > height - height / 5 || x < width / 5 || x > width - width / 5
  const directions: GridDropDirection[] = isOuter
    ? ['outer-top', 'outer-right', 'outer-bottom', 'outer-left']
    : ['top', 'right', 'bottom', 'left']

  return directions[directionIndex] ?? null
}

export function commitGridDragAction(
  rootNode: GridLayoutNode | null,
  action: PendingGridDragAction,
): GridLayoutNode | null {
  if (!rootNode || action.type === 'none') return rootNode
  if (
    action.sourceTileId === action.targetTileId
    || !findLeafByTileId(rootNode, action.sourceTileId)
    || !findLeafByTileId(rootNode, action.targetTileId)
  ) {
    return rootNode
  }

  if (action.type === 'swap') {
    return swapGridTiles(rootNode, action.sourceTileId, action.targetTileId)
  }

  const { rootNode: withoutSource, movedSize } = removeTileForMove(rootNode, action.sourceTileId)
  return insertMovedTile(withoutSource, action.sourceTileId, action.targetTileId, action.direction, movedSize)
}

export function computeGridDragAction(
  rootNode: GridLayoutNode | null,
  sourceTileId: string,
  targetTileId: string | null | undefined,
  targetRect: GridDropRect | null | undefined,
  pointer: GridPointerPosition | null | undefined,
): PendingGridDragAction {
  if (!rootNode || !targetTileId || sourceTileId === targetTileId) return { type: 'none' }
  if (!findLeafByTileId(rootNode, sourceTileId) || !findLeafByTileId(rootNode, targetTileId)) {
    return { type: 'none' }
  }

  const direction = determineGridDropDirection(targetRect, pointer)
  if (!direction) return { type: 'none' }

  if (direction !== 'center' && isSameLocationMove(rootNode, sourceTileId, targetTileId, direction)) {
    return { type: 'none' }
  }

  const action: PendingGridDragAction = direction === 'center'
    ? { type: 'swap', sourceTileId, targetTileId }
    : { type: 'move', sourceTileId, targetTileId, direction }

  return sameGridTree(commitGridDragAction(rootNode, action), rootNode) ? { type: 'none' } : action
}

export function resizeGridChild(
  rootNode: GridLayoutNode | null,
  splitNodeId: string,
  childIndex: number,
  size: number,
): GridLayoutNode | null {
  if (!rootNode) return null
  if (rootNode.type === 'leaf') return rootNode

  if (rootNode.id === splitNodeId) {
    return {
      ...rootNode,
      sizes: rootNode.children.map((_, index) => {
        if (index !== childIndex) return rootNode.sizes[index] ?? DEFAULT_NODE_SIZE
        return Math.max(1, size)
      }),
    }
  }

  return {
    ...rootNode,
    children: rootNode.children.map((child) => resizeGridChild(child, splitNodeId, childIndex, size) ?? child),
    sizes: normalizeSplitSizes(rootNode.children, rootNode.sizes),
  }
}

export function swapGridTiles(rootNode: GridLayoutNode | null, firstTileId: string, secondTileId: string): GridLayoutNode | null {
  if (!rootNode || firstTileId === secondTileId) return rootNode

  if (rootNode.type === 'leaf') {
    if (rootNode.tileId === firstTileId) return { ...rootNode, tileId: secondTileId }
    if (rootNode.tileId === secondTileId) return { ...rootNode, tileId: firstTileId }
    return rootNode
  }

  return {
    ...rootNode,
    children: rootNode.children.map((child) => swapGridTiles(child, firstTileId, secondTileId) ?? child),
  }
}

export function removeTileFromGridLayout(rootNode: GridLayoutNode | null, tileId: string): GridLayoutNode | null {
  if (!rootNode) return null
  const remainingTileIds = new Set(collectLeafTileIds(rootNode).filter((id) => id !== tileId))
  return cleanGridNode(rootNode, remainingTileIds, new Set())
}
