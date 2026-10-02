import { app, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { is } from '@electron-toolkit/utils'
import { YIRA_HOME } from '../paths'
import type { AgentProvider, ClaudeStatusLineMutationResult, ClaudeStatusLineState, UserSettings } from '@shared/types'
import { DEFAULT_USER_SETTINGS } from '@shared/types'
import { normalizeUserSettings } from '@shared/userSettings'
import { resolveSupportedLanguage } from '@shared/language'
import { installClaudeHookConfiguration, installCodexHookConfiguration, uninstallClaudeHookConfiguration, uninstallCodexHookConfiguration, type AgentHookProvider } from '../agentHookConfiguration'
import { getClaudeStatusLineState, installClaudeStatusLine, uninstallClaudeStatusLine } from '../claudeStatusLineConfiguration'
import { setMainLanguage } from '../i18n'
import { getAgentHomeDirectory } from '../agents/providers'

const SETTINGS_PATH = join(YIRA_HOME, 'settings.json')
let currentSettings: UserSettings | null = null

const SHORTCUT_KEY_ALIASES: Record<string, string> = {
  esc: 'Escape',
  del: 'Delete',
  spacebar: 'Space',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
}

function normalizeAgentSessionShortcut(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const parts = value.split('+').map((part) => part.trim())
  if (parts.length < 2 || parts.some((part) => !part)) return null

  const modifierAliases: Record<string, string> = {
    ctrl: 'Ctrl',
    control: 'Ctrl',
    cmd: 'Cmd',
    command: 'Cmd',
    meta: 'Cmd',
    alt: 'Alt',
    option: 'Alt',
    shift: 'Shift',
  }
  const modifiers: string[] = []
  for (const part of parts.slice(0, -1)) {
    const modifier = modifierAliases[part.toLowerCase()]
    if (!modifier || modifiers.includes(modifier)) return null
    modifiers.push(modifier)
  }
  if (!modifiers.some((modifier) => modifier !== 'Shift')) return null
  if (modifiers.includes('Ctrl') && modifiers.includes('Cmd')) return null

  const rawKey = parts[parts.length - 1]
  const key = SHORTCUT_KEY_ALIASES[rawKey.toLowerCase()] ?? rawKey
  const validNamedKeys = new Set([
    'Backspace', 'Delete', 'End', 'Enter', 'Escape', 'Home', 'Insert', 'PageDown', 'PageUp',
    'Space', 'Tab', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp',
  ])
  if (!/^[a-z0-9]$/i.test(key) && !/^F(?:[1-9]|1\d|2[0-4])$/i.test(key) && !validNamedKeys.has(key)) {
    return null
  }
  const normalizedKey = /^[a-z]$/i.test(key) || /^F/i.test(key) ? key.toUpperCase() : key
  const orderedModifiers = ['Ctrl', 'Cmd', 'Alt', 'Shift'].filter((modifier) => modifiers.includes(modifier))
  return [...orderedModifiers, normalizedKey].join('+')
}

function normalizeSettings(raw: unknown): UserSettings {
  const rawSettings = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Partial<UserSettings>
    : {}
  const normalized = normalizeUserSettings(rawSettings)
  return {
    ...normalized,
    shortcuts: {
      newAgentSession: normalizeAgentSessionShortcut(rawSettings.shortcuts?.newAgentSession)
        ?? DEFAULT_USER_SETTINGS.shortcuts.newAgentSession,
    },
  }
}

export function getEnabledAgentProviders(): AgentProvider[] {
  const settings = currentSettings
  return (['claude', 'codex'] as const).filter((provider) => settings?.agents[provider].enabled === true)
}

function getAgentHookPath(provider: AgentHookProvider): string {
  return join(getAgentHomeDirectory(provider), provider === 'codex' ? 'hooks.json' : 'settings.json')
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
    const normalized = normalizeSettings({
      ...parsed,
      ...(!Object.prototype.hasOwnProperty.call(parsed, 'agents') ? { agents: {
        claude: { enabled: existsSync(getAgentHomeDirectory('claude')) },
        codex: { enabled: existsSync(getAgentHomeDirectory('codex')) },
      } } : {}),
      language: hasLanguage ? parsed.language : resolveSupportedLanguage(app.getLocale()),
    })
    setMainLanguage(normalized.language)
    currentSettings = normalized

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
      || !Object.prototype.hasOwnProperty.call(parsed, 'agents')
      || parsed?.shortcuts?.newAgentSession !== normalized.shortcuts.newAgentSession
    ) {
      await fs.writeFile(SETTINGS_PATH, JSON.stringify(normalized, null, 2))
    }

    return normalized
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const defaults = normalizeSettings({ language: resolveSupportedLanguage(app.getLocale()) })
      defaults.agents.claude.enabled = existsSync(getAgentHomeDirectory('claude'))
      defaults.agents.codex.enabled = existsSync(getAgentHomeDirectory('codex'))
      currentSettings = defaults
      setMainLanguage(defaults.language)
      await fs.mkdir(YIRA_HOME, { recursive: true })
      await fs.writeFile(SETTINGS_PATH, JSON.stringify(defaults, null, 2))
      return defaults
    }
    return null
  }
}

export function registerSettingsIPC(options: { onSave?: () => void } = {}): void {
  ipcMain.handle('settings:load', async (): Promise<UserSettings | null> => {
    const settings = await loadStoredUserSettings()
    return settings
  })

  ipcMain.handle('settings:save', async (_, settings: UserSettings): Promise<void> => {
    const normalized = normalizeSettings(settings)
    setMainLanguage(normalized.language)
    currentSettings = normalized

    await fs.mkdir(YIRA_HOME, { recursive: true })
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(normalized, null, 2))
    options.onSave?.()
  })

  ipcMain.handle('agentHooks:configure', async (_, provider: AgentHookProvider) => mutateAgentHooks(provider, 'install'))
  ipcMain.handle('agentHooks:uninstall', async (_, provider: AgentHookProvider) => mutateAgentHooks(provider, 'uninstall'))
  ipcMain.handle('claudeStatusLine:status', async (): Promise<ClaudeStatusLineState> => getClaudeStatusLine())
  ipcMain.handle('claudeStatusLine:install', async (): Promise<ClaudeStatusLineMutationResult> => mutateClaudeStatusLine('install'))
  ipcMain.handle('claudeStatusLine:uninstall', async (): Promise<ClaudeStatusLineMutationResult> => mutateClaudeStatusLine('uninstall'))
}
