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
  readingMode = false,
): boolean {
  if (previousWorkspaceId !== activeWorkspaceId) return shouldKeepSidebarOpen ? false : currentCollapsed
  // Reading mode leaves room beside its column, so Focus shows the sidebar there.
  if (viewMode === 'fullview') return !shouldKeepSidebarOpen && !readingMode
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

/** Focus view hides the workspace panel while the workspace has tiles to focus on, except in reading mode. */
export function shouldHideWorkspacePanelForView(viewMode: ViewMode, shouldKeepSidebarOpen: boolean, readingMode = false): boolean {
  return viewMode === 'fullview' && !shouldKeepSidebarOpen && !readingMode
}
