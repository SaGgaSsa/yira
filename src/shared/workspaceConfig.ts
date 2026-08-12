import {
  AGENT_PROVIDERS,
  DEFAULT_AGENT_PROVIDERS_CONFIG,
  type AgentProvider,
  type AgentProviderConfig,
  type AgentProvidersConfig,
  type AgentProvidersConfigInput,
  type RemoteTerminalConfig,
  type SourceControlViewMode,
  type WorkspaceConfig,
  type WorkspaceConfigInput,
  type WorkspaceType,
} from './types'

export function normalizeWorkspaceType(type: unknown): WorkspaceType {
  return type === 'grid' ? 'grid' : 'canvas'
}

export function normalizeSourceControlViewMode(value: unknown): SourceControlViewMode {
  return value === 'tree' ? 'tree' : 'list'
}

export function normalizeWorkspaceAgentProvider(value: unknown): AgentProvider | undefined {
  return value === 'claude' || value === 'codex' ? value : undefined
}

function normalizeRemoteTerminal(value: Partial<RemoteTerminalConfig> | undefined): RemoteTerminalConfig | undefined {
  const host = typeof value?.host === 'string' ? value.host.trim() : undefined
  const user = typeof value?.user === 'string' ? value.user.trim() : undefined
  if (!host || !user || /\s/.test(host) || /\s/.test(user) || host.startsWith('-') || user.startsWith('-')) return undefined

  const port = value?.port
  return {
    host,
    user,
    ...(typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535 ? { port } : {}),
  }
}

export function normalizeWorkspaceRootFolderPath(value: unknown): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : undefined
  return trimmed || undefined
}

export function normalizeSourceControlRepositoryPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const paths: string[] = []

  for (const candidate of value) {
    if (typeof candidate !== 'string') continue

    const trimmed = candidate.trim()
    if (!trimmed || trimmed.startsWith('/') || trimmed.includes('\\') || trimmed.includes('\u0000')) continue
    if (/^[a-zA-Z]:\//.test(trimmed)) continue

    const segments = trimmed.split('/')
    if (segments.some((segment) => segment === '..')) continue

    const normalized = segments.filter((segment) => segment !== '' && segment !== '.').join('/') || '.'
    if (seen.has(normalized)) continue

    seen.add(normalized)
    paths.push(normalized)
  }

  return paths
}

const MAX_AGENT_PROVIDER_ARGS = 32
const MAX_AGENT_PROVIDER_ARG_LENGTH = 256

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeAgentArgs(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .slice(0, MAX_AGENT_PROVIDER_ARGS)
    .flatMap((argument) => {
      if (typeof argument !== 'string' || /[\u0000\r\n]/.test(argument)) return []

      const trimmed = argument.trim()
      if (!trimmed || trimmed.length > MAX_AGENT_PROVIDER_ARG_LENGTH) return []
      return [trimmed]
    })
}

export function normalizeAgentProviderConfig(value: unknown): AgentProviderConfig {
  const config = isRecord(value) ? value : undefined
  return {
    enabled: config?.enabled !== false,
    args: normalizeAgentArgs(config?.args),
  }
}

export function normalizeAgentProvidersConfig(value: AgentProvidersConfigInput | unknown): AgentProvidersConfig {
  const config = isRecord(value) ? value : {}

  return AGENT_PROVIDERS.reduce<AgentProvidersConfig>((providers, provider) => {
    providers[provider] = normalizeAgentProviderConfig(config[provider])
    return providers
  }, {
    claude: { ...DEFAULT_AGENT_PROVIDERS_CONFIG.claude, args: [] },
    codex: { ...DEFAULT_AGENT_PROVIDERS_CONFIG.codex, args: [] },
  })
}

/** Merge a partial edit into an already-normalized provider map. */
export function mergeAgentProvidersConfig(
  current: AgentProvidersConfig,
  patch: AgentProvidersConfigInput | undefined,
): AgentProvidersConfig {
  const next = isRecord(patch) ? patch : {}
  return normalizeAgentProvidersConfig({
    claude: {
      ...current.claude,
      ...(isRecord(next.claude) ? next.claude : {}),
    },
    codex: {
      ...current.codex,
      ...(isRecord(next.codex) ? next.codex : {}),
    },
  })
}

/** Return fresh defaults so a caller cannot mutate the shared migration template. */
export function createDefaultAgentProvidersConfig(): AgentProvidersConfig {
  return normalizeAgentProvidersConfig(DEFAULT_AGENT_PROVIDERS_CONFIG)
}

export function normalizeWorkspaceConfig(config: WorkspaceConfigInput | undefined): WorkspaceConfig {
  const rootFolderPath = normalizeWorkspaceRootFolderPath(config?.rootFolderPath)
  const initialCommand = config?.initialCommand?.trim()

  return {
    type: normalizeWorkspaceType(config?.type),
    rootFolderPath: rootFolderPath || undefined,
    sourceControlRepositoryPaths: normalizeSourceControlRepositoryPaths(config?.sourceControlRepositoryPaths),
    workspacePanelOpen: config?.workspacePanelOpen !== false,
    sourceControlViewMode: normalizeSourceControlViewMode(config?.sourceControlViewMode),
    initialCommand: initialCommand || undefined,
    terminalHistoryEnabled: config?.terminalHistoryEnabled !== false,
    remoteTerminal: normalizeRemoteTerminal(config?.remoteTerminal),
    agentProvider: normalizeWorkspaceAgentProvider(config?.agentProvider),
    agentProviders: normalizeAgentProvidersConfig(config?.agentProviders),
  }
}
