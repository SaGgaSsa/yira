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
      const parsed = JSON.parse(raw)

      return {
        ...DEFAULT_USER_SETTINGS,
        ...parsed,
        browser: {
          ...DEFAULT_USER_SETTINGS.browser,
          ...(parsed.browser ?? {}),
        },
        groups: {
          ...DEFAULT_USER_SETTINGS.groups,
          ...(parsed.groups ?? {}),
        },
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('settings:save', async (_, settings: UserSettings): Promise<void> => {
    const normalized: UserSettings = {
      ...DEFAULT_USER_SETTINGS,
      ...settings,
      browser: {
        ...DEFAULT_USER_SETTINGS.browser,
        ...(settings.browser ?? {}),
      },
      groups: {
        ...DEFAULT_USER_SETTINGS.groups,
        ...(settings.groups ?? {}),
      },
    }

    await fs.mkdir(YIRA_HOME, { recursive: true })
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(normalized, null, 2))
  })
}
