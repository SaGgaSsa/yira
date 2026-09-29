import { app, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { is } from '@electron-toolkit/utils'
import { YIRA_HOME } from '../paths'
import type { ClaudeStatusLineMutationResult, ClaudeStatusLineState, UserSettings } from '@shared/types'
import { normalizeUserSettings } from '@shared/userSettings'
import { resolveSupportedLanguage } from '@shared/language'
import { installClaudeHookConfiguration, installCodexHookConfiguration, uninstallClaudeHookConfiguration, uninstallCodexHookConfiguration, type AgentHookProvider } from '../agentHookConfiguration'
import { getClaudeStatusLineState, installClaudeStatusLine, uninstallClaudeStatusLine } from '../claudeStatusLineConfiguration'
import { setMainLanguage } from '../i18n'

const SETTINGS_PATH = join(YIRA_HOME, 'settings.json')

function getAgentHookPath(provider: AgentHookProvider): string {
  return provider === 'codex' ? join(homedir(), '.codex', 'hooks.json') : join(homedir(), '.claude', 'settings.json')
}

function getAgentHookClientCommand(): string {
  return is.dev ? `node ${JSON.stringify(join(process.cwd(), 'resources', 'agent-hook-client.mjs'))}` : `node ${JSON.stringify(join(process.resourcesPath, 'agent-hook-client.mjs'))}`
}

function getClaudeSettingsPath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json')
}

function getClaudeStatusLineClientCommand(): string {
  const scriptPath = is.dev ? join(process.cwd(), 'resources', 'claude-statusline-capture.mjs') : join(process.resourcesPath, 'claude-statusline-capture.mjs')
  return `node ${JSON.stringify(scriptPath)}`
}

async function readClaudeSettings(path: string): Promise<{ text: string; exists: boolean }> {
  try { return { text: await fs.readFile(path, 'utf8'), exists: true } } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { text: '{}', exists: false }
    throw error
  }
}

async function getClaudeStatusLine(): Promise<ClaudeStatusLineState> {
  try {
    const { text } = await readClaudeSettings(getClaudeSettingsPath())
    return getClaudeStatusLineState(text, getClaudeStatusLineClientCommand())
  } catch {
    return { status: 'unsupported', message: 'Claude Code settings could not be read.' }
  }
}

async function mutateClaudeStatusLine(operation: 'install' | 'uninstall'): Promise<ClaudeStatusLineMutationResult> {
  const path = getClaudeSettingsPath()
  try {
    const original = await readClaudeSettings(path)
    const clientCommand = getClaudeStatusLineClientCommand()
    const result = operation === 'install'
      ? installClaudeStatusLine(original.text, clientCommand)
      : uninstallClaudeStatusLine(original.text, clientCommand)
    if (!result.ok || !result.changed) return result

    await fs.mkdir(join(path, '..'), { recursive: true })
    const current = await readClaudeSettings(path)
    if (current.exists !== original.exists || current.text !== original.text) {
      return {
        ok: false,
        success: false,
        status: 'conflict',
        changed: false,
        text: original.text,
        message: 'Claude Code settings changed while Yira was preparing the update. Review the file and try again.',
      }
    }
    await fs.writeFile(path, result.text, 'utf8')
    return result
  } catch {
    return {
      ok: false,
      success: false,
      status: 'unsupported',
      changed: false,
      text: '{}',
      message: 'Claude Code settings could not be updated.',
    }
  }
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

export async function loadStoredUserSettings(): Promise<UserSettings | null> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    const hasLanguage = Object.prototype.hasOwnProperty.call(parsed, 'language')
    const normalized = normalizeUserSettings({
      ...parsed,
      language: hasLanguage ? parsed.language : resolveSupportedLanguage(app.getLocale()),
    })
    setMainLanguage(normalized.language)

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
      parsed.themeId !== normalized.themeId ||
      typeof parsed?.terminal?.agentAlertsEnabled !== 'boolean' ||
      parsed?.terminal?.themeId !== normalized.terminal.themeId ||
      parsed.windowBackgroundMaterial !== normalized.windowBackgroundMaterial
    ) {
      await fs.writeFile(SETTINGS_PATH, JSON.stringify(normalized, null, 2))
    }

    return normalized
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const defaults = normalizeUserSettings({ language: resolveSupportedLanguage(app.getLocale()) })
      setMainLanguage(defaults.language)
      await fs.mkdir(YIRA_HOME, { recursive: true })
      await fs.writeFile(SETTINGS_PATH, JSON.stringify(defaults, null, 2))
      return defaults
    }
    return null
  }
}

export function registerSettingsIPC(): void {
  ipcMain.handle('settings:load', async (): Promise<UserSettings | null> => {
    const settings = await loadStoredUserSettings()
    return settings
  })

  ipcMain.handle('settings:save', async (_, settings: UserSettings): Promise<void> => {
    const normalized = normalizeUserSettings(settings)
    setMainLanguage(normalized.language)

    await fs.mkdir(YIRA_HOME, { recursive: true })
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(normalized, null, 2))
  })

  ipcMain.handle('agentHooks:configure', async (_, provider: AgentHookProvider) => mutateAgentHooks(provider, 'install'))
  ipcMain.handle('agentHooks:uninstall', async (_, provider: AgentHookProvider) => mutateAgentHooks(provider, 'uninstall'))
  ipcMain.handle('claudeStatusLine:status', async (): Promise<ClaudeStatusLineState> => getClaudeStatusLine())
  ipcMain.handle('claudeStatusLine:install', async (): Promise<ClaudeStatusLineMutationResult> => mutateClaudeStatusLine('install'))
  ipcMain.handle('claudeStatusLine:uninstall', async (): Promise<ClaudeStatusLineMutationResult> => mutateClaudeStatusLine('uninstall'))
}
