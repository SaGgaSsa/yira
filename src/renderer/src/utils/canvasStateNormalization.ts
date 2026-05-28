import type { CanvasState, SplitViewState, ViewMode } from '@shared/types'
import { normalizeTileSize } from '@shared/types'
import { DEFAULT_SPLIT_ORIENTATION, normalizeSplitOrientation } from './splitViewState'
import { clampTileToWorld, normalizeFiniteViewport } from './canvasWorld'

export function normalizeCanvasStateForJson(state: CanvasState): CanvasState {
  const viewMode: ViewMode = state.viewMode === 'canvas' || state.viewMode === 'fullview' || state.viewMode === 'splitview'
    ? state.viewMode
    : 'fullview'
  const tileIds = new Set(state.tiles.map((tile) => tile.id))
  const seen = new Set<string>()
  const cleanIds = (ids?: string[]) => (ids ?? []).filter((tileId) => {
    if (!tileIds.has(tileId) || seen.has(tileId)) return false
    seen.add(tileId)
    return true
  })
  const leftTileIds = cleanIds(state.splitViewState?.leftTileIds)
  const rightTileIds = cleanIds(state.splitViewState?.rightTileIds)
  const splitViewState: SplitViewState = {
    leftTileIds,
    rightTileIds,
    activeLeftTileId: state.splitViewState?.activeLeftTileId && leftTileIds.includes(state.splitViewState.activeLeftTileId)
      ? state.splitViewState.activeLeftTileId
      : leftTileIds[0] ?? null,
    activeRightTileId: state.splitViewState?.activeRightTileId && rightTileIds.includes(state.splitViewState.activeRightTileId)
      ? state.splitViewState.activeRightTileId
      : rightTileIds[0] ?? null,
    focusedPanel: state.splitViewState?.focusedPanel === 'right' ? 'right' : 'left',
    orientation: normalizeSplitOrientation(state.splitViewState?.orientation),
  }

  return {
    ...state,
    tiles: state.tiles.map((tile) => {
      const size = normalizeTileSize(tile.type, tile)
      return clampTileToWorld({
        ...tile,
        width: size.width,
        height: size.height,
      })
    }),
    groups: state.groups ?? [],
    viewport: normalizeFiniteViewport(state.viewport),
    viewMode,
    fullviewActiveTileId: state.fullviewActiveTileId ?? state.focusedTileId ?? state.tiles[0]?.id ?? null,
    splitViewState,
  }
}

export function createEmptyCanvasState(): CanvasState {
  return {
    tiles: [],
    groups: [],
    viewport: { tx: 0, ty: 0, zoom: 1 },
    nextZIndex: 1,
    focusedTileId: null,
    viewMode: 'fullview',
    fullviewActiveTileId: null,
    splitViewState: {
      leftTileIds: [],
      rightTileIds: [],
      activeLeftTileId: null,
      activeRightTileId: null,
      focusedPanel: 'left',
      orientation: DEFAULT_SPLIT_ORIENTATION,
    },
  }
}
