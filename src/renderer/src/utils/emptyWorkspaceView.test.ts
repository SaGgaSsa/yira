import { shouldKeepSidebarOpenForWorkspace } from './emptyWorkspaceView'

if (!shouldKeepSidebarOpenForWorkspace([])) {
  throw new Error('an empty workspace must keep the sidebar open')
}

if (shouldKeepSidebarOpenForWorkspace([{
  id: 'terminal', type: 'terminal', x: 0, y: 0,
  width: 900, height: 400, zIndex: 1,
}])) {
  throw new Error('a workspace with a tile must retain regular fullview behavior')
}
