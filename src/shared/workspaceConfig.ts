import {
  AGENT_PROVIDERS,
  DEFAULT_AGENT_PROVIDERS_CONFIG,
  type AgentProvider,
  type AgentProviderConfig,
  type AgentProvidersConfig,
  type AgentProvidersConfigInput,
  type RemoteTerminalConfig,
  type SourceControlViewMode,
  type WakeOnLanConfig,
  type WorkspaceConfig,
  type WorkspaceConfigInput,
  type WorkspaceCustomScript,
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

const DEFAULT_WAKE_ON_LAN_BROADCAST_ADDRESS = '255.255.255.255'
const DEFAULT_WAKE_ON_LAN_PORT = 9
const WAKE_ON_LAN_MAC_PATTERN = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i
const WAKE_ON_LAN_MAC_HYPHEN_PATTERN = /^(?:[0-9a-f]{2}-){5}[0-9a-f]{2}$/i

function isLiteralIpv4(value: string): boolean {
  const octets = value.split('.')
  return octets.length === 4 && octets.every((octet) => {
    if (!/^(0|[1-9]\d{0,2})$/.test(octet)) return false
    const number = Number(octet)
    return number >= 0 && number <= 255
  })
}

export function normalizeWakeOnLanConfig(value: unknown): WakeOnLanConfig | undefined {
  if (!isRecord(value)) return undefined

  const rawMacAddress = typeof value.macAddress === 'string' ? value.macAddress.trim() : ''
  const validMacAddress = WAKE_ON_LAN_MAC_PATTERN.test(rawMacAddress)
    || WAKE_ON_LAN_MAC_HYPHEN_PATTERN.test(rawMacAddress)
  const macAddress = rawMacAddress.toUpperCase().replace(/-/g, ':')

  const rawBroadcastAddress = value.broadcastAddress
  const broadcastAddress = typeof rawBroadcastAddress === 'string'
    ? rawBroadcastAddress.trim() || undefined
    : undefined
  const validBroadcastAddress = rawBroadcastAddress === undefined
    || typeof rawBroadcastAddress === 'string' && (!broadcastAddress || isLiteralIpv4(broadcastAddress))

  const rawPort = value.port
  const validPort = rawPort === undefined
    || typeof rawPort === 'number' && Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535

  const valid = validMacAddress && validBroadcastAddress && validPort
  const enabled = valid && value.enabled === true
  const normalized: WakeOnLanConfig = {
    enabled,
    macAddress,
  }

  if (enabled) {
    normalized.broadcastAddress = broadcastAddress ?? DEFAULT_WAKE_ON_LAN_BROADCAST_ADDRESS
    normalized.port = rawPort ?? DEFAULT_WAKE_ON_LAN_PORT
    return normalized
  }

  if (validBroadcastAddress && broadcastAddress !== undefined) normalized.broadcastAddress = broadcastAddress
  if (validPort && rawPort !== undefined) normalized.port = rawPort
  return normalized
}

function normalizeRemoteTerminal(value: Partial<RemoteTerminalConfig> | undefined): RemoteTerminalConfig | undefined {
  const host = typeof value?.host === 'string' ? value.host.trim() : undefined
  const user = typeof value?.user === 'string' ? value.user.trim() : undefined
  if (!host || !user || /\s/.test(host) || /\s/.test(user) || host.startsWith('-') || user.startsWith('-')) return undefined

  const port = value?.port
  const wakeOnLan = normalizeWakeOnLanConfig(value?.wakeOnLan)
  return {
    host,
    user,
    ...(typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535 ? { port } : {}),
    ...(wakeOnLan ? { wakeOnLan } : {}),
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

const MAX_CUSTOM_SCRIPTS = 50
const MAX_CUSTOM_SCRIPT_ID_LENGTH = 64
const MAX_CUSTOM_SCRIPT_NAME_LENGTH = 80
const MAX_CUSTOM_SCRIPT_COMMAND_LENGTH = 2000
const CUSTOM_SCRIPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function normalizeCustomScripts(value: unknown): WorkspaceCustomScript[] | undefined {
  if (!Array.isArray(value)) return undefined

  const scripts: WorkspaceCustomScript[] = []
  const seenIds = new Set<string>()

  for (const candidate of value) {
    if (!isRecord(candidate)
      || typeof candidate.id !== 'string'
      || typeof candidate.name !== 'string'
      || typeof candidate.command !== 'string') continue

    const id = candidate.id.trim()
    const name = candidate.name.trim()
    const command = candidate.command.trim()

    if (!CUSTOM_SCRIPT_ID_PATTERN.test(id)
      || id.length > MAX_CUSTOM_SCRIPT_ID_LENGTH
      || !name
      || name.length > MAX_CUSTOM_SCRIPT_NAME_LENGTH
      || name.includes('\u0000')
      || !command
      || command.length > MAX_CUSTOM_SCRIPT_COMMAND_LENGTH
      || /[\u0000\r\n]/.test(command)
      || seenIds.has(id)) continue

    seenIds.add(id)
    scripts.push({ id, name, command })
    if (scripts.length >= MAX_CUSTOM_SCRIPTS) break
  }

  return scripts.length > 0 ? scripts : undefined
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
    customScripts: normalizeCustomScripts(config?.customScripts),
  }
}
