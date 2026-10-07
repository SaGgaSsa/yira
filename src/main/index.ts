import { app, BrowserWindow, shell, ipcMain, Menu, clipboard, ClipboardItem, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { is } from '@electron-toolkit/utils'
import { getWorkspaceRootFolders, initWorkspaces, registerWorkspaceIPC } from './ipc/workspace'
import { registerCanvasIPC } from './ipc/canvas'
import {
  registerTerminalIPC,
  initShellProfiles,
  hydrateTerminalSessions,
  shutdownTerminalSessions,
  destroyWorkspaceTerminalSessions,
  stopTerminalDaemonForUpdate,
  stopTerminalProcessActivityMonitor,
  countRunningTerminalSessions,
} from './ipc/terminal'
import { getEnabledAgentProviders, loadStoredUserSettings, registerSettingsIPC } from './ipc/settings'
import { registerNotesIPC } from './ipc/notes'
import { registerBoardsIPC } from './ipc/boards'
import { registerFilesIPC } from './ipc/files'
import { registerGitIPC } from './ipc/git'
import { clearWindowAttention, registerNotificationIPC } from './ipc/notifications'
import { registerWindowIPC, type WindowClosePreparationBridge } from './ipc/window'
import { registerFloatingTilesIPC } from './ipc/floatingTiles'
import { registerAgentsIPC } from './ipc/agents'
import { AgentUsageService } from './agentUsage'
import { AgentUsageDetailsService } from './agentUsageDetails'
import { AgentUsageIndex } from './agentUsageIndex'
import { readClaudeUsageStatusLinePayload } from './claudeUsageStatusLinePayload'
import { APP_ID, APP_NAME, DEV_APP_NAME, YIRA_HOME } from './paths'
import { isUpdateInstallPending, registerUpdateIPC, scheduleStartupUpdateCheck } from './updater'
import { loadWindowState, saveWindowState } from './windowState'
import { coordinateWindowClose, type CloseFailureDecision } from './windowCloseCoordinator'
import { getWindowMaterialOptions, setWindowBackgroundMaterial } from './windowMaterial'
import { mainText } from './i18n'

const appDisplayName = is.dev ? DEV_APP_NAME : APP_NAME
const REACT_DEVTOOLS_HINT = 'Download the React DevTools'
const appIconPath = is.dev ? join(__dirname, '../../resources/icon.png') : join(process.resourcesPath, 'icon.png')
const WINDOW_STATE_PATH = join(YIRA_HOME, 'window-state.json')
const supportsTitleBarOverlay = process.platform === 'win32' || process.platform === 'linux'
if (process.env.YIRA_HOME?.trim()) {
  const electronDataDir = join(YIRA_HOME, 'electron-data')
  app.setPath('userData', electronDataDir)
  app.setPath('sessionData', join(electronDataDir, 'session-data'))
  app.setPath('cache', join(electronDataDir, 'cache'))
}
const titleBarOverlay = {
  color: '#111111',
  symbolColor: '#ffffff',
  height: 36,
}
let mainWindow: BrowserWindow | null = null
let closePreparationBridge: WindowClosePreparationBridge | null = null
let closePreparationApproved = false
let closePreparationInFlight: Promise<boolean> | null = null
const CLOSE_PREPARATION_TIMEOUT_MS = 5_000

async function promptClosePreparationFailure(phase: 'flush' | 'persist' | 'terminals', error: unknown): Promise<CloseFailureDecision> {
  const detail = error instanceof Error ? error.message : String(error)
  const options = {
    type: 'warning' as const,
    title: mainText('unsavedFileDrafts'),
    message: phase === 'flush'
      ? mainText('collectDraftsFailed')
      : phase === 'persist'
        ? mainText('saveWorkspaceFailed')
        : mainText('closeTerminalsFailed'),
    detail,
    buttons: [mainText('retry'), mainText('closeWithoutSaving'), mainText('cancel')],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  }
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options)

  if (result.response === 0) return 'retry'
  if (result.response === 1) return 'discard'
  return 'cancel'
}

async function drainTerminalSessions(): Promise<void> {
  await shutdownTerminalSessions()
  // The daemon outlives the app. Left running, it would block the Windows
  // installer and keep the previous version's code on every platform.
  if (!isUpdateInstallPending()) return
  try {
    await stopTerminalDaemonForUpdate()
  } catch (error) {
    console.error('[main] unable to stop the terminal daemon before the update:', error)
  }
}

async function confirmUpdateInstall(): Promise<boolean> {
  const count = countRunningTerminalSessions()
  if (count === 0) return true

  const options = {
    title: mainText('installUpdateTitle'),
    message: count === 1
      ? mainText('installUpdateOneTerminal')
      : mainText('installUpdateManyTerminals', { count }),
    detail: mainText('installUpdateDetail'),
    buttons: [mainText('installUpdate'), mainText('later')],
  }
  const messageOptions = { ...options, type: 'warning' as const, defaultId: 0, cancelId: 1, noLink: true }
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showMessageBox(mainWindow, messageOptions)
    : await dialog.showMessageBox(messageOptions)
  return result.response === 0
}

async function prepareApplicationClose(): Promise<boolean> {
  if (closePreparationApproved) return true
  if (closePreparationInFlight) return closePreparationInFlight

  closePreparationInFlight = (async () => {
    const bridge = closePreparationBridge
    if (!bridge) {
      await drainTerminalSessions()
      closePreparationApproved = true
      return true
    }

    const result = await coordinateWindowClose({
      flushRenderers: () => bridge.requestAll('flush', CLOSE_PREPARATION_TIMEOUT_MS),
      persistPrimary: () => bridge.requestPrimary('persist', CLOSE_PREPARATION_TIMEOUT_MS),
      drainTerminals: drainTerminalSessions,
      promptFailure: ({ phase, error }) => promptClosePreparationFailure(phase, error),
      timeoutMs: CLOSE_PREPARATION_TIMEOUT_MS,
    })
    closePreparationApproved = result === 'proceed'
    return closePreparationApproved
  })().finally(() => {
    closePreparationInFlight = null
  })

  return closePreparationInFlight
}

async function requestApplicationQuit(): Promise<void> {
  if (!await prepareApplicationClose()) return
  app.quit()
}

app.on('before-quit', (event) => {
  if (closePreparationApproved) {
    stopTerminalProcessActivityMonitor()
    return
  }
  event.preventDefault()
  void requestApplicationQuit()
})

async function createWindow(): Promise<BrowserWindow> {
  const windowState = await loadWindowState(WINDOW_STATE_PATH)
  const storedSettings = await loadStoredUserSettings()
  setWindowBackgroundMaterial(storedSettings?.windowBackgroundMaterial ?? 'none', true)
  const materialOptions = getWindowMaterialOptions()

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
    ...materialOptions,
    icon: appIconPath,
    ...(supportsTitleBarOverlay
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: materialOptions.backgroundMaterial || materialOptions.transparent
            ? { ...titleBarOverlay, color: '#00000000' }
            : titleBarOverlay,
        }
      : {}),
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
  win.on('close', (event) => {
    if (closePreparationApproved) return
    event.preventDefault()
    void requestApplicationQuit()
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
  await loadStoredUserSettings()

  const agentUsageService = new AgentUsageService({
    getConfiguredProviders: async () => getEnabledAgentProviders(),
    providerReaders: {
      claude: async () => {
        const payload = await readClaudeUsageStatusLinePayload()
        if (!payload) return null
        return {
          status: 'available',
          windows: [
            ...(payload.fiveHour ? [{ kind: 'fiveHour', usedPercent: payload.fiveHour.usedPercentage, resetsAt: payload.fiveHour.resetsAt }] : []),
            ...(payload.sevenDay ? [{ kind: 'weekly', usedPercent: payload.sevenDay.usedPercentage, resetsAt: payload.sevenDay.resetsAt }] : []),
          ],
        }
      },
    },
  })
  const agentUsageDetailsService = new AgentUsageDetailsService({
    getWorkspaces: getWorkspaceRootFolders,
    getConfiguredProviders: async () => getEnabledAgentProviders(),
  })
  const agentUsageIndex = new AgentUsageIndex()
  void agentUsageService.start().catch(() => undefined)

  // Detect available shells
  initShellProfiles()

  // Register all IPC handlers
  registerWorkspaceIPC({ beforeDelete: destroyWorkspaceTerminalSessions })
  registerAgentsIPC({
    usageService: agentUsageService,
    usageDetailsService: agentUsageDetailsService,
    usageIndex: agentUsageIndex,
    enabledProviders: async () => getEnabledAgentProviders(),
    workspaces: getWorkspaceRootFolders,
  })
  registerCanvasIPC()
  registerTerminalIPC(() => mainWindow)
  void hydrateTerminalSessions().catch((error) => {
    console.warn('[main] terminal session hydration failed:', error instanceof Error ? error.message : String(error))
  })
  registerSettingsIPC({ onSave: () => {
    agentUsageDetailsService.invalidate()
    void agentUsageService.refresh()
  } })
  registerNotesIPC()
  registerBoardsIPC()
  registerFilesIPC()
  registerGitIPC()
  registerNotificationIPC()
  closePreparationBridge = registerWindowIPC(() => mainWindow)
  registerFloatingTilesIPC(() => mainWindow, () => closePreparationApproved)
  registerUpdateIPC({ confirmInstall: confirmUpdateInstall, prepareToClose: prepareApplicationClose })

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle('clipboard:readText', () => clipboard.readText())
  // Terminal agents such as Claude Code and Codex attach images pasted as file paths.
  ipcMain.handle('clipboard:saveImageToTempFile', async () => {
    const item = (await clipboard.read()).find((entry) => entry.types.includes('image/png'))
    if (!item) return null
    const image = await item.getType('image/png') as Blob
    const directory = join(app.getPath('temp'), 'yira-clipboard')
    await mkdir(directory, { recursive: true })
    const filePath = join(directory, `clipboard-${Date.now()}.png`)
    await writeFile(filePath, Buffer.from(await image.arrayBuffer()))
    return filePath
  })
  ipcMain.handle('clipboard:writeText', async (_event, text: string) => {
    await clipboard.writeText(text)
  })
  ipcMain.handle('clipboard:writeRich', async (_event, data: unknown) => {
    const payload = data && typeof data === 'object' ? data as { text?: unknown; html?: unknown } : {}
    const text = typeof payload.text === 'string' ? payload.text : ''
    const html = typeof payload.html === 'string' ? payload.html : ''

    if (!text.trim() && !html.trim()) return
    const entries: Record<string, string> = { 'text/plain': text }
    if (html) entries['text/html'] = html
    await clipboard.write([new ClipboardItem(entries)])
  })

  // Suppress Electron's native menu bar so Alt cannot reveal it on Windows.
  Menu.setApplicationMenu(null)

  mainWindow = await createWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().then((window) => {
        mainWindow = window
        window.on('closed', () => {
          if (mainWindow === window) mainWindow = null
        })
      })
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
