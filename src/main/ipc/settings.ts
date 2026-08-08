import { app, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { YIRA_HOME } from '../paths'
import type { UserSettings } from '@shared/types'
import { normalizeUserSettings } from '@shared/userSettings'
import { resolveSupportedLanguage } from '@shared/language'

const SETTINGS_PATH = join(YIRA_HOME, 'settings.json')

export async function loadStoredUserSettings(): Promise<UserSettings | null> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    const hasLanguage = Object.prototype.hasOwnProperty.call(parsed, 'language')
    const normalized = normalizeUserSettings({
      ...parsed,
      language: hasLanguage ? parsed.language : resolveSupportedLanguage(app.getLocale()),
    })

    if (
      Object.prototype.hasOwnProperty.call(parsed, 'fontSize') ||
      !Object.prototype.hasOwnProperty.call(parsed, 'interfaceFontSizePx') ||
      !Object.prototype.hasOwnProperty.call(parsed, 'tileFontSizePx') ||
      !Object.prototype.hasOwnProperty.call(parsed, 'updateDiagnosticsEnabled') ||
      typeof parsed.updateDiagnosticsEnabled !== 'boolean' ||
      !Object.prototype.hasOwnProperty.call(parsed, 'updateDiagnosticsMigrationComplete') ||
      typeof parsed.updateDiagnosticsMigrationComplete !== 'boolean' ||
      parsed.updateDiagnosticsMigrationComplete !== normalized.updateDiagnosticsMigrationComplete ||
      !hasLanguage ||
      parsed.language !== normalized.language ||
      parsed?.terminal?.themeId !== normalized.terminal.themeId
    ) {
      await fs.writeFile(SETTINGS_PATH, JSON.stringify(normalized, null, 2))
    }

    return normalized
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const defaults = normalizeUserSettings({ language: resolveSupportedLanguage(app.getLocale()) })
      await fs.mkdir(YIRA_HOME, { recursive: true })
      await fs.writeFile(SETTINGS_PATH, JSON.stringify(defaults, null, 2))
      return defaults
    }
    return null
  }
}

export function registerSettingsIPC(): void {
  ipcMain.handle('settings:load', async (): Promise<UserSettings | null> => {
    return loadStoredUserSettings()
  })

  ipcMain.handle('settings:save', async (_, settings: UserSettings): Promise<void> => {
    const normalized = normalizeUserSettings(settings)

    await fs.mkdir(YIRA_HOME, { recursive: true })
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(normalized, null, 2))
  })
}
