import type { WorkspaceConfig, WorkspaceType } from './types'

export function normalizeWorkspaceType(type: unknown): WorkspaceType {
  return type === 'grid' ? 'grid' : 'canvas'
}

export function normalizeWorkspaceConfig(config: Partial<WorkspaceConfig> | undefined): WorkspaceConfig {
  const rootFolderPath = config?.rootFolderPath?.trim()
  const initialCommand = config?.initialCommand?.trim()

  return {
    type: normalizeWorkspaceType(config?.type),
    rootFolderPath: rootFolderPath || undefined,
    initialCommand: initialCommand || undefined,
    terminalHistoryEnabled: config?.terminalHistoryEnabled !== false,
  }
}
