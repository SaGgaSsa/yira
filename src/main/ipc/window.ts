import { BrowserWindow, ipcMain } from 'electron'
import type { WindowClosePreparationResponse } from '@shared/types'
import {
  WindowBridgeRequestBroker,
  type RendererRequestTarget,
  type WindowPreparationPhase,
} from '../windowBridgeRequestBroker'

const FALLBACK_WINDOW_TITLE = 'Yira'
const TITLE_BAR_OVERLAY_COLORS = {
  dark: { color: '#111111', symbolColor: '#ffffff' },
  light: { color: '#ffffff', symbolColor: '#1a1a1a' },
} as const

function normalizeWindowTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, ' ')
  return normalized || FALLBACK_WINDOW_TITLE
}

export interface WindowClosePreparationBridge {
  requestAll: (phase: WindowPreparationPhase, timeoutMs: number) => Promise<void>
  requestPrimary: (phase: WindowPreparationPhase, timeoutMs: number) => Promise<void>
}

function toRequestTarget(window: BrowserWindow): RendererRequestTarget {
  return {
    id: window.webContents.id,
    isDestroyed: () => window.isDestroyed() || window.webContents.isDestroyed(),
    send: (channel, payload) => window.webContents.send(channel, payload),
  }
}

function isPreparationResponse(value: unknown): value is WindowClosePreparationResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Partial<WindowClosePreparationResponse>
  return typeof response.requestId === 'string' &&
    (response.phase === 'flush' || response.phase === 'persist') &&
    typeof response.ok === 'boolean' &&
    (response.error === undefined || typeof response.error === 'string')
}

export function registerWindowIPC(getMainWindow: () => BrowserWindow | null): WindowClosePreparationBridge {
  const broker = new WindowBridgeRequestBroker()

  ipcMain.handle('window:setTitle', (event, title: string): void => {
    const nativeWindow = BrowserWindow.fromWebContents(event.sender)
    if (!nativeWindow || nativeWindow.isDestroyed()) return

    nativeWindow.setTitle(normalizeWindowTitle(title))
  })

  ipcMain.handle('window:setTitleBarOverlayTheme', (event, theme: unknown): void => {
    if (theme !== 'dark' && theme !== 'light') return
    if (process.platform !== 'win32' && process.platform !== 'linux') return

    const nativeWindow = BrowserWindow.fromWebContents(event.sender)
    if (!nativeWindow || nativeWindow.isDestroyed()) return
    if (nativeWindow !== getMainWindow()) return

    nativeWindow.setTitleBarOverlay({
      ...TITLE_BAR_OVERLAY_COLORS[theme],
      height: 36,
    })
  })

  ipcMain.on('window:closePreparationResponse', (event, response: unknown) => {
    if (!isPreparationResponse(response)) return
    broker.respond(event.sender.id, response)
  })

  return {
    requestAll: (phase, timeoutMs) => broker.request(
      BrowserWindow.getAllWindows().map(toRequestTarget),
      phase,
      timeoutMs,
    ),
    requestPrimary: (phase, timeoutMs) => {
      const mainWindow = getMainWindow()
      return broker.request(mainWindow ? [toRequestTarget(mainWindow)] : [], phase, timeoutMs)
    },
  }
}
