import { BrowserWindow, ipcMain, Notification } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type {
  AgentAlertNotificationRequest,
  AgentAlertNotificationTarget,
  NotificationAttentionOptions,
  NotificationAttentionResult,
} from '@shared/types'
import { createWindowAttentionController } from '../windowAttention'

const windowAttention = createWindowAttentionController()
const agentAlertNotifications = new Set<Notification>()

function normalizeAgentAlertNotificationRequest(input: unknown): AgentAlertNotificationRequest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const request = input as Record<string, unknown>
  if (typeof request.title !== 'string' || typeof request.body !== 'string') return null
  if (typeof request.tileId !== 'string') return null
  if (request.workspaceId !== null && typeof request.workspaceId !== 'string') return null

  const title = request.title.trim()
  const body = request.body.trim()
  const tileId = request.tileId.trim()
  if (!title || !body || !tileId || request.tileId.length > 256) return null

  return {
    title: title.slice(0, 120),
    body: body.slice(0, 240),
    workspaceId: request.workspaceId,
    tileId,
  }
}

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

  ipcMain.handle('notifications:showAgentAlert', (event, input: unknown): boolean => {
    const request = normalizeAgentAlertNotificationRequest(input)
    if (!request || !Notification.isSupported()) return false

    let createdNotification: Notification | null = null
    try {
      const notification = new Notification({
        title: request.title,
        body: request.body,
        silent: true,
      })
      createdNotification = notification
      agentAlertNotifications.add(notification)
      notification.on('close', () => agentAlertNotifications.delete(notification))
      notification.on('click', () => {
        agentAlertNotifications.delete(notification)
        const window = getEventWindow(event)
        if (!window) return
        if (window.isMinimized()) window.restore()
        window.show()
        window.focus()
        const target: AgentAlertNotificationTarget = {
          workspaceId: request.workspaceId,
          tileId: request.tileId,
        }
        window.webContents.send('notifications:agentAlertClicked', target)
      })
      notification.show()
      return true
    } catch {
      if (createdNotification) agentAlertNotifications.delete(createdNotification)
      return false
    }
  })
}
