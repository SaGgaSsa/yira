import type { AppThemeId } from '@shared/appThemes'
import type { WindowBackgroundMaterial, WindowBackgroundMaterialState } from '@shared/types'
import type { TerminalProcessActivitySnapshot } from '@shared/terminalProcessActivity'
import { contextBridge, ipcRenderer } from 'electron'
import type { AgentActiveSessionSnapshot, AgentDetectionSnapshot, AgentProviderAvailabilitySnapshot, AgentSessionCapabilities, AgentSessionCloseInput, AgentSessionCloseResult, AgentSessionCreateInput, AgentSessionCreateResult, AgentSessionHistoryQuery, AgentSessionHistoryResult, AgentUsageDetailsSnapshot, AgentUsageHistoryRequest, AgentUsageHistorySnapshot, AgentUsageSnapshot, BoardTask, FileListOptions, FileSearchResult, FileWriteInput, FloatingNavigationEvent, FloatingNavigationRequest, GitCommitHistoryResult, GitFileDiffContent, GitRepository, GitStatusResult, NotificationAttentionOptions, RemotePreparationResult, RemotePreparationStatus, TerminalCreateOptions, TerminalCreateResult, TerminalExitEvent, UpdateState, WindowBounds, WindowClosePreparationRequest, WindowClosePreparationResponse, Workspace, WorkspaceCreateInput, WorkspaceGitDiffResult, WorkspaceManagementCommitInput, WorkspaceType, WorkspaceUpdatePatch } from '@shared/types'
import { createSerialTaskQueue } from '@shared/serialTaskQueue'
import {
  terminalSessionDataChannel,
  terminalSessionExitChannel,
  type TerminalSessionIdentity,
  type TerminalSessionTarget,
} from '@shared/terminalSessionIdentity'

console.log('[preload] Loading...')

const closePreparationQueue = createSerialTaskQueue()

contextBridge.exposeInMainWorld('electron', {
  // Workspace
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    create: (input: WorkspaceCreateInput) => ipcRenderer.invoke('workspace:create', input),
    update: (id: string, patch: WorkspaceUpdatePatch) => ipcRenderer.invoke('workspace:update', id, patch),
    rename: (id: string, name: string) => ipcRenderer.invoke('workspace:rename', id, name),
    delete: (id: string) => ipcRenderer.invoke('workspace:delete', id),
    setActive: (id: string) => ipcRenderer.invoke('workspace:setActive', id),
    recordSelection: (id: string) => ipcRenderer.invoke('workspace:recordSelection', id) as Promise<Workspace | null>,
    setPinned: (id: string, pinned: boolean) => ipcRenderer.invoke('workspace:setPinned', id, pinned) as Promise<Workspace | null>,
    setType: (id: string, type: WorkspaceType) => ipcRenderer.invoke('workspace:setType', id, type),
    getActive: () => ipcRenderer.invoke('workspace:getActive'),
    openFolder: () => ipcRenderer.invoke('workspace:openFolder'),
    commitManagementChanges: (input: WorkspaceManagementCommitInput) =>
      ipcRenderer.invoke('workspace:commitManagementChanges', input),
  },

  // Agent sessions and bounded local history
  agents: {
    availability: () => ipcRenderer.invoke('agents:availability') as Promise<AgentProviderAvailabilitySnapshot>,
    getAvailability: () => ipcRenderer.invoke('agents:availability') as Promise<AgentProviderAvailabilitySnapshot>,
    sessionCapabilities: (workspaceId: string) =>
      ipcRenderer.invoke('agents:sessions:capabilities', workspaceId) as Promise<AgentSessionCapabilities>,
    createSession: (input: AgentSessionCreateInput) =>
      ipcRenderer.invoke('agents:sessions:create', input) as Promise<AgentSessionCreateResult>,
    closeSession: (input: AgentSessionCloseInput) =>
      ipcRenderer.invoke('agents:sessions:close', input) as Promise<AgentSessionCloseResult>,
    sessionsSnapshot: (workspaceId?: string) =>
      ipcRenderer.invoke('agents:sessions:snapshot', workspaceId) as Promise<AgentActiveSessionSnapshot>,
    getSessions: (workspaceId?: string) =>
      ipcRenderer.invoke('agents:sessions:snapshot', workspaceId) as Promise<AgentActiveSessionSnapshot>,
    subscribeSessions: (workspaceId?: string) =>
      ipcRenderer.invoke('agents:sessions:subscribe', workspaceId) as Promise<string | false>,
    unsubscribeSessions: (token: string) =>
      ipcRenderer.invoke('agents:sessions:unsubscribe', token) as Promise<boolean>,
    onSessionsChanged: (callback: (snapshot: AgentActiveSessionSnapshot) => void) => {
      const handler = (_event: unknown, snapshot: AgentActiveSessionSnapshot) => callback(snapshot)
      ipcRenderer.on('agents:sessions:changed', handler)
      return () => ipcRenderer.removeListener('agents:sessions:changed', handler)
    },
    usageSnapshot: () => ipcRenderer.invoke('agents:usage:snapshot') as Promise<AgentUsageSnapshot | null>,
    usageDetails: () => ipcRenderer.invoke('agents:usage:details') as Promise<AgentUsageDetailsSnapshot | null>,
    usageHistory: (request: AgentUsageHistoryRequest) => ipcRenderer.invoke('agents:usage:history', request) as Promise<AgentUsageHistorySnapshot | null>,
    detect: () => ipcRenderer.invoke('agents:detect') as Promise<AgentDetectionSnapshot>,
    onUsageChanged: (callback: (snapshot: AgentUsageSnapshot) => void) => {
      const handler = (_event: unknown, snapshot: AgentUsageSnapshot) => callback(snapshot)
      ipcRenderer.on('agents:usage:changed', handler)
      return () => ipcRenderer.removeListener('agents:usage:changed', handler)
    },
    history: (query?: AgentSessionHistoryQuery) =>
      ipcRenderer.invoke('agents:history', query) as Promise<AgentSessionHistoryResult>,
    queryHistory: (query?: AgentSessionHistoryQuery) =>
      ipcRenderer.invoke('agents:history', query) as Promise<AgentSessionHistoryResult>,
  },

  // Settings
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
    configureAgentHooks: (provider: 'codex' | 'claude') => ipcRenderer.invoke('agentHooks:configure', provider),
    uninstallAgentHooks: (provider: 'codex' | 'claude') => ipcRenderer.invoke('agentHooks:uninstall', provider),
    getClaudeStatusLineStatus: () => ipcRenderer.invoke('claudeStatusLine:status'),
    installClaudeStatusLine: () => ipcRenderer.invoke('claudeStatusLine:install'),
    uninstallClaudeStatusLine: () => ipcRenderer.invoke('claudeStatusLine:uninstall'),
  },

  // Notes
  note: {
    save: (tileId: string, data: unknown) => ipcRenderer.invoke('note:save', tileId, data),
    load: (tileId: string) => ipcRenderer.invoke('note:load', tileId),
    delete: (tileId: string) => ipcRenderer.invoke('note:delete', tileId),
  },

  // Boards
  board: {
    load: (workspaceId: string) =>
      ipcRenderer.invoke('board:load', workspaceId),
    enable: (workspaceId: string) =>
      ipcRenderer.invoke('board:enable', workspaceId),
    createUserTask: (workspaceId: string, input: Pick<BoardTask, 'title' | 'task'>) =>
      ipcRenderer.invoke('board:createUserTask', workspaceId, input),
    updateUserTask: (workspaceId: string, input: { taskId: string; title?: string; task?: string }) =>
      ipcRenderer.invoke('board:updateUserTask', workspaceId, input),
    addUserNote: (workspaceId: string, input: { taskId: string; note: string }) =>
      ipcRenderer.invoke('board:addUserNote', workspaceId, input),
    deleteBacklogTask: (workspaceId: string, taskId: string) =>
      ipcRenderer.invoke('board:deleteBacklogTask', workspaceId, taskId),
    approveReviewTask: (workspaceId: string, taskId: string) =>
      ipcRenderer.invoke('board:approveReviewTask', workspaceId, taskId),
    rejectReviewTask: (workspaceId: string, input: { taskId: string; note: string }) =>
      ipcRenderer.invoke('board:rejectReviewTask', workspaceId, input),
  },

  // Files
  files: {
    openFolder: (folderPath: string) => ipcRenderer.invoke('files:openFolder', folderPath),
    selectFolder: (defaultPath?: string) =>
      ipcRenderer.invoke('files:selectFolder', defaultPath),
    list: (rootPath: string, relativeDir: string, options?: FileListOptions) =>
      ipcRenderer.invoke('files:list', rootPath, relativeDir, options),
    search: (rootPath: string, query: string) =>
      ipcRenderer.invoke('files:search', rootPath, query) as Promise<FileSearchResult>,
    read: (rootPath: string, relativePath: string) =>
      ipcRenderer.invoke('files:read', rootPath, relativePath),
    stat: (rootPath: string, relativePath: string) =>
      ipcRenderer.invoke('files:stat', rootPath, relativePath),
    write: (rootPath: string, relativePath: string, input: FileWriteInput) =>
      ipcRenderer.invoke('files:write', rootPath, relativePath, input),
    readPreviewAsset: (rootPath: string, relativePath: string) =>
      ipcRenderer.invoke('files:readPreviewAsset', rootPath, relativePath),
  },

  git: {
    discoverRepositories: (workspaceId: string) => ipcRenderer.invoke('git:discoverRepositories', workspaceId) as Promise<GitRepository[]>,
    discoverRepositoriesAtRoot: (rootFolderPath: string) => ipcRenderer.invoke('git:discoverRepositoriesAtRoot', rootFolderPath) as Promise<GitRepository[]>,
    status: (workspaceId: string, repositoryPath: string) => ipcRenderer.invoke('git:status', workspaceId, repositoryPath) as Promise<GitStatusResult>,
    history: (workspaceId: string, repositoryPath: string) => ipcRenderer.invoke('git:history', workspaceId, repositoryPath) as Promise<GitCommitHistoryResult>,
    workspaceDiff: (workspaceId: string) => ipcRenderer.invoke('git:workspaceDiff', workspaceId) as Promise<WorkspaceGitDiffResult>,
    fileDiff: (workspaceId: string, repositoryPath: string, relativePath: string, staged: boolean, originalPath?: string) => ipcRenderer.invoke('git:fileDiff', workspaceId, repositoryPath, relativePath, staged, originalPath) as Promise<GitFileDiffContent>,
    stage: (workspaceId: string, repositoryPath: string, relativePath: string, originalPath?: string) => ipcRenderer.invoke('git:stage', workspaceId, repositoryPath, relativePath, originalPath),
    unstage: (workspaceId: string, repositoryPath: string, relativePath: string, originalPath?: string) => ipcRenderer.invoke('git:unstage', workspaceId, repositoryPath, relativePath, originalPath),
    commit: (workspaceId: string, repositoryPath: string, message: string) => ipcRenderer.invoke('git:commit', workspaceId, repositoryPath, message),
    fetch: (workspaceId: string, repositoryPath: string) => ipcRenderer.invoke('git:fetch', workspaceId, repositoryPath),
    pull: (workspaceId: string, repositoryPath: string) => ipcRenderer.invoke('git:pull', workspaceId, repositoryPath),
    push: (workspaceId: string, repositoryPath: string) => ipcRenderer.invoke('git:push', workspaceId, repositoryPath),
    sync: (workspaceId: string, repositoryPath: string) => ipcRenderer.invoke('git:sync', workspaceId, repositoryPath),
  },

  // Canvas persistence
  canvas: {
    load: (workspaceId: string, workspaceType?: string) => ipcRenderer.invoke('canvas:load', workspaceId, workspaceType),
    save: (workspaceId: string, state: unknown, workspaceType?: string) => ipcRenderer.invoke('canvas:save', workspaceId, state, workspaceType),
  },

  // Terminal
  terminal: {
    getProcessActivity: () =>
      ipcRenderer.invoke('terminal:processActivity:snapshot') as Promise<TerminalProcessActivitySnapshot>,
    onProcessActivityChanged: (callback: (snapshot: TerminalProcessActivitySnapshot) => void) => {
      const handler = (_event: unknown, snapshot: TerminalProcessActivitySnapshot) => callback(snapshot)
      ipcRenderer.on('terminal:processActivity:changed', handler)
      return () => ipcRenderer.removeListener('terminal:processActivity:changed', handler)
    },
    prepareRemote: (workspaceId: string) =>
      ipcRenderer.invoke('terminal:prepareRemote', workspaceId) as Promise<RemotePreparationResult>,
    onPreparationProgress: (workspaceId: string, callback: (status: RemotePreparationStatus) => void) => {
      const handler = (_event: unknown, payload: { workspaceId: string; status: RemotePreparationStatus }) => {
        if (payload?.workspaceId === workspaceId) callback(payload.status)
      }
      ipcRenderer.on('terminal:preparationProgress', handler)
      return () => { ipcRenderer.removeListener('terminal:preparationProgress', handler) }
    },
    create: (target: TerminalSessionTarget, options: TerminalCreateOptions) =>
      ipcRenderer.invoke('terminal:create', target, options) as Promise<TerminalCreateResult>,
    attach: (identity: TerminalSessionIdentity) =>
      ipcRenderer.invoke('terminal:attach', identity) as Promise<TerminalCreateResult>,
    write: (identity: TerminalSessionIdentity, data: string) => ipcRenderer.invoke('terminal:write', identity, data),
    resize: (identity: TerminalSessionIdentity, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', identity, cols, rows),
    destroy: (identity: TerminalSessionIdentity) => ipcRenderer.invoke('terminal:destroy', identity),
    destroyCurrent: (target: TerminalSessionTarget) => ipcRenderer.invoke('terminal:destroyCurrent', target),
    closeWorkspace: (workspaceId: string) => ipcRenderer.invoke('terminal:closeWorkspace', workspaceId) as Promise<void>,
    detach: (identity: TerminalSessionIdentity) => ipcRenderer.invoke('terminal:detach', identity),
    acknowledgeAgentAlert: (identity: TerminalSessionIdentity) => ipcRenderer.invoke('terminal:acknowledgeAgentAlert', identity),
    setAgentAlertsEnabled: (enabled: boolean) => ipcRenderer.invoke('terminal:setAgentAlertsEnabled', enabled),
    sshAvailable: () => ipcRenderer.invoke('terminal:sshAvailable'),
    onData: (identity: TerminalSessionIdentity, callback: (data: string) => void) => {
      const channel = terminalSessionDataChannel(identity)
      const handler = (_evt: unknown, data: string) => callback(data)
      ipcRenderer.on(channel, handler)
      return () => { ipcRenderer.removeListener(channel, handler) }
    },
    onExit: (identity: TerminalSessionIdentity, callback: (event: TerminalExitEvent) => void) => {
      const channel = terminalSessionExitChannel(identity)
      const handler = (_evt: unknown, event: TerminalExitEvent) => callback(event)
      ipcRenderer.on(channel, handler)
      return () => { ipcRenderer.removeListener(channel, handler) }
    },
    onAgentAlert: (tileId: string, callback: (state: unknown) => void) => {
      const channel = `terminal:agentAlert:${tileId}`
      const handler = (_evt: unknown, state: unknown) => callback(state)
      ipcRenderer.on(channel, handler)
      return () => { ipcRenderer.removeListener(channel, handler) }
    },
  },

  // Shell profiles
  shellProfiles: {
    list: () => ipcRenderer.invoke('shellProfiles:list'),
  },

  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },

  clipboard: {
    readText: () => ipcRenderer.invoke('clipboard:readText'),
    saveImageToTempFile: () => ipcRenderer.invoke('clipboard:saveImageToTempFile'),
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
    writeRich: (data: { text: string; html: string }) => ipcRenderer.invoke('clipboard:writeRich', data),
  },

  notifications: {
    requestAttention: (options?: NotificationAttentionOptions) =>
      ipcRenderer.invoke('notifications:requestAttention', options),
    clearAttention: () => ipcRenderer.invoke('notifications:clearAttention'),
  },

  window: {
    setTitle: (title: string) => ipcRenderer.invoke('window:setTitle', title),
    getBackgroundMaterialState: () => ipcRenderer.invoke('window:getBackgroundMaterialState') as Promise<WindowBackgroundMaterialState>,
    setBackgroundMaterial: (material: WindowBackgroundMaterial) => ipcRenderer.invoke('window:setBackgroundMaterial', material) as Promise<WindowBackgroundMaterialState>,
    setTitleBarOverlayTheme: (theme: 'dark' | 'light' | AppThemeId) =>
      ipcRenderer.invoke('window:setTitleBarOverlayTheme', theme),
    onClosePreparationRequest: (
      callback: (request: WindowClosePreparationRequest) => void | Promise<void>,
    ) => {
      const handler = (_event: unknown, request: WindowClosePreparationRequest) => {
        void closePreparationQueue.run(() => callback(request))
          .then(() => {
            const response: WindowClosePreparationResponse = { ...request, ok: true }
            ipcRenderer.send('window:closePreparationResponse', response)
          })
          .catch((error: unknown) => {
            const response: WindowClosePreparationResponse = {
              ...request,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }
            ipcRenderer.send('window:closePreparationResponse', response)
          })
      }
      ipcRenderer.on('window:closePreparationRequest', handler)
      return () => ipcRenderer.removeListener('window:closePreparationRequest', handler)
    },
  },

  floating: {
    open: (workspaceId: string, tileId: string, bounds?: WindowBounds) =>
      ipcRenderer.invoke('floating:open', { workspaceId, tileId, bounds }),
    focus: (tileId: string) => ipcRenderer.invoke('floating:focus', tileId),
    close: (tileId: string, attachOnClose?: boolean) =>
      ipcRenderer.invoke('floating:close', tileId, attachOnClose),
    closeWorkspace: (workspaceId: string) => ipcRenderer.invoke('floating:closeWorkspace', workspaceId),
    requestAttach: (tileId: string) => ipcRenderer.invoke('floating:requestAttach', tileId),
    getTileSnapshot: (workspaceId: string, tileId: string) =>
      ipcRenderer.invoke('floating:getTileSnapshot', { workspaceId, tileId }),
    updateTile: (workspaceId: string, tileId: string, patch: unknown) =>
      ipcRenderer.invoke('floating:updateTile', { workspaceId, tileId, patch }),
    requestNavigation: (tileId: string, request: FloatingNavigationRequest) =>
      ipcRenderer.invoke('floating:requestNavigation', tileId, request),
    onAttachRequested: (callback: (event: { workspaceId: string; tileId: string; bounds?: WindowBounds }) => void) => {
      const handler = (_event: unknown, payload: { workspaceId: string; tileId: string; bounds?: WindowBounds }) => callback(payload)
      ipcRenderer.on('floating:attachRequested', handler)
      return () => ipcRenderer.removeListener('floating:attachRequested', handler)
    },
    onBoundsChanged: (callback: (event: { workspaceId: string; tileId: string; bounds: WindowBounds }) => void) => {
      const handler = (_event: unknown, payload: { workspaceId: string; tileId: string; bounds: WindowBounds }) => callback(payload)
      ipcRenderer.on('floating:boundsChanged', handler)
      return () => ipcRenderer.removeListener('floating:boundsChanged', handler)
    },
    onSnapshotRequest: (callback: (event: { requestId: string; workspaceId: string; tileId: string }) => unknown | Promise<unknown>) => {
      const handler = (_event: unknown, payload: { requestId: string; workspaceId: string; tileId: string }) => {
        Promise.resolve(callback(payload))
          .then((snapshot) => {
            ipcRenderer.send('floating:snapshotResponse', payload.requestId, snapshot)
          })
          .catch(() => {
            ipcRenderer.send('floating:snapshotResponse', payload.requestId, null)
          })
      }
      ipcRenderer.on('floating:snapshotRequest', handler)
      return () => ipcRenderer.removeListener('floating:snapshotRequest', handler)
    },
    onUpdateTile: (callback: (event: { workspaceId: string; tileId: string; patch: unknown }) => void) => {
      const handler = (_event: unknown, payload: { workspaceId: string; tileId: string; patch: unknown }) => callback(payload)
      ipcRenderer.on('floating:updateTile', handler)
      return () => ipcRenderer.removeListener('floating:updateTile', handler)
    },
    onNavigationRequested: (callback: (event: FloatingNavigationEvent) => void) => {
      const handler = (_event: unknown, payload: FloatingNavigationEvent) => callback(payload)
      ipcRenderer.on('floating:navigationRequested', handler)
      return () => ipcRenderer.removeListener('floating:navigationRequested', handler)
    },
  },

  updates: {
    getState: () => ipcRenderer.invoke('updates:getState'),
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    onStateChange: (callback: (state: UpdateState) => void) => {
      const handler = (_event: unknown, state: UpdateState) => callback(state)
      ipcRenderer.on('updates:state-changed', handler)
      return () => {
        ipcRenderer.removeListener('updates:state-changed', handler)
      }
    },
  },
})

console.log('[preload] contextBridge exposed successfully')
