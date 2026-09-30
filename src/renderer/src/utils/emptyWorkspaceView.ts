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

export function resolveSidebarCollapsedForActivity(
  activityOpen: boolean,
  nextActivityOpen: boolean,
  currentCollapsed: boolean,
  previousCollapsed: boolean,
): { collapsed: boolean; previousCollapsed: boolean } {
  if (!activityOpen && nextActivityOpen) return { collapsed: true, previousCollapsed: currentCollapsed }
  if (activityOpen && !nextActivityOpen) return { collapsed: previousCollapsed, previousCollapsed }
  return { collapsed: currentCollapsed, previousCollapsed }
}
