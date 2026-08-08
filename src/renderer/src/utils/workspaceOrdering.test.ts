import type { WorkspaceMetadata } from '@shared/types'
import { getWorkspaceSidebarOrder } from './workspaceOrdering'

const managerOrder = [
  { id: 'workspace-z', name: 'Zed' },
  { id: 'workspace-a', name: 'Alpha' },
  { id: 'workspace-m', name: 'Middle' },
] as WorkspaceMetadata[]

const sidebarOrder = getWorkspaceSidebarOrder(managerOrder)

if (sidebarOrder.map((workspace) => workspace.id).join(',') !== 'workspace-z,workspace-a,workspace-m') {
  throw new Error('the workspace sidebar must retain Manager-provided order')
}

if (sidebarOrder === managerOrder) {
  throw new Error('the workspace sidebar order helper must return a render-safe copy')
}

if (managerOrder.map((workspace) => workspace.id).join(',') !== 'workspace-z,workspace-a,workspace-m') {
  throw new Error('workspace ordering must not mutate Manager metadata')
}
