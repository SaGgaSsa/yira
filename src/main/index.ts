import { app, BrowserWindow, shell, ipcMain, Menu, clipboard } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { initWorkspaces, registerWorkspaceIPC } from './ipc/workspace'
import { registerCanvasIPC } from './ipc/canvas'
import { registerTerminalIPC, initShellProfiles } from './ipc/terminal'
import { registerSettingsIPC } from './ipc/settings'
import { registerNotesIPC } from './ipc/notes'
import { registerBoardsIPC } from './ipc/boards'
import { registerFilesIPC } from './ipc/files'
import { clearWindowAttention, registerNotificationIPC } from './ipc/notifications'
import { registerWindowIPC } from './ipc/window'
import { APP_ID, APP_NAME, DEV_APP_NAME, YIRA_HOME } from './paths'
import { registerUpdateIPC, scheduleStartupUpdateCheck } from './updater'
import { loadWindowState, saveWindowState } from './windowState'

const appDisplayName = is.dev ? DEV_APP_NAME : APP_NAME
const REACT_DEVTOOLS_HINT = 'Download the React DevTools'
const appIconPath = is.dev ? join(__dirname, '../../resources/icon.png') : join(process.resourcesPath, 'icon.png')
const WINDOW_STATE_PATH = join(YIRA_HOME, 'window-state.json')

async function createWindow(): Promise<BrowserWindow> {
  const windowState = await loadWindowState(WINDOW_STATE_PATH)

  // electron-vite outputs .mjs for preload; try .mjs first, fallback to .js
  const preloadPath = join(__dirname, '../preload/index.mjs')
  const finalPreload = existsSync(preloadPath) ? preloadPath : join(__dirname, '../preload/index.js')
  console.log('[main] Preload path:', finalPreload, '| exists:', existsSync(finalPreload))

  const win = new BrowserWindow({
    title: appDisplayName,
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#15171a',
    icon: appIconPath,
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
    if (windowState.maximized) win.maximize()
    win.show()
  })
  win.on('maximize', () => {
    void saveWindowState(WINDOW_STATE_PATH, { maximized: true })
  })
  win.on('unmaximize', () => {
    void saveWindowState(WINDOW_STATE_PATH, { maximized: false })
  })
  win.on('focus', () => {
    clearWindowAttention(win)
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.once('did-finish-load', () => {
    win.setTitle(appDisplayName)
    scheduleStartupUpdateCheck()
  })

  // Debug: log load errors
  win.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error('[main] did-fail-load:', code, desc, url)
  })
  win.webContents.on('console-message', (_event, _level, message) => {
    if (message.includes(REACT_DEVTOOLS_HINT)) return
    console.log('[renderer]', message)
  })

  return win
}

app.whenReady().then(async () => {
  app.setName(appDisplayName)
  app.setAppUserModelId(APP_ID)

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
  registerFilesIPC()
  registerNotificationIPC()
  registerWindowIPC()
  registerUpdateIPC()

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle('clipboard:readText', () => clipboard.readText())
  ipcMain.handle('clipboard:writeText', (_event, text: string) => {
    clipboard.writeText(text)
  })
  ipcMain.handle('clipboard:writeRich', (_event, data: unknown) => {
    const payload = data && typeof data === 'object' ? data as { text?: unknown; html?: unknown } : {}
    const text = typeof payload.text === 'string' ? payload.text : ''
    const html = typeof payload.html === 'string' ? payload.html : ''

    if (!text.trim() && !html.trim()) return
    clipboard.write({ text, html })
  })

  // Native app menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          click: () => { void createWindow() },
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
        {
          label: 'Reload',
          click: () => {
            BrowserWindow.getFocusedWindow()?.reload()
          },
        },
        {
          label: 'Force Reload',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.reloadIgnoringCache()
          },
        },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: 'F11',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (!focusedWindow) return
            focusedWindow.setFullScreen(!focusedWindow.isFullScreen())
          },
        },
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

  void createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
