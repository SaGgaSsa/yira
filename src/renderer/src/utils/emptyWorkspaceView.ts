import type { TileState, ViewMode } from '@shared/types'
import { getAttachedTiles } from '@shared/floatingTiles'

export function shouldKeepSidebarOpenForWorkspace(tiles: TileState[]): boolean {
  return getAttachedTiles(tiles).length === 0
}

export function resolveSidebarCollapsedAfterWorkspaceViewChange(
  currentCollapsed: boolean,
  previousWorkspaceId: string,
  activeWorkspaceId: string,
  viewMode: ViewMode,
  shouldKeepSidebarOpen: boolean,
): boolean {
  if (previousWorkspaceId !== activeWorkspaceId) return shouldKeepSidebarOpen ? false : currentCollapsed
  if (viewMode === 'fullview') return !shouldKeepSidebarOpen
  return currentCollapsed
}
