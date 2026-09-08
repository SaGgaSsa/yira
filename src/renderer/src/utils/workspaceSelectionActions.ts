import type { WorkspaceMetadata } from '@shared/types'

export type WorkspaceSelectionResultField = 'pinned' | 'lastSelectedAt'

function isValidSelectionTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Merge one selection response without allowing unrelated fields to overwrite local state. */
export function mergeWorkspaceSelectionResult(
  workspaces: readonly WorkspaceMetadata[],
  result: WorkspaceMetadata | null,
  field: WorkspaceSelectionResultField,
): WorkspaceMetadata[] {
  if (!result) return [...workspaces]

  if (field === 'pinned') {
    const pinned = result.pinned
    if (typeof pinned !== 'boolean') return [...workspaces]

    return workspaces.map((workspace) => {
      if (workspace.id !== result.id || workspace.pinned === pinned) return workspace
      return { ...workspace, pinned }
    })
  }

  const lastSelectedAt = result.lastSelectedAt
  if (!isValidSelectionTimestamp(lastSelectedAt)) return [...workspaces]

  return workspaces.map((workspace) => {
    if (workspace.id !== result.id) return workspace

    const currentTimestamp = workspace.lastSelectedAt
    if (isValidSelectionTimestamp(currentTimestamp) && currentTimestamp >= lastSelectedAt) return workspace
    return { ...workspace, lastSelectedAt }
  })
}

/** Apply an optimistic pin state while keeping every other workspace field unchanged. */
export function setWorkspacePinnedOptimistically(
  workspaces: readonly WorkspaceMetadata[],
  workspaceId: string,
  pinned: boolean,
): WorkspaceMetadata[] {
  return workspaces.map((workspace) => (
    workspace.id === workspaceId && workspace.pinned !== pinned
      ? { ...workspace, pinned }
      : workspace
  ))
}
