import { BrowserWindow, ipcMain } from 'electron'

import {
  MOD_PANEL_MAX_ID_LENGTH,
  normalizeModPanelAddress,
  type ModPanelChange,
  type ModPanelPress,
} from '@shared/modPanels'

import type { ModPanelBridge } from '../modPanelBridge'

function normalizePress(input: unknown): ModPanelPress | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  if (typeof record.key !== 'string') return null

  const address = normalizeModPanelAddress(record)
  if (!address) return null

  const key = record.key.trim()
  if (!key || key.length > MOD_PANEL_MAX_ID_LENGTH) return null
  return { ...address, key }
}

export function registerModPanelsIPC(bridge: ModPanelBridge): void {
  ipcMain.handle('modPanels:list', () => bridge.listPanels())

  ipcMain.handle('modPanels:press', (_event, input: unknown): boolean => {
    const press = normalizePress(input)
    if (!press) return false
    return bridge.press(press)
  })
}

export function broadcastModPanelChange(change: ModPanelChange): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send('modPanels:changed', change)
  }
}
