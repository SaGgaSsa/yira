import type { SplitViewState, TileState, ViewMode } from '@shared/types'
import { getAttachedTiles } from '@shared/floatingTiles'
import { normalizeTerminalWindowTitle } from './terminalDisplayTitle'

export function getTileWindowTitle(
  tile: TileState | null,
  terminalTitles: Record<string, string>,
  workspaceName: string,
): string {
  const label = tile?.label?.trim()
  const dynamicTitle = tile?.type === 'terminal' ? terminalTitles[tile.id]?.trim() : ''
  // Terminal applications can emit a spinner as their entire OSC title.
  const terminalName = dynamicTitle && /[\p{L}\p{N}]/u.test(dynamicTitle) ? dynamicTitle : ''
  const title = normalizeTerminalWindowTitle(label || terminalName || workspaceName)
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
}): string {
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
  const tile = tiles.find((candidate) => candidate.id === activeTileId) ?? null
  return getTileWindowTitle(tile, state.terminalTitles, state.activeWorkspaceName)
}
