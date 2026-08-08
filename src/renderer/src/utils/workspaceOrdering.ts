import type { WorkspaceMetadata } from '@shared/types'

/** Keep the order supplied by Workspace Manager for sidebar rendering. */
export function getWorkspaceSidebarOrder(workspaces: readonly WorkspaceMetadata[]): WorkspaceMetadata[] {
  return [...workspaces]
}
