import { contextBridge, ipcRenderer } from 'electron'
import type { AgentActiveSessionSnapshot, AgentProviderAvailabilitySnapshot, AgentSessionHistoryQuery, AgentSessionHistoryResult, AgentUsageSnapshot, BoardTask, FileListOptions, FileSearchResult, FileWriteInput, FloatingNavigationEvent, FloatingNavigationRequest, GitCommitHistoryResult, GitStatusResult, NotificationAttentionOptions, TerminalCreateOptions, UpdateState, WindowBounds, WindowClosePreparationRequest, WindowClosePreparationResponse, WorkspaceCreateInput, WorkspaceManagementCommitInput, WorkspaceType, WorkspaceUpdatePatch } from '@shared/types'
import { createSerialTaskQueue } from '@shared/serialTaskQueue'

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
    installClaudeUsageStatusLine: () => ipcRenderer.invoke('agentUsage:claudeStatusLine:install'),
    uninstallClaudeUsageStatusLine: () => ipcRenderer.invoke('agentUsage:claudeStatusLine:uninstall'),
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
    status: (workspaceId: string) => ipcRenderer.invoke('git:status', workspaceId) as Promise<GitStatusResult>,
    history: (workspaceId: string) => ipcRenderer.invoke('git:history', workspaceId) as Promise<GitCommitHistoryResult>,
    stage: (workspaceId: string, relativePath: string, originalPath?: string) => ipcRenderer.invoke('git:stage', workspaceId, relativePath, originalPath),
    unstage: (workspaceId: string, relativePath: string, originalPath?: string) => ipcRenderer.invoke('git:unstage', workspaceId, relativePath, originalPath),
    commit: (workspaceId: string, message: string) => ipcRenderer.invoke('git:commit', workspaceId, message),
    sync: (workspaceId: string) => ipcRenderer.invoke('git:sync', workspaceId),
  },

  // Canvas persistence
  canvas: {
    load: (workspaceId: string, workspaceType?: string) => ipcRenderer.invoke('canvas:load', workspaceId, workspaceType),
    save: (workspaceId: string, state: unknown, workspaceType?: string) => ipcRenderer.invoke('canvas:save', workspaceId, state, workspaceType),
  },

  // Terminal
  terminal: {
    create: (tileId: string, options: TerminalCreateOptions) =>
      ipcRenderer.invoke('terminal:create', tileId, options),
    write: (tileId: string, data: string) => ipcRenderer.invoke('terminal:write', tileId, data),
    resize: (tileId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', tileId, cols, rows),
    destroy: (tileId: string) => ipcRenderer.invoke('terminal:destroy', tileId),
    detach: (tileId: string) => ipcRenderer.invoke('terminal:detach', tileId),
    acknowledgeAgentAlert: (tileId: string) => ipcRenderer.invoke('terminal:acknowledgeAgentAlert', tileId),
    setAgentAlertsEnabled: (enabled: boolean) => ipcRenderer.invoke('terminal:setAgentAlertsEnabled', enabled),
    sshAvailable: () => ipcRenderer.invoke('terminal:sshAvailable'),
    onData: (tileId: string, callback: (data: string) => void) => {
      const channel = `terminal:data:${tileId}`
      const handler = (_evt: unknown, data: string) => callback(data)
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
    setTitleBarOverlayTheme: (theme: 'dark' | 'light') =>
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
