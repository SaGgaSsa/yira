import { applyWorkspaceManagementChanges, setWorkspaceType } from './workspaceManagement'
import type { Workspace } from './types'
import { normalizeWorkspaceConfig } from './workspaceConfig'

type SourceControlConfigInput = Parameters<typeof normalizeWorkspaceConfig>[0] & {
  sourceControlRepositoryPaths?: unknown
}

type SourceControlConfig = Workspace['config'] & {
  sourceControlRepositoryPaths: string[]
}

function sourceControlPaths(config: Workspace['config']): string[] {
  return (config as SourceControlConfig).sourceControlRepositoryPaths
}

function workspace(
  id: string,
  name: string,
  rootFolderPath?: string,
  type: Workspace['config']['type'] = 'canvas',
  sourceControlRepositoryPaths: string[] = [],
): Workspace {
  return {
    id,
    name,
    path: `/tmp/yira/workspaces/${id}`,
    config: normalizeWorkspaceConfig({
      type,
      rootFolderPath,
      workspacePanelOpen: true,
      sourceControlViewMode: 'list',
      terminalHistoryEnabled: true,
      sourceControlRepositoryPaths,
    } as SourceControlConfigInput),
  }
}

const existing = [
  workspace('ws-alpha', 'Alpha', '/repo/alpha', 'canvas', ['apps/./web', 'apps//web']),
  workspace('ws-beta', 'Beta', '/repo/beta', 'grid'),
  workspace('ws-gamma', 'Gamma', '/repo/gamma', 'canvas', ['.']),
]

let idCounter = 0
const nextWorkspaceId = () => `ws-new-${++idCounter}`
const internalWorkspacePath = (id: string) => `/tmp/yira/workspaces/${id}`

const managed = applyWorkspaceManagementChanges({
  existingWorkspaces: existing,
  activeWorkspaceId: 'ws-beta',
  desiredWorkspaces: [
    {
      id: 'ws-gamma',
      name: 'Gamma Renamed',
      rootFolderPath: '/repo/gamma-renamed',
      initialCommand: ' npm test ',
      terminalHistoryEnabled: false,
      workspacePanelOpen: false,
      sourceControlViewMode: 'tree',
      remoteTerminal: { host: 'notebook.tailnet.ts.net', user: 'dev' },
      sourceControlRepositoryPaths: ['src/./app', 'src//app', '../unsafe'],
    },
    {
      name: 'Delta',
      rootFolderPath: '/repo/delta',
      terminalHistoryEnabled: true,
      sourceControlRepositoryPaths: ['.', './packages//web/', 'packages/./web', '/absolute'],
    },
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
if (managed.workspaces[0].config.workspacePanelOpen !== false) throw new Error('workspace panel toggle must be preserved')
if (managed.workspaces[0].config.sourceControlViewMode !== 'tree') throw new Error('source control view mode must be preserved')
if (managed.workspaces[0].config.remoteTerminal?.host !== 'notebook.tailnet.ts.net') throw new Error('remote terminal config must be preserved')
if (sourceControlPaths(managed.workspaces[0].config).length !== 0) throw new Error('changing a workspace root must clear repository selections')
if (managed.workspaces[2].config.type !== 'grid') throw new Error('existing workspace type must be preserved by management edits')
if (managed.workspaces[2].config.sourceControlViewMode !== 'list') throw new Error('management edits must retain an existing source control view mode')
if (managed.workspaces[2].config.workspacePanelOpen !== true) throw new Error('workspace panel must default open during management edits')
if (sourceControlPaths(managed.workspaces[2].config).join('|') !== '.') throw new Error('unchanged workspace roots must preserve normalized repository selections')
if (managed.removedWorkspaceIds.join(',') !== 'ws-alpha') throw new Error('omitted existing workspaces must be marked for removal')
if (managed.createdWorkspaceIds.join(',') !== 'ws-new-1') throw new Error('new workspaces must be reported')
if (managed.workspaces[1].config.type !== 'canvas') throw new Error('new management-created workspace must default to canvas')
if (sourceControlPaths(managed.workspaces[1].config).join('|') !== '.|packages/web') {
  throw new Error('new management workspaces must normalize repository selections')
}
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

const typeSwitch = setWorkspaceType(existing, 'ws-alpha', 'grid')
if (!typeSwitch) throw new Error('setWorkspaceType must return updated workspaces for an existing workspace')
const switchedWorkspace = typeSwitch.find((entry) => entry.id === 'ws-alpha')
if (switchedWorkspace?.config.type !== 'grid') throw new Error('setWorkspaceType must persist the requested workspace type')
if (switchedWorkspace.config.rootFolderPath !== '/repo/alpha') throw new Error('setWorkspaceType must preserve existing workspace config')
if (switchedWorkspace.config.workspacePanelOpen !== true) throw new Error('setWorkspaceType must preserve workspace panel state')
if (existing[0].config.type !== 'canvas') throw new Error('setWorkspaceType must not mutate the existing workspace array')
if (setWorkspaceType(existing, 'missing', 'grid') !== null) throw new Error('setWorkspaceType must return null for missing workspaces')

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
