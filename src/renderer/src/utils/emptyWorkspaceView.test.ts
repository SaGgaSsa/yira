import {
  resolveSidebarCollapsedAfterWorkspaceViewChange,
  resolveSidebarCollapsedForActivity,
  shouldKeepSidebarOpenForWorkspace,
  shouldHideWorkspacePanelForView,
} from './emptyWorkspaceView'

const collapsedOnOpen = resolveSidebarCollapsedForActivity(false, true, false, false)
if (!collapsedOnOpen.collapsed || collapsedOnOpen.previousCollapsed) throw new Error('opening Activity must collapse and remember the visible sidebar')
const restoredOnClose = resolveSidebarCollapsedForActivity(true, false, true, collapsedOnOpen.previousCollapsed)
if (restoredOnClose.collapsed) throw new Error('closing Activity must restore the previous visible sidebar')
const preservedCollapsed = resolveSidebarCollapsedForActivity(false, true, true, false)
if (!preservedCollapsed.collapsed || !preservedCollapsed.previousCollapsed) throw new Error('opening Activity must remember an already-collapsed sidebar')

if (!shouldKeepSidebarOpenForWorkspace([])) {
  throw new Error('an empty workspace must keep the sidebar open')
}

if (shouldKeepSidebarOpenForWorkspace([{
  id: 'terminal', type: 'terminal', x: 0, y: 0,
  width: 900, height: 400, zIndex: 1,
}])) {
  throw new Error('a workspace with a tile must retain regular fullview behavior')
}

if (!shouldKeepSidebarOpenForWorkspace([{
  id: 'detached-terminal', type: 'terminal', x: 0, y: 0,
  width: 900, height: 400, zIndex: 1,
  floating: { detached: true },
}])) {
  throw new Error('a workspace with only detached tiles must keep the sidebar open')
}

if (!resolveSidebarCollapsedAfterWorkspaceViewChange(true, 'workspace-a', 'workspace-b', 'fullview', false)) {
  throw new Error('switching to a populated workspace must keep a hidden sidebar hidden')
}

if (resolveSidebarCollapsedAfterWorkspaceViewChange(false, 'workspace-a', 'workspace-b', 'fullview', false)) {
  throw new Error('switching to a populated workspace must keep a visible sidebar visible')
}

if (resolveSidebarCollapsedAfterWorkspaceViewChange(true, 'workspace-a', 'workspace-b', 'fullview', true)) {
  throw new Error('switching to an empty workspace must show the sidebar')
}

if (!resolveSidebarCollapsedAfterWorkspaceViewChange(false, 'workspace-a', 'workspace-a', 'fullview', false)) {
  throw new Error('entering fullview inside one populated workspace must still collapse the sidebar')
}

if (resolveSidebarCollapsedAfterWorkspaceViewChange(true, 'workspace-a', 'workspace-a', 'fullview', true)) {
  throw new Error('an empty fullview workspace must keep the sidebar visible')
}

if (!resolveSidebarCollapsedAfterWorkspaceViewChange(true, 'workspace-a', 'workspace-a', 'canvas', false)) {
  throw new Error('non-fullview changes must preserve the current sidebar state')
}

if (!shouldHideWorkspacePanelForView('fullview', false)) {
  throw new Error('focus view must hide the workspace panel')
}
if (shouldHideWorkspacePanelForView('fullview', true)) {
  throw new Error('focus view must keep the workspace panel for an empty workspace')
}
if (shouldHideWorkspacePanelForView('gridview', false) || shouldHideWorkspacePanelForView('splitview', false)) {
  throw new Error('only focus view hides the workspace panel')
}
