import { contextBridge, ipcRenderer } from 'electron'

console.log('[preload] Loading...')

contextBridge.exposeInMainWorld('electron', {
  // Workspace
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    create: (name: string) => ipcRenderer.invoke('workspace:create', name),
    delete: (id: string) => ipcRenderer.invoke('workspace:delete', id),
    setActive: (id: string) => ipcRenderer.invoke('workspace:setActive', id),
    getActive: () => ipcRenderer.invoke('workspace:getActive'),
    openFolder: () => ipcRenderer.invoke('workspace:openFolder'),
  },

  // Settings
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  },

  // Notes
  note: {
    save: (tileId: string, data: unknown) => ipcRenderer.invoke('note:save', tileId, data),
    load: (tileId: string) => ipcRenderer.invoke('note:load', tileId),
    delete: (tileId: string) => ipcRenderer.invoke('note:delete', tileId),
  },

  // Boards
  board: {
    save: (workspaceId: string, tileId: string, state: unknown) =>
      ipcRenderer.invoke('board:save', workspaceId, tileId, state),
    load: (workspaceId: string, tileId: string) =>
      ipcRenderer.invoke('board:load', workspaceId, tileId),
    delete: (workspaceId: string, tileId: string) =>
      ipcRenderer.invoke('board:delete', workspaceId, tileId),
  },

  // Canvas persistence
  canvas: {
    load: (workspaceId: string) => ipcRenderer.invoke('canvas:load', workspaceId),
    save: (workspaceId: string, state: unknown) => ipcRenderer.invoke('canvas:save', workspaceId, state),
  },

  // Terminal
  terminal: {
    create: (tileId: string, workspaceDir: string, shellProfileId: string) =>
      ipcRenderer.invoke('terminal:create', tileId, workspaceDir, shellProfileId),
    write: (tileId: string, data: string) => ipcRenderer.invoke('terminal:write', tileId, data),
    resize: (tileId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', tileId, cols, rows),
    destroy: (tileId: string) => ipcRenderer.invoke('terminal:destroy', tileId),
    detach: (tileId: string) => ipcRenderer.invoke('terminal:detach', tileId),
    onData: (tileId: string, callback: (data: string) => void) => {
      const channel = `terminal:data:${tileId}`
      const handler = (_evt: unknown, data: string) => callback(data)
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
})

console.log('[preload] contextBridge exposed successfully')
