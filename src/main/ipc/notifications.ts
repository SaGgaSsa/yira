import { BrowserWindow, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { NotificationAttentionOptions, NotificationAttentionResult } from '@shared/types'

function getEventWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) return null
  return window
}

export function clearWindowAttention(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  window.flashFrame(false)
}

export function registerNotificationIPC(): void {
  ipcMain.handle(
    'notifications:requestAttention',
    (event, options?: NotificationAttentionOptions): NotificationAttentionResult => {
      const window = getEventWindow(event)
      if (!window) return { marked: false, reason: 'no-window' }

      if (options?.onlyWhenInactive !== false && window.isFocused()) {
        return { marked: false, reason: 'window-focused' }
      }

      window.flashFrame(true)
      return { marked: true, reason: 'marked' }
    },
  )

  ipcMain.handle('notifications:clearAttention', (event): NotificationAttentionResult => {
    const window = getEventWindow(event)
    if (!window) return { marked: false, reason: 'no-window' }

    clearWindowAttention(window)
    return { marked: false, reason: 'cleared' }
  })
}
