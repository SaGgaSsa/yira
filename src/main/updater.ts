import { app, BrowserWindow, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'
import type { AppUpdater, ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import { join } from 'node:path'
import type { UpdateState } from '@shared/types'
import { getUpdateErrorMessage } from './updateErrorMessage'
import { getSafeUpdateErrorData, getSafeUpdaterLogData, UpdateDiagnostics, waitForUpdateDiagnosticTask } from './updateDiagnostics'
import { startLinuxDebUpdateLauncher } from './linuxDebUpdateLauncher'
import { loadStoredUserSettings } from './ipc/settings'
import { YIRA_HOME } from './paths'
import { mainText } from './i18n'

const { autoUpdater } = electronUpdater

const UPDATE_STATE_CHANNEL = 'updates:state-changed'
const STARTUP_CHECK_DELAY_MS = 5000
const STARTUP_CHECK_TIMEOUT_MS = 8000
const MANUAL_CHECK_TIMEOUT_MS = 20000
const DIAGNOSTICS_INITIALIZATION_TIMEOUT_MS = 250
const INSTALL_DIAGNOSTIC_FLUSH_TIMEOUT_MS = 250

let updateState: UpdateState = createInitialState()
let updaterRegistered = false
let startupCheckScheduled = false
let checkInFlight = false
let updateDiagnosticsInitialization: Promise<void> | null = null
let downloadedUpdateFile: string | null = null

const updateDiagnostics = new UpdateDiagnostics({
  homeDir: YIRA_HOME,
  getVersion: () => app.getVersion(),
})

function recordUpdateDiagnostic(event: string, data?: Record<string, unknown>): Promise<void> {
  return updateDiagnostics.record({ event, data })
}

async function initializeUpdateDiagnostics(): Promise<void> {
  try {
    const settings = await loadStoredUserSettings()
    const enabled = settings?.updateDiagnosticsEnabled === true
    updateDiagnostics.setEnabled(enabled)
    if (enabled) void recordUpdateDiagnostic('diagnostics-enabled')
  } catch (error) {
    console.error('Unable to initialize Yira update diagnostics:', error)
    updateDiagnostics.setEnabled(false)
  }
}

function ensureUpdateDiagnosticsInitialized(): Promise<void> {
  updateDiagnosticsInitialization ??= initializeUpdateDiagnostics()
  return updateDiagnosticsInitialization
}

async function waitForUpdateDiagnosticsInitialization(): Promise<void> {
  await waitForUpdateDiagnosticTask(
    ensureUpdateDiagnosticsInitialized(),
    DIAGNOSTICS_INITIALIZATION_TIMEOUT_MS,
  )
}

function createInitialState(): UpdateState {
  return {
    status: app.isPackaged ? 'idle' : 'unsupported',
    currentVersion: app.getVersion(),
    availableVersion: null,
    progressPercent: null,
    message: app.isPackaged ? null : mainText('automaticUpdatesUnavailable'),
  }
}

function getUpdater(): AppUpdater {
  return autoUpdater
}

/** True when quitting now runs the Windows installer, which needs every app process closed. */
export function isWindowsUpdateInstallPending(): boolean {
  return process.platform === 'win32' && updateState.status === 'downloaded' && getUpdater().autoInstallOnAppQuit
}

export function shouldUseLinuxDebUpdateLauncher(
  platform: string,
  downloadedFile: string | null | undefined,
): boolean {
  return platform === 'linux' && typeof downloadedFile === 'string' && downloadedFile.endsWith('.deb')
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

function setCheckingState(message: string): void {
  setUpdateState({
    status: 'checking',
    availableVersion: null,
    progressPercent: null,
    message,
  })
}

function handleUpdateAvailable(info: UpdateInfo): void {
  void recordUpdateDiagnostic('update-available', { version: info.version ?? null })
  setUpdateState({
    status: 'available',
    availableVersion: info.version ?? null,
    progressPercent: null,
    message: mainText('newVersionAvailable'),
  })
}

function handleUpdateNotAvailable(): void {
  void recordUpdateDiagnostic('update-not-available')
  setUpdateState({
    status: 'up-to-date',
    availableVersion: null,
    progressPercent: null,
    message: mainText('alreadyLatestVersion'),
  })
}

function handleDownloadProgress(progress: ProgressInfo): void {
  const percent = Math.max(0, Math.min(100, Math.round(progress.percent)))
  void recordUpdateDiagnostic('download-progress', { percent })
  setUpdateState({
    status: 'downloading',
    progressPercent: percent,
    message: mainText('downloadingLatestUpdate'),
  })
}

function handleUpdateDownloaded(event: UpdateDownloadedEvent): void {
  downloadedUpdateFile = event.downloadedFile
  getUpdater().autoInstallOnAppQuit = shouldUseLinuxDebUpdateLauncher(process.platform, downloadedUpdateFile)
    ? false
    : true
  void recordUpdateDiagnostic('update-downloaded', { version: event.version ?? updateState.availableVersion })
  setUpdateState({
    status: 'downloaded',
    availableVersion: event.version ?? updateState.availableVersion,
    progressPercent: 100,
    message: mainText('updateReady'),
  })
}

function handleUpdateError(error: unknown): void {
  console.error('Yira update error:', error)
  void recordUpdateDiagnostic('update-error', getSafeUpdateErrorData(error))
  setUpdateState({
    status: 'error',
    progressPercent: null,
    message: getUpdateErrorMessage(error),
  })
}

function getCheckTimeoutMs(reason: 'startup' | 'manual'): number {
  return reason === 'startup' ? STARTUP_CHECK_TIMEOUT_MS : MANUAL_CHECK_TIMEOUT_MS
}

function getCheckTimeoutMessage(reason: 'startup' | 'manual'): string {
  if (reason === 'startup') return mainText('startupUpdateTimeout')
  return mainText('manualUpdateTimeout')
}

async function runUpdateCheck(reason: 'startup' | 'manual'): Promise<UpdateState> {
  await waitForUpdateDiagnosticsInitialization()
  void recordUpdateDiagnostic('check-requested', { source: reason })

  if (!app.isPackaged) {
    void recordUpdateDiagnostic('check-skipped', { reason: 'unpackaged' })
    setUpdateState({
      status: 'unsupported',
      availableVersion: null,
      progressPercent: null,
      message: mainText('automaticUpdatesUnavailable'),
    })
    return updateState
  }

  if (checkInFlight) {
    void recordUpdateDiagnostic('check-skipped', { reason: 'in-flight' })
    return updateState
  }

  if (updateState.status === 'downloading') {
    void recordUpdateDiagnostic('check-skipped', { reason: 'downloading' })
    return updateState
  }

  checkInFlight = true
  setCheckingState(reason === 'startup'
    ? mainText('checkingUpdatesBackground')
    : mainText('checkingUpdates'))

  let timedOut = false
  let timeoutId: NodeJS.Timeout | null = null
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true
      void recordUpdateDiagnostic('check-timeout', { source: reason })
      setUpdateState({
        status: 'error',
        progressPercent: null,
        message: getCheckTimeoutMessage(reason),
      })
      resolve()
    }, getCheckTimeoutMs(reason))
  })

  try {
    await Promise.race([getUpdater().checkForUpdates(), timeout])
  } catch (error) {
    if (!timedOut) handleUpdateError(error)
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    checkInFlight = false
  }

  return updateState
}

interface UpdateInstallHooks {
  confirmInstall?: () => Promise<boolean>
  prepareToClose?: () => Promise<boolean>
}

async function installDownloadedUpdate({ confirmInstall, prepareToClose }: UpdateInstallHooks): Promise<void> {
  await waitForUpdateDiagnosticsInitialization()
  const eligible = updateState.status === 'downloaded'
  const installRequest = recordUpdateDiagnostic('install-requested', { eligible, status: updateState.status })
  if (!eligible) {
    void installRequest
    return
  }

  if (confirmInstall && !await confirmInstall()) {
    void recordUpdateDiagnostic('install-cancelled')
    return
  }
  if (prepareToClose && !await prepareToClose()) return

  if (shouldUseLinuxDebUpdateLauncher(process.platform, downloadedUpdateFile) && downloadedUpdateFile) {
    try {
      await startLinuxDebUpdateLauncher({
        launcherPath: join(process.resourcesPath, 'linux-deb-update-launcher.sh'),
        packagePath: downloadedUpdateFile,
        diagnosticsPath: join(YIRA_HOME, 'logs', 'updater.log'),
        diagnosticsEnabled: updateDiagnostics.isEnabled(),
        version: app.getVersion(),
      })
    } catch (error) {
      handleUpdateError(error)
      return
    }

    void recordUpdateDiagnostic('linux-deb-launcher-started')
    app.quit()
    return
  }

  const quitAndInstallRequest = recordUpdateDiagnostic('quit-and-install-requested')
  await waitForUpdateDiagnosticTask(quitAndInstallRequest, INSTALL_DIAGNOSTIC_FLUSH_TIMEOUT_MS)
  getUpdater().quitAndInstall(false, true)
}

function registerUpdaterEvents(): void {
  const updater = getUpdater()
  updater.logger = {
    info: (message?: unknown) => {
      console.info(message)
      void recordUpdateDiagnostic('updater-library-message', { level: 'info', ...getSafeUpdaterLogData(message) })
    },
    warn: (message?: unknown) => {
      console.warn(message)
      void recordUpdateDiagnostic('updater-library-message', { level: 'warn', ...getSafeUpdaterLogData(message) })
    },
    error: (message?: unknown) => {
      console.error(message)
      void recordUpdateDiagnostic('updater-library-message', { level: 'error', ...getSafeUpdaterLogData(message) })
    },
  }
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true

  updater.on('checking-for-update', () => {
    void recordUpdateDiagnostic('checking')
    setCheckingState('Checking for updates.')
  })
  updater.on('update-available', handleUpdateAvailable)
  updater.on('update-not-available', handleUpdateNotAvailable)
  updater.on('download-progress', handleDownloadProgress)
  updater.on('update-downloaded', handleUpdateDownloaded)
  updater.on('error', handleUpdateError)
}

function registerUpdateLifecycleDiagnostics(): void {
  app.on('before-quit', () => {
    if (updateState.status !== 'downloaded') return
    void recordUpdateDiagnostic('app-before-quit', { updateDownloaded: true })
  })
  app.on('will-quit', () => {
    if (updateState.status !== 'downloaded') return
    void recordUpdateDiagnostic('app-will-quit', { updateDownloaded: true })
  })
  app.on('quit', () => {
    if (updateState.status !== 'downloaded') return
    void recordUpdateDiagnostic('app-quit', { updateDownloaded: true })
  })
}

export function registerUpdateIPC(options: UpdateInstallHooks = {}): void {
  if (updaterRegistered) return

  updaterRegistered = true
  registerUpdaterEvents()
  registerUpdateLifecycleDiagnostics()
  void ensureUpdateDiagnosticsInitialized()

  ipcMain.handle('updates:getState', async (): Promise<UpdateState> => updateState)
  ipcMain.handle('updates:check', async (): Promise<UpdateState> => runUpdateCheck('manual'))
  ipcMain.handle('updates:install', async (): Promise<void> => {
    await installDownloadedUpdate(options)
  })
}

export function scheduleStartupUpdateCheck(): void {
  if (startupCheckScheduled || !app.isPackaged) return

  startupCheckScheduled = true
  setTimeout(() => {
    void runUpdateCheck('startup')
  }, STARTUP_CHECK_DELAY_MS)
}
