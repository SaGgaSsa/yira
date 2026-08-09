import {
  createEmptyGridWorkspaceState,
  normalizeGridWorkspaceState,
} from './gridWorkspaceState'
import type {
  CanvasState,
  GridLayoutNode,
  GridWorkspaceState,
  SplitViewState,
  TileGroup,
  TileState,
  ViewMode,
} from './types'

const EMPTY_SPLIT_VIEW_STATE: SplitViewState = {
  leftTileIds: [],
  rightTileIds: [],
  activeLeftTileId: null,
  activeRightTileId: null,
  focusedPanel: 'left',
  orientation: 'vertical',
}

function cloneTile(tile: TileState): TileState {
  return {
    ...tile,
    floating: tile.floating
      ? {
          ...tile.floating,
          bounds: tile.floating.bounds ? { ...tile.floating.bounds } : undefined,
          gridPlacement: tile.floating.gridPlacement
            ? { rootNode: cloneGridLayoutNode(tile.floating.gridPlacement.rootNode ?? null) }
            : undefined,
        }
      : undefined,
  }
}

function cloneGridLayoutNode(node: GridLayoutNode | null): GridLayoutNode | null {
  if (!node) return null
  if (node.type === 'leaf') return { ...node }

  return {
    ...node,
    children: node.children.map((child) => cloneGridLayoutNode(child) as GridLayoutNode),
    sizes: [...node.sizes],
  }
}

function maxNextZIndex(tiles: TileState[], nextZIndex: number): number {
  const maxZIndex = tiles.reduce((max, tile) => Math.max(max, tile.zIndex), 0)
  return Math.max(nextZIndex, maxZIndex + 1, 1)
}

function existingTileId(tiles: TileState[], tileId: string | null | undefined): string | null {
  return tileId && tiles.some((tile) => tile.id === tileId) ? tileId : null
}

function normalizeCanvasViewMode(mode: ViewMode | undefined): ViewMode {
  return mode === 'fullview' || mode === 'splitview' || mode === 'board' ? mode : 'canvas'
}

function mergeSharedTileWithCanvasLayout(sharedTile: TileState, canvasTile: TileState | undefined): TileState {
  if (!canvasTile) return cloneTile(sharedTile)

  return {
    ...cloneTile(sharedTile),
    x: canvasTile.x,
    y: canvasTile.y,
    width: canvasTile.width,
    height: canvasTile.height,
    zIndex: canvasTile.zIndex,
    groupId: canvasTile.groupId,
    floating: canvasTile.floating
      ? {
          ...canvasTile.floating,
          bounds: canvasTile.floating.bounds ? { ...canvasTile.floating.bounds } : undefined,
          gridPlacement: canvasTile.floating.gridPlacement
            ? { rootNode: cloneGridLayoutNode(canvasTile.floating.gridPlacement.rootNode ?? null) }
            : undefined,
        }
      : sharedTile.floating,
  }
}

function reconcileGroups(groups: TileGroup[] | undefined, tiles: TileState[]): TileGroup[] {
  const tileIds = new Set(tiles.map((tile) => tile.id))

  return (groups ?? [])
    .map((group) => ({
      ...group,
      tileIds: group.tileIds.filter((tileId) => tileIds.has(tileId)),
    }))
    .filter((group) => group.tileIds.length > 0)
}

function normalizeSplitViewForTiles(
  splitViewState: SplitViewState | undefined,
  tiles: TileState[],
  activeTileId: string | null,
): SplitViewState {
  const existingIds = new Set(tiles.map((tile) => tile.id))
  const seen = new Set<string>()
  const cleanIds = (ids: string[] | undefined): string[] => (ids ?? []).filter((tileId) => {
    if (!existingIds.has(tileId) || seen.has(tileId)) return false
    seen.add(tileId)
    return true
  })

  const leftTileIds = cleanIds(splitViewState?.leftTileIds)
  const rightTileIds = cleanIds(splitViewState?.rightTileIds)
  const missingTileIds = tiles.map((tile) => tile.id).filter((tileId) => !seen.has(tileId))

  if (leftTileIds.length > 0 && rightTileIds.length > 0) {
    const missingActiveId = activeTileId && missingTileIds.includes(activeTileId)
      ? activeTileId
      : null
    const nextLeftTileIds = missingActiveId
      ? [missingActiveId, ...leftTileIds]
      : leftTileIds
    const nextRightTileIds = [
      ...rightTileIds,
      ...missingTileIds.filter((tileId) => tileId !== missingActiveId),
    ]

    return {
      leftTileIds: nextLeftTileIds,
      rightTileIds: nextRightTileIds,
      activeLeftTileId: splitViewState?.activeLeftTileId && nextLeftTileIds.includes(splitViewState.activeLeftTileId)
        ? splitViewState.activeLeftTileId
        : nextLeftTileIds[0] ?? null,
      activeRightTileId: splitViewState?.activeRightTileId && nextRightTileIds.includes(splitViewState.activeRightTileId)
        ? splitViewState.activeRightTileId
        : nextRightTileIds[0] ?? null,
      focusedPanel: splitViewState?.focusedPanel === 'right' ? 'right' : 'left',
      orientation: splitViewState?.orientation === 'horizontal' ? 'horizontal' : 'vertical',
    }
  }

  return { ...EMPTY_SPLIT_VIEW_STATE }
}

export function createCanvasStateForWorkspaceTypeSwitch(sharedTiles: TileState[]): CanvasState {
  const tiles = sharedTiles.map(cloneTile)
  const activeTileId = tiles[0]?.id ?? null

  return {
    tiles,
    groups: [],
    viewport: { tx: 0, ty: 0, zoom: 1 },
    nextZIndex: maxNextZIndex(tiles, tiles.length + 1),
    focusedTileId: activeTileId,
    viewMode: 'canvas',
    fullviewActiveTileId: activeTileId,
    boardVisible: true,
    splitViewState: { ...EMPTY_SPLIT_VIEW_STATE },
  }
}

export function reconcileCanvasStateWithSharedTiles(
  state: CanvasState | null | undefined,
  sharedTiles: TileState[],
  sourceBoardVisible?: boolean,
): CanvasState {
  if (!state) {
    const initialState = createCanvasStateForWorkspaceTypeSwitch(sharedTiles)
    return {
      ...initialState,
      boardVisible: sourceBoardVisible ?? initialState.boardVisible,
    }
  }

  const canvasTilesById = new Map(state.tiles.map((tile) => [tile.id, tile]))
  const tiles = sharedTiles.map((tile) => mergeSharedTileWithCanvasLayout(tile, canvasTilesById.get(tile.id)))
  const focusedTileId = existingTileId(tiles, state.focusedTileId) ?? tiles[0]?.id ?? null
  const fullviewActiveTileId = existingTileId(tiles, state.fullviewActiveTileId) ?? focusedTileId

  return {
    tiles,
    groups: reconcileGroups(state.groups, tiles),
    viewport: { ...state.viewport },
    nextZIndex: maxNextZIndex(tiles, state.nextZIndex),
    focusedTileId,
    viewMode: normalizeCanvasViewMode(state.viewMode),
    fullviewActiveTileId,
    boardVisible: sourceBoardVisible ?? (state.boardVisible !== false),
    splitViewState: normalizeSplitViewForTiles(state.splitViewState, tiles, fullviewActiveTileId ?? focusedTileId),
  }
}

export function reconcileGridStateWithSharedTiles(
  state: GridWorkspaceState | null | undefined,
  sharedTiles: TileState[],
  sourceBoardVisible?: boolean,
): GridWorkspaceState {
  const base = state ?? createEmptyGridWorkspaceState()

  return normalizeGridWorkspaceState({
    ...base,
    boardVisible: sourceBoardVisible ?? base.boardVisible,
    tiles: sharedTiles.map(cloneTile),
    nextZIndex: maxNextZIndex(sharedTiles, base.nextZIndex),
    gridViewState: {
      rootNode: cloneGridLayoutNode(base.gridViewState.rootNode),
    },
  })
}
