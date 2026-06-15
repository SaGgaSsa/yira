import type {
  Workspace,
  WorkspaceManagementCommitResult,
  WorkspaceManagementEntry,
} from './types'
import { normalizeWorkspaceConfig } from './workspaceConfig'

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
    const config = normalizeWorkspaceConfig({
      rootFolderPath: entry.rootFolderPath,
      initialCommand: entry.initialCommand,
      terminalHistoryEnabled: entry.terminalHistoryEnabled,
    })

    if (entry.id) {
      const existing = existingById.get(entry.id)
      if (!existing) throw new Error('Workspace does not exist')
      if (desiredExistingIds.has(entry.id)) throw new Error('Workspace ids must be unique')

      desiredExistingIds.add(entry.id)

      return {
        ...existing,
        name,
        config,
      }
    }

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
