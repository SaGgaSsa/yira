import type { SplitViewState, TileState, ViewMode } from '@shared/types'
import { getAttachedTiles } from '@shared/floatingTiles'
import { getTerminalName, normalizeTerminalWindowTitle } from './terminalDisplayTitle'

export function getTileWindowTitle(
  tile: TileState | null,
  terminalTitles: Record<string, string>,
  workspaceName: string,
  agentTitles: Record<string, string> = {},
): string {
  const name = tile?.type === 'terminal'
    ? getTerminalName(tile, terminalTitles, agentTitles)
    : tile?.label?.trim()
  const title = normalizeTerminalWindowTitle(name || workspaceName)
  return !title || title.toLowerCase() === 'yira' ? 'Yira' : `${title} - Yira`
}

export function getActiveWindowTitle(state: {
  tiles: TileState[]
  terminalTitles: Record<string, string>
  activeWorkspaceName: string
  viewMode: ViewMode
  focusedTileId: string | null
  fullviewActiveTileId: string | null
  splitViewState: SplitViewState
  agentTitles?: Record<string, string>
}): string {
  const activeTileId = getVisibleActiveTileId(state)
  const tile = getAttachedTiles(state.tiles).find((candidate) => candidate.id === activeTileId) ?? null
  return getTileWindowTitle(tile, state.terminalTitles, state.activeWorkspaceName, state.agentTitles)
}

/** Tile the user is looking at in the current view mode, or null when none is focused. */
export function getVisibleActiveTileId(state: {
  tiles: TileState[]
  viewMode: ViewMode
  focusedTileId: string | null
  fullviewActiveTileId: string | null
  splitViewState: SplitViewState
}): string | null {
  const tiles = getAttachedTiles(state.tiles)
  let activeTileId = state.focusedTileId
  if (state.viewMode === 'board') activeTileId = null
  if (state.viewMode === 'fullview') {
    activeTileId = state.fullviewActiveTileId ?? tiles.slice().sort((a, b) => b.zIndex - a.zIndex)[0]?.id ?? null
  } else if (state.viewMode === 'splitview') {
    activeTileId = state.splitViewState.focusedPanel === 'right'
      ? state.splitViewState.activeRightTileId
      : state.splitViewState.activeLeftTileId
  }
  return tiles.some((candidate) => candidate.id === activeTileId) ? activeTileId : null
}
