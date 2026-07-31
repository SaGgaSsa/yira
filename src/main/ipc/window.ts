import { BrowserWindow, ipcMain } from 'electron'

const FALLBACK_WINDOW_TITLE = 'Yira'
const TITLE_BAR_OVERLAY_COLORS = {
  dark: { color: '#111111', symbolColor: '#ffffff' },
  light: { color: '#ffffff', symbolColor: '#1a1a1a' },
} as const

function normalizeWindowTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, ' ')
  return normalized || FALLBACK_WINDOW_TITLE
}

export function registerWindowIPC(getMainWindow: () => BrowserWindow | null): void {
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
}
