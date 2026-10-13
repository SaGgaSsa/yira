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

/**
 * Replace a directory's children with a fresh listing while keeping the
 * expanded state and loaded children of entries that still exist.
 */
export function mergeExplorerDirectoryChildren(
  root: ExplorerNode,
  relativePath: string,
  entries: ExplorerNode[],
): ExplorerNode {
  return updateNode(root, relativePath, (node) => {
    const previous = new Map((node.children ?? []).map((child) => [child.relativePath, child]))
    return {
      ...node,
      status: 'ready',
      error: undefined,
      children: entries.map((entry) => {
        const existing = previous.get(entry.relativePath)
        return existing && existing.kind === entry.kind ? { ...existing, name: entry.name } : entry
      }),
    }
  })
}

/** Relative paths of expanded directories whose children are loaded, parents first. */
export function getLoadedExpandedDirectories(root: ExplorerNode): string[] {
  const paths: string[] = []
  const visit = (node: ExplorerNode) => {
    if (node.kind !== 'directory' || !node.expanded || node.status !== 'ready') return
    paths.push(node.relativePath)
    node.children?.forEach(visit)
  }
  visit(root)
  return paths
}

export function findExplorerNode(root: ExplorerNode, relativePath: string): ExplorerNode | null {
  if (root.relativePath === relativePath) return root
  for (const child of root.children ?? []) {
    const found = findExplorerNode(child, relativePath)
    if (found) return found
  }
  return null
}

/** Parent directory of a '/'-separated relative path; '' is the workspace root. */
export function getParentRelativePath(relativePath: string): string {
  const index = relativePath.lastIndexOf('/')
  return index === -1 ? '' : relativePath.slice(0, index)
}

/** Directory where "new file/folder" creates its entry for the given target. */
export function getCreateParentPath(target: Pick<ExplorerNode, 'relativePath' | 'kind'> | null): string {
  if (!target) return ''
  return target.kind === 'directory' ? target.relativePath : getParentRelativePath(target.relativePath)
}

/** Mark a directory as expanded, flagging it as loading when its children are not loaded yet. */
export function expandExplorerDirectory(root: ExplorerNode, relativePath: string): ExplorerNode {
  return updateNode(root, relativePath, (node) => {
    if (node.kind !== 'directory' || node.expanded) return node
    return { ...node, expanded: true, status: node.status === 'ready' ? 'ready' : 'loading', error: undefined }
  })
}

/**
 * Whether a typed name collides (case-insensitively) with a loaded sibling.
 * Nested names such as 'a/b.ts' only collide on their first segment.
 */
export function hasExplorerSiblingNamed(
  root: ExplorerNode,
  parentRelativePath: string,
  name: string,
  ignoreRelativePath?: string,
): boolean {
  const firstSegment = name.split('/')[0].toLowerCase()
  if (!firstSegment) return false
  const parent = findExplorerNode(root, parentRelativePath)
  return (parent?.children ?? []).some((child) => (
    child.relativePath !== ignoreRelativePath && child.name.toLowerCase() === firstSegment
  ))
}

/** Absolute path of a workspace entry, using the separator style of the root path. */
export function joinRootPath(rootPath: string, relativePath: string): string {
  const separator = rootPath.includes('\\') ? '\\' : '/'
  const base = rootPath.replace(/[\\/]+$/, '')
  return relativePath ? `${base}${separator}${relativePath.split('/').join(separator)}` : base
}
