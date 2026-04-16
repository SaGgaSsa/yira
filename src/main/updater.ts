import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { AppUpdater, ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import type { UpdateState } from '@shared/types'

const UPDATE_STATE_CHANNEL = 'updates:state-changed'
const STARTUP_CHECK_DELAY_MS = 5000

let updateState: UpdateState = createInitialState()
let updaterRegistered = false
let startupCheckScheduled = false
let checkInFlight = false

function createInitialState(): UpdateState {
  return {
    status: app.isPackaged ? 'idle' : 'unsupported',
    currentVersion: app.getVersion(),
    availableVersion: null,
    progressPercent: null,
    message: app.isPackaged ? null : 'Automatic updates are only available in installed builds.',
  }
}

function getUpdater(): AppUpdater {
  return autoUpdater
}

function broadcastUpdateState(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue
    window.webContents.send(UPDATE_STATE_CHANNEL, updateState)
  }
}

function setUpdateState(patch: Partial<UpdateState>): void {
  updateState = {
    ...updateState,
    ...patch,
    currentVersion: app.getVersion(),
  }
  broadcastUpdateState()
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return 'Unable to check for updates right now.'
}

function setCheckingState(message: string): void {
  setUpdateState({
    status: 'checking',
    availableVersion: null,
    progressPercent: null,
    message,
  })
}

function handleUpdateAvailable(info: UpdateInfo): void {
  setUpdateState({
    status: 'available',
    availableVersion: info.version ?? null,
    progressPercent: null,
    message: 'A new version is available. Downloading in the background.',
  })
}

function handleUpdateNotAvailable(): void {
  setUpdateState({
    status: 'up-to-date',
    availableVersion: null,
    progressPercent: null,
    message: 'You are already on the latest version.',
  })
}

function handleDownloadProgress(progress: ProgressInfo): void {
  setUpdateState({
    status: 'downloading',
    progressPercent: Math.max(0, Math.min(100, Math.round(progress.percent))),
    message: 'Downloading the latest update in the background.',
  })
}

function handleUpdateDownloaded(event: UpdateDownloadedEvent): void {
  setUpdateState({
    status: 'downloaded',
    availableVersion: event.version ?? updateState.availableVersion,
    progressPercent: 100,
    message: 'The update is ready to install. Restart Yira to apply it.',
  })
}

function handleUpdateError(error: unknown): void {
  setUpdateState({
    status: 'error',
    progressPercent: null,
    message: getErrorMessage(error),
  })
}

async function runUpdateCheck(reason: 'startup' | 'manual'): Promise<UpdateState> {
  if (!app.isPackaged) {
    setUpdateState({
      status: 'unsupported',
      availableVersion: null,
      progressPercent: null,
      message: 'Automatic updates are only available in installed builds.',
    })
    return updateState
  }

  if (checkInFlight || updateState.status === 'downloading') return updateState

  checkInFlight = true
  setCheckingState(reason === 'startup'
    ? 'Checking for updates in the background.'
    : 'Checking for updates.')

  try {
    await getUpdater().checkForUpdates()
  } catch (error) {
    handleUpdateError(error)
  } finally {
    checkInFlight = false
  }

  return updateState
}

function installDownloadedUpdate(): void {
  if (updateState.status !== 'downloaded') return
  getUpdater().quitAndInstall(false, true)
}

function registerUpdaterEvents(): void {
  const updater = getUpdater()
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true

  updater.on('checking-for-update', () => {
    setCheckingState('Checking for updates.')
  })
  updater.on('update-available', handleUpdateAvailable)
  updater.on('update-not-available', handleUpdateNotAvailable)
  updater.on('download-progress', handleDownloadProgress)
  updater.on('update-downloaded', handleUpdateDownloaded)
  updater.on('error', handleUpdateError)
}

export function registerUpdateIPC(): void {
  if (updaterRegistered) return

  updaterRegistered = true
  registerUpdaterEvents()

  ipcMain.handle('updates:getState', async (): Promise<UpdateState> => updateState)
  ipcMain.handle('updates:check', async (): Promise<UpdateState> => runUpdateCheck('manual'))
  ipcMain.handle('updates:install', async (): Promise<void> => {
    installDownloadedUpdate()
  })
}

export function scheduleStartupUpdateCheck(): void {
  if (startupCheckScheduled || !app.isPackaged) return

  startupCheckScheduled = true
  setTimeout(() => {
    void runUpdateCheck('startup')
  }, STARTUP_CHECK_DELAY_MS)
}
