import { app, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { is } from '@electron-toolkit/utils'
import { YIRA_HOME } from '../paths'
import type { UserSettings } from '@shared/types'
import { normalizeUserSettings } from '@shared/userSettings'
import { resolveSupportedLanguage } from '@shared/language'
import { installClaudeHookConfiguration, installCodexHookConfiguration, uninstallClaudeHookConfiguration, uninstallCodexHookConfiguration, type AgentHookProvider } from '../agentHookConfiguration'
import { installClaudeUsageStatusLineConfiguration, uninstallClaudeUsageStatusLineConfiguration } from '../claudeUsageStatusLineConfiguration'

const SETTINGS_PATH = join(YIRA_HOME, 'settings.json')

function getAgentHookPath(provider: AgentHookProvider): string {
  return provider === 'codex' ? join(homedir(), '.codex', 'hooks.json') : join(homedir(), '.claude', 'settings.json')
}

function getAgentHookClientCommand(): string {
  return is.dev ? `node ${JSON.stringify(join(process.cwd(), 'resources', 'agent-hook-client.mjs'))}` : `node ${JSON.stringify(join(process.resourcesPath, 'agent-hook-client.mjs'))}`
}

function getClaudeUsageStatusLineCommand(): string {
  const scriptPath = is.dev
    ? join(process.cwd(), 'resources', 'claude-usage-status-line.mjs')
    : join(process.resourcesPath, 'claude-usage-status-line.mjs')
  return `node ${JSON.stringify(scriptPath)}`
}

async function mutateAgentHooks(provider: AgentHookProvider, operation: 'install' | 'uninstall') {
  const path = getAgentHookPath(provider)
  let text = '{}'
  try { text = await fs.readFile(path, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const command = getAgentHookClientCommand()
  const result = provider === 'codex'
    ? operation === 'install' ? installCodexHookConfiguration(text, command) : uninstallCodexHookConfiguration(text, command)
    : operation === 'install' ? installClaudeHookConfiguration(text, command) : uninstallClaudeHookConfiguration(text, command)
  if (result.ok && result.changed) {
    await fs.mkdir(join(path, '..'), { recursive: true })
    await fs.writeFile(path, result.text, 'utf8')
  }
  return result
}

async function mutateClaudeUsageStatusLine(operation: 'install' | 'uninstall') {
  const path = join(homedir(), '.claude', 'settings.json')
  let text = '{}'
  try { text = await fs.readFile(path, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const command = getClaudeUsageStatusLineCommand()
  const result = operation === 'install'
    ? installClaudeUsageStatusLineConfiguration(text, command)
    : uninstallClaudeUsageStatusLineConfiguration(text, command)
  if (result.ok && result.changed) {
    await fs.mkdir(join(path, '..'), { recursive: true })
    await fs.writeFile(path, result.text, 'utf8')
  }
  return result
}

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
      typeof parsed?.terminal?.agentAlertsEnabled !== 'boolean' ||
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

  ipcMain.handle('agentHooks:configure', async (_, provider: AgentHookProvider) => mutateAgentHooks(provider, 'install'))
  ipcMain.handle('agentHooks:uninstall', async (_, provider: AgentHookProvider) => mutateAgentHooks(provider, 'uninstall'))
  ipcMain.handle('agentUsage:claudeStatusLine:install', async () => mutateClaudeUsageStatusLine('install'))
  ipcMain.handle('agentUsage:claudeStatusLine:uninstall', async () => mutateClaudeUsageStatusLine('uninstall'))
}
