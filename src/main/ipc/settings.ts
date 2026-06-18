import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { YIRA_HOME } from '../paths'
import type { UserSettings } from '@shared/types'
import { normalizeUserSettings } from '@shared/userSettings'

const SETTINGS_PATH = join(YIRA_HOME, 'settings.json')

export function registerSettingsIPC(): void {
  ipcMain.handle('settings:load', async (): Promise<UserSettings | null> => {
    try {
      const raw = await fs.readFile(SETTINGS_PATH, 'utf8')
      const parsed = JSON.parse(raw)
      const normalized = normalizeUserSettings(parsed)

      if (
        Object.prototype.hasOwnProperty.call(parsed, 'fontSize') ||
        !Object.prototype.hasOwnProperty.call(parsed, 'interfaceFontSizePx') ||
        !Object.prototype.hasOwnProperty.call(parsed, 'tileFontSizePx') ||
        parsed?.terminal?.themeId !== normalized.terminal.themeId
      ) {
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(normalized, null, 2))
      }

      return normalized
    } catch {
      return null
    }
  })

  ipcMain.handle('settings:save', async (_, settings: UserSettings): Promise<void> => {
    const normalized = normalizeUserSettings(settings)

    await fs.mkdir(YIRA_HOME, { recursive: true })
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(normalized, null, 2))
  })
}
