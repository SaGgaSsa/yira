import { applyWorkspaceManagementChanges } from './workspaceManagement'
import type { Workspace } from './types'

function workspace(id: string, name: string, rootFolderPath?: string): Workspace {
  return {
    id,
    name,
    path: `/tmp/yira/workspaces/${id}`,
    config: {
      rootFolderPath,
      terminalHistoryEnabled: true,
    },
  }
}

const existing = [
  workspace('ws-alpha', 'Alpha', '/repo/alpha'),
  workspace('ws-beta', 'Beta', '/repo/beta'),
  workspace('ws-gamma', 'Gamma', '/repo/gamma'),
]

let idCounter = 0
const nextWorkspaceId = () => `ws-new-${++idCounter}`
const internalWorkspacePath = (id: string) => `/tmp/yira/workspaces/${id}`

const managed = applyWorkspaceManagementChanges({
  existingWorkspaces: existing,
  activeWorkspaceId: 'ws-beta',
  desiredWorkspaces: [
    { id: 'ws-gamma', name: 'Gamma Renamed', rootFolderPath: '/repo/gamma-renamed', initialCommand: ' npm test ', terminalHistoryEnabled: false },
    { name: 'Delta', rootFolderPath: '/repo/delta', terminalHistoryEnabled: true },
    { id: 'ws-beta', name: 'Beta', rootFolderPath: '/repo/beta' },
  ],
  nextWorkspaceId,
  internalWorkspacePath,
})

if (managed.workspaces.map((entry) => entry.id).join(',') !== 'ws-gamma,ws-new-1,ws-beta') {
  throw new Error('managed workspace order must match desired order and assign ids to new entries')
}
if (managed.workspaces[0].name !== 'Gamma Renamed') throw new Error('existing workspace names must be editable')
if (managed.workspaces[0].config.rootFolderPath !== '/repo/gamma-renamed') throw new Error('existing workspace root folder must be editable')
if (managed.workspaces[0].config.initialCommand !== 'npm test') throw new Error('initial command must be normalized')
if (managed.workspaces[0].config.terminalHistoryEnabled !== false) throw new Error('terminal history toggle must be preserved')
if (managed.removedWorkspaceIds.join(',') !== 'ws-alpha') throw new Error('omitted existing workspaces must be marked for removal')
if (managed.createdWorkspaceIds.join(',') !== 'ws-new-1') throw new Error('new workspaces must be reported')
if (managed.activeWorkspaceId !== 'ws-beta') throw new Error('active workspace must be preserved when still present')

const fallback = applyWorkspaceManagementChanges({
  existingWorkspaces: existing,
  activeWorkspaceId: 'ws-alpha',
  desiredWorkspaces: [
    { id: 'ws-gamma', name: 'Gamma', rootFolderPath: '/repo/gamma' },
    { id: 'ws-beta', name: 'Beta', rootFolderPath: '/repo/beta' },
  ],
  nextWorkspaceId,
  internalWorkspacePath,
})

if (fallback.activeWorkspaceId !== 'ws-gamma') throw new Error('removed active workspace must fall back to first saved workspace')

const firstWorkspace = applyWorkspaceManagementChanges({
  existingWorkspaces: [],
  activeWorkspaceId: '',
  desiredWorkspaces: [
    { name: 'First', rootFolderPath: '/repo/first' },
    { name: 'Second', rootFolderPath: '/repo/second' },
  ],
  nextWorkspaceId,
  internalWorkspacePath,
})

if (firstWorkspace.activeWorkspaceId !== 'ws-new-2') throw new Error('first saved workspace must become active when none existed before')

try {
  applyWorkspaceManagementChanges({
    existingWorkspaces: existing,
    activeWorkspaceId: 'ws-alpha',
    desiredWorkspaces: [
      { id: 'ws-alpha', name: 'Duplicate', rootFolderPath: '/repo/alpha' },
      { id: 'ws-beta', name: ' duplicate ', rootFolderPath: '/repo/beta' },
    ],
    nextWorkspaceId,
    internalWorkspacePath,
  })
  throw new Error('duplicate names must be rejected')
} catch (error) {
  if (!(error instanceof Error) || error.message !== 'Workspace names must be unique') throw error
}

try {
  applyWorkspaceManagementChanges({
    existingWorkspaces: existing,
    activeWorkspaceId: 'ws-alpha',
    desiredWorkspaces: [
      { id: 'ws-alpha', name: 'Alpha', rootFolderPath: '/repo/shared' },
      { id: 'ws-beta', name: 'Beta', rootFolderPath: ' /repo/shared ' },
    ],
    nextWorkspaceId,
    internalWorkspacePath,
  })
  throw new Error('duplicate root folders must be rejected')
} catch (error) {
  if (!(error instanceof Error) || error.message !== 'Workspace root folders must be unique') throw error
}

try {
  applyWorkspaceManagementChanges({
    existingWorkspaces: existing,
    activeWorkspaceId: 'ws-alpha',
    desiredWorkspaces: [
      { id: 'ws-alpha', name: ' ', rootFolderPath: '/repo/alpha' },
    ],
    nextWorkspaceId,
    internalWorkspacePath,
  })
  throw new Error('empty names must be rejected')
} catch (error) {
  if (!(error instanceof Error) || error.message !== 'Workspace name cannot be empty') throw error
}
