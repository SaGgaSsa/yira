import { BrowserWindow, ipcMain } from 'electron'

const FALLBACK_WINDOW_TITLE = 'Yira'

function normalizeWindowTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, ' ')
  return normalized || FALLBACK_WINDOW_TITLE
}

export function registerWindowIPC(): void {
  ipcMain.handle('window:setTitle', (event, title: string): void => {
    const nativeWindow = BrowserWindow.fromWebContents(event.sender)
    if (!nativeWindow || nativeWindow.isDestroyed()) return

    nativeWindow.setTitle(normalizeWindowTitle(title))
  })
}
