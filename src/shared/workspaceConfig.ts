import type { WorkspaceConfig } from './types'

export function normalizeWorkspaceConfig(config: Partial<WorkspaceConfig> | undefined): WorkspaceConfig {
  const rootFolderPath = config?.rootFolderPath?.trim()
  const initialCommand = config?.initialCommand?.trim()

  return {
    rootFolderPath: rootFolderPath || undefined,
    initialCommand: initialCommand || undefined,
    terminalHistoryEnabled: config?.terminalHistoryEnabled !== false,
  }
}
