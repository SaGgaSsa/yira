import type {
  Workspace,
  WorkspaceManagementCommitResult,
  WorkspaceManagementEntry,
  WorkspaceType,
} from './types'
import {
  mergeAgentProvidersConfig,
  normalizeWorkspaceConfig,
  normalizeWorkspaceRootFolderPath,
} from './workspaceConfig'
import { normalizeWorkspaceSelectionMetadata } from './workspaceSelection'

interface ApplyWorkspaceManagementChangesInput {
  existingWorkspaces: Workspace[]
  activeWorkspaceId: string
  desiredWorkspaces: WorkspaceManagementEntry[]
  nextWorkspaceId: () => string
  internalWorkspacePath: (id: string) => string
}

function normalizeName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Workspace name cannot be empty')
  return trimmed
}

function validateUniqueNames(workspaces: WorkspaceManagementEntry[]): void {
  const seen = new Set<string>()

  for (const workspace of workspaces) {
    const key = normalizeName(workspace.name).toLocaleLowerCase()
    if (seen.has(key)) throw new Error('Workspace names must be unique')
    seen.add(key)
  }
}

function validateUniqueRootFolders(workspaces: WorkspaceManagementEntry[]): void {
  const seen = new Set<string>()

  for (const workspace of workspaces) {
    const rootFolderPath = workspace.rootFolderPath?.trim()
    if (!rootFolderPath) continue

    if (seen.has(rootFolderPath)) throw new Error('Workspace root folders must be unique')
    seen.add(rootFolderPath)
  }
}

function normalizeWorkspaceMetadata(workspace: Workspace): Workspace {
  const { pinned: _pinned, lastSelectedAt: _lastSelectedAt, ...base } = workspace
  return {
    ...base,
    ...normalizeWorkspaceSelectionMetadata(workspace),
  }
}

export function applyWorkspaceManagementChanges({
  existingWorkspaces,
  activeWorkspaceId,
  desiredWorkspaces,
  nextWorkspaceId,
  internalWorkspacePath,
}: ApplyWorkspaceManagementChangesInput): WorkspaceManagementCommitResult {
  validateUniqueNames(desiredWorkspaces)
  validateUniqueRootFolders(desiredWorkspaces)

  const existingById = new Map(existingWorkspaces.map((workspace) => [workspace.id, workspace]))
  const desiredExistingIds = new Set<string>()
  const createdWorkspaceIds: string[] = []

  const workspaces = desiredWorkspaces.map((entry) => {
    const name = normalizeName(entry.name)

    if (entry.id) {
      const existing = existingById.get(entry.id)
      if (!existing) throw new Error('Workspace does not exist')
      if (desiredExistingIds.has(entry.id)) throw new Error('Workspace ids must be unique')

      desiredExistingIds.add(entry.id)
      const rootFolderPathChanged = normalizeWorkspaceRootFolderPath(entry.rootFolderPath)
        !== normalizeWorkspaceRootFolderPath(existing.config.rootFolderPath)
      const hasRepositoryPathsPatch = Object.prototype.hasOwnProperty.call(entry, 'sourceControlRepositoryPaths')
      const config = normalizeWorkspaceConfig({
        type: existing.config.type,
        rootFolderPath: entry.rootFolderPath,
        sourceControlRepositoryPaths: hasRepositoryPathsPatch
          ? entry.sourceControlRepositoryPaths
          : rootFolderPathChanged ? [] : existing.config.sourceControlRepositoryPaths,
        workspacePanelOpen: entry.workspacePanelOpen ?? existing.config.workspacePanelOpen,
        sourceControlViewMode: entry.sourceControlViewMode ?? existing.config.sourceControlViewMode,
        initialCommand: entry.initialCommand,
        terminalHistoryEnabled: entry.terminalHistoryEnabled,
        remoteTerminal: entry.remoteTerminal,
        agentProvider: entry.agentProvider,
        agentProviders: mergeAgentProvidersConfig(existing.config.agentProviders, entry.agentProviders),
      })

      return {
        ...normalizeWorkspaceMetadata(existing),
        name,
        config,
      }
    }

    const config = normalizeWorkspaceConfig({
      type: entry.type,
      rootFolderPath: entry.rootFolderPath,
      sourceControlRepositoryPaths: entry.sourceControlRepositoryPaths,
      workspacePanelOpen: entry.workspacePanelOpen,
      sourceControlViewMode: entry.sourceControlViewMode,
      initialCommand: entry.initialCommand,
      terminalHistoryEnabled: entry.terminalHistoryEnabled,
      remoteTerminal: entry.remoteTerminal,
      agentProvider: entry.agentProvider,
      agentProviders: entry.agentProviders,
    })

    let id = nextWorkspaceId()
    while (existingById.has(id) || desiredExistingIds.has(id) || createdWorkspaceIds.includes(id)) {
      id = nextWorkspaceId()
    }

    createdWorkspaceIds.push(id)

    return {
      id,
      name,
      path: internalWorkspacePath(id),
      config,
    }
  })

  const nextIds = new Set(workspaces.map((workspace) => workspace.id))
  const removedWorkspaceIds = existingWorkspaces
    .filter((workspace) => !nextIds.has(workspace.id))
    .map((workspace) => workspace.id)
  const nextActiveWorkspaceId = workspaces.some((workspace) => workspace.id === activeWorkspaceId)
    ? activeWorkspaceId
    : workspaces[0]?.id ?? ''

  return {
    workspaces,
    activeWorkspaceId: nextActiveWorkspaceId,
    activeWorkspace: workspaces.find((workspace) => workspace.id === nextActiveWorkspaceId) ?? null,
    createdWorkspaceIds,
    removedWorkspaceIds,
  }
}

export function setWorkspaceType(
  workspaces: Workspace[],
  workspaceId: string,
  type: WorkspaceType,
): Workspace[] | null {
  let found = false
  const nextWorkspaces = workspaces.map((workspace) => {
    if (workspace.id !== workspaceId) return workspace

    found = true
    const normalizedWorkspace = normalizeWorkspaceMetadata(workspace)
    return {
      ...normalizedWorkspace,
      config: normalizeWorkspaceConfig({
        ...normalizedWorkspace.config,
        type,
      }),
    }
  })

  return found ? nextWorkspaces : null
}
