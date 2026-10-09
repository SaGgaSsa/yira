import { BrowserWindow, ipcMain, Notification } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type {
  AgentAlertNotificationRequest,
  AgentAlertNotificationTarget,
  AgentSessionSurface,
  NotificationAttentionOptions,
  NotificationAttentionResult,
} from '@shared/types'
import { createWindowAttentionController } from '../windowAttention'

const windowAttention = createWindowAttentionController()
// One notification per tile. Linux and macOS keep shown notifications in the
// notification center until the app closes them, so attending the tile or a
// newer alert for it must close the previous one. Entries survive the 'close'
// event because some servers emit it when the popup moves to the tray.
const agentAlertNotifications = new Map<string, Notification>()
const AGENT_ALERT_LAUNCH_PREFIX = 'yira-agent-alert:'

function normalizeAgentAlertNotificationRequest(input: unknown): AgentAlertNotificationRequest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const request = input as Record<string, unknown>
  if (typeof request.title !== 'string' || typeof request.body !== 'string') return null
  if (typeof request.tileId !== 'string') return null
  if (request.workspaceId !== null && typeof request.workspaceId !== 'string') return null
  if (!isAgentSessionSurface(request.surface)) return null

  const title = request.title.trim()
  const body = request.body.trim()
  const tileId = request.tileId.trim()
  if (!title || !body || !tileId || request.tileId.length > 256) return null

  return {
    title: title.slice(0, 120),
    body: body.slice(0, 240),
    workspaceId: request.workspaceId,
    tileId,
    surface: request.surface,
  }
}

function isAgentSessionSurface(value: unknown): value is AgentSessionSurface {
  return value === 'tile' || value === 'agents-view'
}

function getEventWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed()) return null
  return window
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Windows activates toasts through COM, so a click can arrive after the
// Notification object is gone. The launch argument carries the target tile.
function buildAgentAlertToastXml(request: AgentAlertNotificationRequest): string {
  const target: AgentAlertNotificationTarget = {
    workspaceId: request.workspaceId,
    tileId: request.tileId,
    surface: request.surface,
  }
  const launch = AGENT_ALERT_LAUNCH_PREFIX + JSON.stringify(target)
  return [
    `<toast launch="${escapeXml(launch)}" activationType="foreground" duration="long">`,
    '<visual><binding template="ToastGeneric">',
    `<text>${escapeXml(request.title)}</text>`,
    `<text>${escapeXml(request.body)}</text>`,
    '</binding></visual>',
    '<audio silent="true"/>',
    '</toast>',
  ].join('')
}

function parseAgentAlertLaunch(argumentsText: string): AgentAlertNotificationTarget | null {
  if (!argumentsText.startsWith(AGENT_ALERT_LAUNCH_PREFIX)) return null
  try {
    const parsed = JSON.parse(argumentsText.slice(AGENT_ALERT_LAUNCH_PREFIX.length)) as Record<string, unknown>
    if (typeof parsed.tileId !== 'string' || !parsed.tileId) return null
    if (parsed.workspaceId !== null && typeof parsed.workspaceId !== 'string') return null
    if (!isAgentSessionSurface(parsed.surface)) return null
    return { workspaceId: parsed.workspaceId, tileId: parsed.tileId, surface: parsed.surface }
  } catch {
    return null
  }
}

function focusAgentAlertTarget(window: BrowserWindow | null, target: AgentAlertNotificationTarget): void {
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  window.webContents.send('notifications:agentAlertClicked', target)
}

export function clearWindowAttention(window: BrowserWindow): void {
  windowAttention.clear(window)
}

function forgetAgentAlertNotification(tileId: string, notification: Notification): void {
  if (agentAlertNotifications.get(tileId) === notification) agentAlertNotifications.delete(tileId)
}

export function dismissAgentAlertNotification(tileId: string): void {
  const notification = agentAlertNotifications.get(tileId)
  if (!notification) return
  agentAlertNotifications.delete(tileId)
  try {
    notification.close()
  } catch {
    // The notification server may already have dropped it.
  }
}

export function registerNotificationIPC(getMainWindow: () => BrowserWindow | null): void {
  const usesToastActivation = process.platform === 'win32'
  if (usesToastActivation) {
    Notification.handleActivation((details) => {
      const target = parseAgentAlertLaunch(details.arguments)
      if (target) focusAgentAlertTarget(getMainWindow(), target)
    })
  }

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

    dismissAgentAlertNotification(request.tileId)

    let createdNotification: Notification | null = null
    try {
      const notification = new Notification({
        title: request.title,
        body: request.body,
        silent: true,
        ...(usesToastActivation ? { toastXml: buildAgentAlertToastXml(request) } : {}),
      })
      createdNotification = notification
      agentAlertNotifications.set(request.tileId, notification)
      notification.on('click', () => {
        forgetAgentAlertNotification(request.tileId, notification)
        // On Windows the activation handler already routes the click.
        if (usesToastActivation) return
        focusAgentAlertTarget(getEventWindow(event), {
          workspaceId: request.workspaceId,
          tileId: request.tileId,
          surface: request.surface,
        })
      })
      notification.show()
      return true
    } catch {
      if (createdNotification) forgetAgentAlertNotification(request.tileId, createdNotification)
      return false
    }
  })
}
