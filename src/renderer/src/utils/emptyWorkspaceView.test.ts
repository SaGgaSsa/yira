import {
  resolveSidebarCollapsedAfterWorkspaceViewChange,
  shouldKeepSidebarOpenForWorkspace,
} from './emptyWorkspaceView'

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

if (resolveSidebarCollapsedAfterWorkspaceViewChange(true, 'workspace-a', 'workspace-b', 'fullview', false)) {
  throw new Error('switching workspaces must leave the sidebar visible')
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
