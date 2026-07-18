export interface SourceControlTreeNode<T extends { path: string }> {
  name: string
  path: string
  entry?: T
  children?: SourceControlTreeNode<T>[]
}

interface MutableSourceControlTreeNode<T extends { path: string }> extends SourceControlTreeNode<T> {
  children: MutableSourceControlTreeNode<T>[]
}

function sortNodes<T extends { path: string }>(nodes: MutableSourceControlTreeNode<T>[]): SourceControlTreeNode<T>[] {
  return nodes
    .sort((a, b) => {
      if (Boolean(a.entry) !== Boolean(b.entry)) return a.entry ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })
    .map((node) => ({
      ...node,
      children: node.children.length > 0 ? sortNodes(node.children) : undefined,
    }))
}

export function buildSourceControlTree<T extends { path: string }>(entries: T[]): SourceControlTreeNode<T>[] {
  const root: MutableSourceControlTreeNode<T>[] = []

  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean)
    if (parts.length === 0) continue

    let nodes = root
    let path = ''
    for (const [index, name] of parts.entries()) {
      path = path ? `${path}/${name}` : name
      let node = nodes.find((candidate) => candidate.name === name)
      if (!node) {
        node = { name, path, children: [] }
        nodes.push(node)
      }
      if (index === parts.length - 1) node.entry = entry
      nodes = node.children
    }
  }

  return sortNodes(root)
}
