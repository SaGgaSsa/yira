import {
  GRID_MAX_TILES,
  type GridLayoutNode,
  type GridLayoutSplitNode,
  type GridViewMode,
  type GridWorkspaceState,
  type TileState,
} from './types'
import { normalizeTileSize } from './types'

export { GRID_MAX_TILES } from './types'

const DEFAULT_NODE_SIZE = 10
const DEFAULT_MAX_CHILDREN = 5
const DEFAULT_ROOT_DIRECTION: GridLayoutSplitNode['direction'] = 'row'

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
  return mode === 'fullview' ? 'fullview' : 'gridview'
}

function normalizeTile(tile: TileState): TileState {
  const size = normalizeTileSize(tile.type, tile)
  const { hideTitlebar: _hideTitlebar, ...tileWithoutTitlebar } = tile as TileState & { hideTitlebar?: unknown }

  return {
    ...tileWithoutTitlebar,
    width: size.width,
    height: size.height,
  }
}

function collectLeafTileIds(node: GridLayoutNode | null): string[] {
  if (!node) return []
  if (node.type === 'leaf') return [node.tileId]
  return node.children.flatMap(collectLeafTileIds)
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
  const validTileIds = new Set(tiles.map((tile) => tile.id))
  const seenTileIds = new Set<string>()
  let nextRoot = cleanGridNode(rootNode, validTileIds, seenTileIds)

  for (const tile of tiles) {
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
    gridViewState: {
      rootNode: null,
    },
  }
}

export function normalizeGridWorkspaceState(state: GridWorkspaceState): GridWorkspaceState {
  if (state.tiles.length > GRID_MAX_TILES) {
    throw new Error(`Grid workspaces can contain at most ${GRID_MAX_TILES} tiles`)
  }

  const tiles = state.tiles.map(normalizeTile)
  const tileIds = new Set(tiles.map((tile) => tile.id))
  const focusedTileId = state.focusedTileId && tileIds.has(state.focusedTileId)
    ? state.focusedTileId
    : null
  const fullviewActiveTileId = state.fullviewActiveTileId && tileIds.has(state.fullviewActiveTileId)
    ? state.fullviewActiveTileId
    : focusedTileId ?? tiles[0]?.id ?? null

  return {
    tiles,
    nextZIndex: Number.isFinite(state.nextZIndex) && state.nextZIndex > 0 ? state.nextZIndex : tiles.length + 1,
    focusedTileId,
    fullviewActiveTileId,
    viewMode: normalizeViewMode(state.viewMode),
    gridViewState: {
      rootNode: normalizeGridLayout(state.gridViewState?.rootNode, tiles),
    },
  }
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
