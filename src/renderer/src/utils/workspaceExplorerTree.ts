import type { FileEntryKind } from '@shared/types'

export type ExplorerNodeStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ExplorerNode {
  relativePath: string
  name: string
  kind: FileEntryKind
  expanded: boolean
  status: ExplorerNodeStatus
  error?: string
  children?: ExplorerNode[]
}

export function createExplorerNode(relativePath: string, name: string, kind: FileEntryKind): ExplorerNode {
  return {
    relativePath,
    name,
    kind,
    expanded: kind === 'directory' && relativePath === '',
    status: 'idle',
  }
}

function updateNode(node: ExplorerNode, relativePath: string, update: (node: ExplorerNode) => ExplorerNode): ExplorerNode {
  if (node.relativePath === relativePath) return update(node)
  if (!node.children) return node

  return {
    ...node,
    children: node.children.map((child) => updateNode(child, relativePath, update)),
  }
}

export function toggleExplorerDirectory(root: ExplorerNode, relativePath: string): ExplorerNode {
  return updateNode(root, relativePath, (node) => {
    if (node.kind !== 'directory') return node
    if (node.expanded) return { ...node, expanded: false }

    return {
      ...node,
      expanded: true,
      status: node.status === 'ready' ? 'ready' : 'loading',
      error: undefined,
    }
  })
}

export function updateExplorerDirectory(
  root: ExplorerNode,
  relativePath: string,
  update: Pick<ExplorerNode, 'status' | 'children' | 'error'>,
): ExplorerNode {
  return updateNode(root, relativePath, (node) => ({ ...node, ...update }))
}
