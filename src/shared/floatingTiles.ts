import {
  insertTileIntoGridLayout,
  normalizeGridLayout,
  removeTileFromGridLayout,
} from './gridWorkspaceState'
import type { GridLayoutNode, TileFloatingState, TileState, WindowBounds } from './types'

interface FloatingTileStateInput {
  tiles: TileState[]
  tileId: string
  gridRootNode?: GridLayoutNode | null
  bounds?: WindowBounds
}

interface FloatingTileStateResult {
  tiles: TileState[]
  gridRootNode?: GridLayoutNode | null
}

export interface FloatingTileWindowOpenRequest {
  tileId: string
  bounds?: WindowBounds
}

interface FloatingTileWindowOpenRequestInput {
  previousWorkspaceId: string | null
  previousDetachedTileIds: ReadonlySet<string>
  workspaceId: string
  tiles: TileState[]
}

function cloneGridRoot(rootNode: GridLayoutNode | null | undefined): GridLayoutNode | null | undefined {
  return rootNode ? JSON.parse(JSON.stringify(rootNode)) as GridLayoutNode : rootNode
}

function sameGridRoot(first: GridLayoutNode | null | undefined, second: GridLayoutNode | null | undefined): boolean {
  return JSON.stringify(first ?? null) === JSON.stringify(second ?? null)
}

function normalizeBounds(bounds: unknown): WindowBounds | undefined {
  if (!bounds || typeof bounds !== 'object') return undefined
  const candidate = bounds as Partial<Record<keyof WindowBounds, unknown>>
  const x = typeof candidate.x === 'number' && Number.isFinite(candidate.x) ? candidate.x : undefined
  const y = typeof candidate.y === 'number' && Number.isFinite(candidate.y) ? candidate.y : undefined
  const width = typeof candidate.width === 'number' && Number.isFinite(candidate.width) && candidate.width > 0
    ? candidate.width
    : undefined
  const height = typeof candidate.height === 'number' && Number.isFinite(candidate.height) && candidate.height > 0
    ? candidate.height
    : undefined

  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined
  return { x, y, width, height }
}

export function isTileDetached(tile: TileState): boolean {
  return tile.floating?.detached === true
}

export function getAttachedTiles<T extends TileState>(tiles: T[]): T[] {
  return tiles.filter((tile) => !isTileDetached(tile))
}

export function selectFloatingTileWindowOpenRequests({
  previousWorkspaceId,
  previousDetachedTileIds,
  workspaceId,
  tiles,
}: FloatingTileWindowOpenRequestInput): FloatingTileWindowOpenRequest[] {
  const workspaceChanged = previousWorkspaceId !== workspaceId

  return tiles.flatMap((tile) => {
    if (!isTileDetached(tile)) return []
    if (!workspaceChanged && previousDetachedTileIds.has(tile.id)) return []

    return [{
      tileId: tile.id,
      bounds: tile.floating?.bounds,
    }]
  })
}

export function normalizeFloatingTileState(tile: TileState): TileState {
  if (tile.floating?.detached !== true) {
    if (tile.floating === undefined) return tile
    const { floating: _floating, ...attachedTile } = tile
    return attachedTile
  }

  const nextFloating: TileFloatingState = {
    detached: true,
  }
  const bounds = normalizeBounds(tile.floating.bounds)
  if (bounds) nextFloating.bounds = bounds
  if (tile.floating.gridPlacement?.rootNode !== undefined) {
    nextFloating.gridPlacement = {
      rootNode: cloneGridRoot(tile.floating.gridPlacement.rootNode) ?? null,
    }
  }

  return {
    ...tile,
    floating: nextFloating,
  }
}

export function detachTileForFloating({
  tiles,
  tileId,
  gridRootNode,
  bounds,
}: FloatingTileStateInput): FloatingTileStateResult {
  const nextGridRootNode = gridRootNode === undefined
    ? undefined
    : removeTileFromGridLayout(gridRootNode, tileId)

  return {
    tiles: tiles.map((tile) => {
      if (tile.id !== tileId) return normalizeFloatingTileState(tile)

      const nextFloating: TileFloatingState = {
        detached: true,
      }
      const normalizedBounds = normalizeBounds(bounds)
      if (normalizedBounds) nextFloating.bounds = normalizedBounds
      if (gridRootNode !== undefined) {
        nextFloating.gridPlacement = {
          rootNode: cloneGridRoot(gridRootNode) ?? null,
        }
      }

      return normalizeFloatingTileState({
        ...tile,
        floating: nextFloating,
      })
    }),
    gridRootNode: nextGridRootNode,
  }
}

export function attachFloatingTile({
  tiles,
  tileId,
  gridRootNode,
}: FloatingTileStateInput): FloatingTileStateResult {
  const target = tiles.find((tile) => tile.id === tileId)
  const nextTiles = tiles.map((tile) => {
    if (tile.id !== tileId) return normalizeFloatingTileState(tile)
    const { floating: _floating, ...attachedTile } = tile
    return normalizeFloatingTileState(attachedTile)
  })

  if (gridRootNode === undefined || !target) {
    return { tiles: nextTiles, gridRootNode }
  }

  const savedRoot = target.floating?.gridPlacement?.rootNode
  const savedRootWithoutTile = savedRoot === undefined
    ? undefined
    : removeTileFromGridLayout(savedRoot, tileId)

  if (savedRoot !== undefined && sameGridRoot(savedRootWithoutTile, gridRootNode)) {
    return {
      tiles: nextTiles,
      gridRootNode: normalizeGridLayout(savedRoot, nextTiles),
    }
  }

  return {
    tiles: nextTiles,
    gridRootNode: normalizeGridLayout(insertTileIntoGridLayout(gridRootNode, tileId), nextTiles),
  }
}
