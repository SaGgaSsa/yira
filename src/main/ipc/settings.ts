import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { YIRA_HOME } from '../paths'
import type { UserSettings } from '@shared/types'
import { DEFAULT_USER_SETTINGS } from '@shared/types'

const SETTINGS_PATH = join(YIRA_HOME, 'settings.json')

export function registerSettingsIPC(): void {
  ipcMain.handle('settings:load', async (): Promise<UserSettings | null> => {
    try {
      const raw = await fs.readFile(SETTINGS_PATH, 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('settings:save', async (_, settings: UserSettings): Promise<void> => {
    await fs.mkdir(YIRA_HOME, { recursive: true })
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2))
  })
}
