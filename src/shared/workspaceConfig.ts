import type { RemoteTerminalConfig, SourceControlViewMode, WorkspaceConfig, WorkspaceType } from './types'

export function normalizeWorkspaceType(type: unknown): WorkspaceType {
  return type === 'grid' ? 'grid' : 'canvas'
}

export function normalizeSourceControlViewMode(value: unknown): SourceControlViewMode {
  return value === 'tree' ? 'tree' : 'list'
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

export function normalizeWorkspaceConfig(config: Partial<WorkspaceConfig> | undefined): WorkspaceConfig {
  const rootFolderPath = config?.rootFolderPath?.trim()
  const initialCommand = config?.initialCommand?.trim()

  return {
    type: normalizeWorkspaceType(config?.type),
    rootFolderPath: rootFolderPath || undefined,
    workspacePanelOpen: config?.workspacePanelOpen !== false,
    sourceControlViewMode: normalizeSourceControlViewMode(config?.sourceControlViewMode),
    initialCommand: initialCommand || undefined,
    terminalHistoryEnabled: config?.terminalHistoryEnabled !== false,
    remoteTerminal: normalizeRemoteTerminal(config?.remoteTerminal),
  }
}
