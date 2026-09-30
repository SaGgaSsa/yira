import type { CanvasState, SplitViewState, ViewMode } from '@shared/types'
import { normalizeFileMarkdownViewMode, normalizeMarkdownViewMode, normalizeNoteKind, normalizeTileSize } from '@shared/types'
import { DEFAULT_SPLIT_ORIENTATION, normalizeSplitOrientation } from './splitViewState'
import { clampTileToWorld, normalizeFiniteViewport } from './canvasWorld'

function isSupportedTile(tile: CanvasState['tiles'][number]): boolean {
  return tile.type === 'terminal' ||
    tile.type === 'note' ||
    tile.type === 'browser' ||
    tile.type === 'timer' ||
    (tile.type === 'files' && typeof tile.filePath === 'string' && tile.filePath.trim().length > 0)
}

export function normalizeCanvasStateForJson(state: CanvasState): CanvasState {
  const viewMode: ViewMode = state.viewMode === 'canvas' || state.viewMode === 'fullview' || state.viewMode === 'splitview'
    ? state.viewMode
    : 'fullview'
  const tiles = state.tiles.filter(isSupportedTile)
  const tileIds = new Set(tiles.map((tile) => tile.id))
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

  const groups = (state.groups ?? [])
    .map((group) => ({
      ...group,
      tileIds: group.tileIds.filter((tileId) => tileIds.has(tileId)),
    }))
    .filter((group) => group.tileIds.length > 0)

  return {
    ...state,
    tiles: tiles.map((tile) => {
      const size = normalizeTileSize(tile.type, tile)
      const { hideTitlebar: _hideTitlebar, fileRevealRequest: _fileRevealRequest, ...tileWithoutTitlebar } = tile as typeof tile & { hideTitlebar?: unknown }
      const normalizedNote = tileWithoutTitlebar.type !== 'note'
        ? tileWithoutTitlebar
        : normalizeNoteKind(tileWithoutTitlebar.noteKind) === 'markdown'
          ? {
              ...tileWithoutTitlebar,
              noteKind: 'markdown' as const,
              markdown: typeof tileWithoutTitlebar.markdown === 'string' ? tileWithoutTitlebar.markdown : '',
              markdownView: normalizeMarkdownViewMode(tileWithoutTitlebar.markdownView),
            }
          : tileWithoutTitlebar.noteKind === undefined
            ? tileWithoutTitlebar
            : { ...tileWithoutTitlebar, noteKind: 'rich' as const }
      const normalizedFile = normalizedNote.type === 'files'
        ? { ...normalizedNote, fileMarkdownView: normalizeFileMarkdownViewMode(normalizedNote.fileMarkdownView) }
        : normalizedNote
      return clampTileToWorld({
        ...normalizedFile,
        width: size.width,
        height: size.height,
      })
    }),
    groups,
    viewport: normalizeFiniteViewport(state.viewport),
    viewMode,
    focusedTileId: state.focusedTileId && tileIds.has(state.focusedTileId) ? state.focusedTileId : null,
    fullviewActiveTileId: state.fullviewActiveTileId && tileIds.has(state.fullviewActiveTileId)
      ? state.fullviewActiveTileId
      : state.focusedTileId && tileIds.has(state.focusedTileId)
        ? state.focusedTileId
        : tiles[0]?.id ?? null,
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
