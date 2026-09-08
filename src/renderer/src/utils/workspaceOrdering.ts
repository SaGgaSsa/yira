import type { WorkspaceMetadata } from '@shared/types'

function getSelectionTimestamp(workspace: WorkspaceMetadata): number | undefined {
  const timestamp = workspace.lastSelectedAt
  if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0) return undefined
  return timestamp
}

/** Order workspaces by pin state and explicit selection recency. */
export function getWorkspaceSidebarOrder(workspaces: readonly WorkspaceMetadata[]): WorkspaceMetadata[] {
  return workspaces
    .map((workspace, index) => ({ workspace, index, timestamp: getSelectionTimestamp(workspace) }))
    .sort((a, b) => {
      const aPinned = a.workspace.pinned === true
      const bPinned = b.workspace.pinned === true
      if (aPinned !== bPinned) return aPinned ? -1 : 1

      if (a.timestamp !== undefined && b.timestamp !== undefined && a.timestamp !== b.timestamp) {
        return a.timestamp > b.timestamp ? -1 : 1
      }
      if (a.timestamp !== undefined && b.timestamp === undefined) return -1
      if (a.timestamp === undefined && b.timestamp !== undefined) return 1

      return a.index - b.index
    })
    .map(({ workspace }) => workspace)
}
