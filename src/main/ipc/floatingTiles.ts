import { BrowserWindow, app, ipcMain, screen } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import type { WindowBounds } from '../../shared/types'
import { normalizeFloatingNavigationRequest } from '../../shared/floatingNavigation'
import { getWindowMaterialOptions } from '../windowMaterial'

interface FloatingTileOpenInput {
  workspaceId: string
  tileId: string
  bounds?: WindowBounds
}

interface FloatingTileSnapshotRequest {
  requestId: string
  workspaceId: string
  tileId: string
}

interface FloatingTileUpdateInput {
  workspaceId: string
  tileId: string
  patch: unknown
}

interface FloatingWindowEntry {
  workspaceId: string
  tileId: string
  window: BrowserWindow
  suppressAttachOnClose: boolean
}

const DEFAULT_BOUNDS: WindowBounds = { x: 120, y: 120, width: 980, height: 640 }
const MIN_WIDTH = 480
const MIN_HEIGHT = 320

const floatingWindows = new Map<string, FloatingWindowEntry>()
let appQuitting = false

function getPreloadPath(): string {
  const preloadPath = join(__dirname, '../preload/index.mjs')
  return existsSync(preloadPath) ? preloadPath : join(__dirname, '../preload/index.js')
}

function getSafeBounds(bounds: WindowBounds | undefined): WindowBounds {
  const candidate = bounds ?? DEFAULT_BOUNDS
  const width = Number.isFinite(candidate.width) ? Math.max(MIN_WIDTH, candidate.width) : DEFAULT_BOUNDS.width
  const height = Number.isFinite(candidate.height) ? Math.max(MIN_HEIGHT, candidate.height) : DEFAULT_BOUNDS.height
  const displays = screen.getAllDisplays()
  const display = screen.getDisplayMatching({
    x: Number.isFinite(candidate.x) ? candidate.x : DEFAULT_BOUNDS.x,
    y: Number.isFinite(candidate.y) ? candidate.y : DEFAULT_BOUNDS.y,
    width,
    height,
  }) ?? displays[0]
  const area = display?.workArea ?? { x: 0, y: 0, width: 1400, height: 900 }
  const maxX = area.x + Math.max(0, area.width - width)
  const maxY = area.y + Math.max(0, area.height - height)
  const x = Math.min(Math.max(Number.isFinite(candidate.x) ? candidate.x : DEFAULT_BOUNDS.x, area.x), maxX)
  const y = Math.min(Math.max(Number.isFinite(candidate.y) ? candidate.y : DEFAULT_BOUNDS.y, area.y), maxY)

  return { x, y, width, height }
}

function getWindowBounds(window: BrowserWindow): WindowBounds {
  const bounds = window.getBounds()
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }
}

function loadFloatingRenderer(window: BrowserWindow, workspaceId: string, tileId: string): void {
  const params = new URLSearchParams({
    mode: 'floating-tile',
    workspaceId,
    tileId,
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${params.toString()}`)
    return
  }

  window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: Object.fromEntries(params.entries()),
  })
}

function closeEntry(tileId: string, attachOnClose: boolean): void {
  const entry = floatingWindows.get(tileId)
  if (!entry || entry.window.isDestroyed()) return
  entry.suppressAttachOnClose = !attachOnClose
  entry.window.close()
}

export function registerFloatingTilesIPC(
  getMainWindow: () => BrowserWindow | null,
  isAppCloseApproved: () => boolean = () => false,
): void {
  app.on('before-quit', () => {
    if (isAppCloseApproved()) appQuitting = true
  })

  ipcMain.handle('floating:open', (_event, input: FloatingTileOpenInput) => {
    const existing = floatingWindows.get(input.tileId)
    if (existing && !existing.window.isDestroyed()) {
      existing.window.focus()
      return
    }

    const bounds = getSafeBounds(input.bounds)
    const window = new BrowserWindow({
      title: 'Yira Tile',
      ...bounds,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      show: false,
      ...getWindowMaterialOptions(),
      webPreferences: {
        preload: getPreloadPath(),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true,
      },
    })
    const entry: FloatingWindowEntry = {
      workspaceId: input.workspaceId,
      tileId: input.tileId,
      window,
      suppressAttachOnClose: false,
    }
    floatingWindows.set(input.tileId, entry)
    let lastBounds = bounds

    const sendBounds = () => {
      if (window.isDestroyed()) return
      lastBounds = getWindowBounds(window)
      const mainWindow = getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.webContents.send('floating:boundsChanged', {
        workspaceId: input.workspaceId,
        tileId: input.tileId,
        bounds: lastBounds,
      })
    }

    window.on('ready-to-show', () => {
      if (!window.isDestroyed()) window.show()
    })
    window.on('moved', sendBounds)
    window.on('resized', sendBounds)
    window.on('close', () => {
      sendBounds()
    })
    window.on('closed', () => {
      floatingWindows.delete(input.tileId)
      if (appQuitting || entry.suppressAttachOnClose) return
      const mainWindow = getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) return
      mainWindow.webContents.send('floating:attachRequested', {
        workspaceId: input.workspaceId,
        tileId: input.tileId,
        bounds: lastBounds,
      })
    })

    loadFloatingRenderer(window, input.workspaceId, input.tileId)
  })

  ipcMain.handle('floating:focus', (_event, tileId: string) => {
    const entry = floatingWindows.get(tileId)
    if (!entry || entry.window.isDestroyed()) return
    entry.window.focus()
  })

  ipcMain.handle('floating:close', (_event, tileId: string, attachOnClose = false) => {
    closeEntry(tileId, attachOnClose)
  })

  ipcMain.handle('floating:closeWorkspace', (_event, workspaceId: string) => {
    for (const entry of floatingWindows.values()) {
      if (entry.workspaceId !== workspaceId) continue
      entry.suppressAttachOnClose = true
      entry.window.close()
    }
  })

  ipcMain.handle('floating:requestAttach', (event, tileId: string) => {
    const entry = floatingWindows.get(tileId)
    if (!entry) return
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('floating:attachRequested', {
      workspaceId: entry.workspaceId,
      tileId,
      bounds: BrowserWindow.fromWebContents(event.sender)?.getBounds(),
    })
    closeEntry(tileId, false)
  })

  ipcMain.handle('floating:getTileSnapshot', async (_event, request: Omit<FloatingTileSnapshotRequest, 'requestId'>) => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return null

    const requestId = `floating-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const response = new Promise((resolve) => {
      ipcMain.once(`floating:snapshotResponse:${requestId}`, (_responseEvent, payload: unknown) => {
        resolve(payload)
      })
    })
    mainWindow.webContents.send('floating:snapshotRequest', {
      requestId,
      workspaceId: request.workspaceId,
      tileId: request.tileId,
    })
    return response
  })

  ipcMain.on('floating:snapshotResponse', (_event, requestId: string, payload: unknown) => {
    ipcMain.emit(`floating:snapshotResponse:${requestId}`, _event, payload)
  })

  ipcMain.handle('floating:updateTile', (_event, input: FloatingTileUpdateInput) => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('floating:updateTile', input)
  })

  ipcMain.handle('floating:requestNavigation', (event, tileId: string, request: unknown) => {
    const entry = floatingWindows.get(tileId)
    if (!entry || entry.window.webContents !== event.sender) return
    const normalizedRequest = normalizeFloatingNavigationRequest(request)
    if (!normalizedRequest) return
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('floating:navigationRequested', {
      workspaceId: entry.workspaceId,
      ...normalizedRequest,
    })
  })
}
