import { BrowserWindow, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { NotificationAttentionOptions, NotificationAttentionResult } from '@shared/types'
import { createWindowAttentionController } from '../windowAttention'

const windowAttention = createWindowAttentionController()

function getEventWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) return null
  return window
}

export function clearWindowAttention(window: BrowserWindow): void {
  windowAttention.clear(window)
}

export function registerNotificationIPC(): void {
  ipcMain.handle(
    'notifications:requestAttention',
    (event, options?: NotificationAttentionOptions): NotificationAttentionResult => {
      const window = getEventWindow(event)
      if (!window) return { marked: false, reason: 'no-window' }

      const reason = windowAttention.request(window, options?.onlyWhenInactive !== false)
      return { marked: reason === 'marked', reason }
    },
  )

  ipcMain.handle('notifications:clearAttention', (event): NotificationAttentionResult => {
    const window = getEventWindow(event)
    if (!window) return { marked: false, reason: 'no-window' }

    clearWindowAttention(window)
    return { marked: false, reason: 'cleared' }
  })
}
