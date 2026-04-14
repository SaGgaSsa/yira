import { app, BrowserWindow, shell, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { initWorkspaces, registerWorkspaceIPC } from './ipc/workspace'
import { registerCanvasIPC } from './ipc/canvas'
import { registerTerminalIPC, initShellProfiles } from './ipc/terminal'
import { registerSettingsIPC } from './ipc/settings'
import { registerNotesIPC } from './ipc/notes'
import { registerBoardsIPC } from './ipc/boards'
import { YIRA_HOME } from './paths'

function createWindow(): BrowserWindow {
  // electron-vite outputs .mjs for preload; try .mjs first, fallback to .js
  const preloadPath = join(__dirname, '../preload/index.mjs')
  const finalPreload = existsSync(preloadPath) ? preloadPath : join(__dirname, '../preload/index.js')
  console.log('[main] Preload path:', finalPreload, '| exists:', existsSync(finalPreload))

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#15171a',
    webPreferences: {
      preload: finalPreload,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  })

  win.on('ready-to-show', () => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    win.show()
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Debug: log load errors
  win.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error('[main] did-fail-load:', code, desc, url)
  })
  win.webContents.on('console-message', (_event, _level, message) => {
    console.log('[renderer]', message)
  })

  return win
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.yira.app')

  app.on('browser-window-created', (_, window) => {
    // Shortcuts handled by renderer
  })

  // Ensure app dirs
  await initWorkspaces()

  // Detect available shells
  initShellProfiles()

  // Register all IPC handlers
  registerWorkspaceIPC()
  registerCanvasIPC()
  registerTerminalIPC()
  registerSettingsIPC()
  registerNotesIPC()
  registerBoardsIPC()

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
  })

  // Native app menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => createWindow(),
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
