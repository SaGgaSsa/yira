import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

import {
  AGENT_PROVIDER_COMMANDS,
  AGENT_PROVIDERS,
  CLAUDE_PERMISSION_MODES,
  CODEX_SANDBOX_MODES,
  type AgentSessionLaunchOverrides,
  type AgentProvider,
  type AgentProviderAvailabilitySnapshot,
  type AgentProviderConfig,
} from '@shared/types'
import { normalizeAgentProviderConfig } from '@shared/workspaceConfig'

export const MAX_RESUME_ID_LENGTH = 256

export interface AgentCommand {
  provider: AgentProvider
  command: string
  args: string[]
}

export interface InstalledCommandOptions {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}

export interface AgentProviderAdapter {
  readonly provider: AgentProvider
  readonly command: string
  buildCommand(config: unknown, resumeId?: unknown): AgentCommand
  transcriptRoot(homeDirectory?: string): string
  isAvailable(options?: InstalledCommandOptions): Promise<boolean>
}

/**
 * Session identifiers are values, never paths or shell snippets. The same
 * validation is used by launch and history-resume callers.
 */
export function normalizeResumeId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > MAX_RESUME_ID_LENGTH) return null
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized) ? normalized : null
}

export function isValidResumeId(value: unknown): value is string {
  return normalizeResumeId(value) !== null
}

export function getAgentHomeDirectory(provider: AgentProvider, homeDirectory = homedir()): string {
  return provider === 'claude'
    ? process.env.CLAUDE_CONFIG_DIR || join(homeDirectory, '.claude')
    : process.env.CODEX_HOME || join(homeDirectory, '.codex')
}

function providerRoot(provider: AgentProvider, homeDirectory: string): string {
  return join(getAgentHomeDirectory(provider, homeDirectory), provider === 'claude' ? 'projects' : 'sessions')
}

function pathEntries(command: string, options: InstalledCommandOptions): string[] {
  const env = options.env ?? process.env
  const pathValue = env.PATH ?? env.Path ?? ''
  if (!pathValue) return []

  const entries = pathValue.split(delimiter).filter(Boolean)
  if (options.platform !== 'win32') return entries.map((entry) => join(entry, command))

  const extensions = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  const candidates = [command, ...extensions.map((extension) => `${command}${extension.toLowerCase()}`)]
  return entries.flatMap((entry) => candidates.map((candidate) => join(entry, candidate)))
}

/**
 * Locate an executable by inspecting PATH. This deliberately never invokes
 * the provider (or a shell); availability is a filesystem fact only.
 */
export async function detectInstalledCommand(
  command: string,
  options: InstalledCommandOptions = {},
): Promise<boolean> {
  if (!/^[A-Za-z0-9._-]+$/.test(command)) return false
  const accessMode = options.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK
  for (const candidate of pathEntries(command, options)) {
    try {
      await fs.access(candidate, accessMode)
      const stats = await fs.stat(candidate)
      if (stats.isFile()) return true
    } catch {
      // Continue through PATH entries. A missing or non-executable candidate
      // is not an error for provider availability.
    }
  }
  return false
}

function buildFixedProviderCommand(
  provider: AgentProvider,
  configValue: unknown,
  resumeValue?: unknown,
): AgentCommand {
  const config = normalizeAgentProviderConfig(configValue)
  const args = [...config.args]
  const resumeId = resumeValue === undefined ? undefined : normalizeResumeId(resumeValue)
  if (resumeValue !== undefined && !resumeId) throw new Error('Invalid agent resume id')

  // Claude's documented resume option is a flag; Codex uses the `resume`
  // subcommand. Configured args stay data-only and are never shell-joined.
  if (resumeId) {
    if (provider === 'claude') args.push('--resume', resumeId)
    else args.push('resume', resumeId)
  }

  return {
    provider,
    command: AGENT_PROVIDER_COMMANDS[provider],
    args,
  }
}

class FixedAgentProviderAdapter implements AgentProviderAdapter {
  readonly command: string

  constructor(readonly provider: AgentProvider) {
    this.command = AGENT_PROVIDER_COMMANDS[provider]
  }

  buildCommand(config: unknown, resumeId?: unknown): AgentCommand {
    return buildFixedProviderCommand(this.provider, config, resumeId)
  }

  transcriptRoot(homeDirectory = homedir()): string {
    return providerRoot(this.provider, homeDirectory)
  }

  isAvailable(options: InstalledCommandOptions = {}): Promise<boolean> {
    return detectInstalledCommand(this.command, options)
  }
}

const ADAPTERS: Readonly<Record<AgentProvider, AgentProviderAdapter>> = {
  claude: new FixedAgentProviderAdapter('claude'),
  codex: new FixedAgentProviderAdapter('codex'),
}

export function getAgentProviderAdapter(provider: AgentProvider): AgentProviderAdapter {
  return ADAPTERS[provider]
}

export function buildAgentCommand(
  provider: AgentProvider,
  config: AgentProviderConfig | unknown,
  resumeId?: unknown,
): AgentCommand {
  return getAgentProviderAdapter(provider).buildCommand(config, resumeId)
}

export function buildAgentOverrideArgs(
  provider: AgentProvider,
  overrides?: AgentSessionLaunchOverrides,
): string[] {
  if (provider !== 'claude' && provider !== 'codex') throw new Error('Invalid agent provider')
  if (!overrides) return []

  const args: string[] = []
  if (overrides.model !== undefined) {
    if (typeof overrides.model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/\[\]-]{0,99}$/.test(overrides.model)) {
      throw new Error('Invalid agent model override')
    }
    args.push('--model', overrides.model)
  }

  if (overrides.permissionMode === undefined) return args
  if (provider === 'claude') {
    if (!(CLAUDE_PERMISSION_MODES as readonly string[]).includes(overrides.permissionMode)) {
      throw new Error('Invalid Claude permission mode')
    }
    if (overrides.permissionMode !== 'default') args.push('--permission-mode', overrides.permissionMode)
  } else if (provider === 'codex') {
    if (!(CODEX_SANDBOX_MODES as readonly string[]).includes(overrides.permissionMode)) {
      throw new Error('Invalid Codex sandbox mode')
    }
    args.push('--sandbox', overrides.permissionMode)
  } else {
    throw new Error('Invalid agent provider')
  }

  return args
}

export async function detectInstalledAgentProviders(
  options: InstalledCommandOptions = {},
): Promise<Record<AgentProvider, boolean>> {
  const entries = await Promise.all(AGENT_PROVIDERS.map(async (provider) => [
    provider,
    await getAgentProviderAdapter(provider).isAvailable(options),
  ] as const))
  return Object.fromEntries(entries) as Record<AgentProvider, boolean>
}

export async function getAgentProviderAvailability(
  configs?: Partial<Record<AgentProvider, unknown>>,
  options: InstalledCommandOptions = {},
): Promise<AgentProviderAvailabilitySnapshot> {
  const installed = await detectInstalledAgentProviders(options)
  return Object.fromEntries(AGENT_PROVIDERS.map((provider) => [provider, {
    provider,
    command: AGENT_PROVIDER_COMMANDS[provider],
    configured: normalizeAgentProviderConfig(configs?.[provider]).enabled,
    available: installed[provider],
  }])) as AgentProviderAvailabilitySnapshot
}

export function getAgentProviderTranscriptRoot(provider: AgentProvider, homeDirectory = homedir()): string {
  return getAgentProviderAdapter(provider).transcriptRoot(homeDirectory)
}

// Stable aliases for callers that use the provider/adapter terminology in
// their integration layer.
export const buildProviderCommand = buildAgentCommand
export const detectProviderAvailability = detectInstalledAgentProviders
export const normalizeAgentResumeId = normalizeResumeId
export const validateResumeId = normalizeResumeId
export const claudeAgentAdapter = ADAPTERS.claude
export const codexAgentAdapter = ADAPTERS.codex
