import {
  createExplorerNode,
  toggleExplorerDirectory,
  updateExplorerDirectory,
} from './workspaceExplorerTree'

const root = { ...createExplorerNode('', 'Workspace', 'directory'), expanded: false }
const expanded = toggleExplorerDirectory(root, '')
if (!expanded.expanded || expanded.status !== 'loading') {
  throw new Error('expanding a directory must request its children lazily')
}

const loaded = updateExplorerDirectory(expanded, '', {
  status: 'ready',
  children: [
    createExplorerNode('src', 'src', 'directory'),
    createExplorerNode('README.md', 'README.md', 'file'),
  ],
})
if (loaded.children?.map((node) => node.relativePath).join(',') !== 'src,README.md') {
  throw new Error('a loaded directory must retain its returned children')
}

const nestedExpanded = toggleExplorerDirectory(loaded, 'src')
if (nestedExpanded.children?.[0]?.status !== 'loading') {
  throw new Error('expanding a child directory must load only that branch')
}

const collapsed = toggleExplorerDirectory(nestedExpanded, 'src')
if (collapsed.children?.[0]?.expanded !== false || collapsed.children?.[0]?.status !== 'loading') {
  throw new Error('collapsing a directory must retain its isolated load state')
}

const failed = updateExplorerDirectory(collapsed, 'src', { status: 'error', error: 'Access denied' })
if (failed.children?.[0]?.status !== 'error' || failed.children?.[0]?.error !== 'Access denied') {
  throw new Error('directory load failures must remain isolated to their branch')
}

const retried = toggleExplorerDirectory({ ...failed, children: failed.children?.map((node) => node.relativePath === 'src' ? { ...node, expanded: false } : node) }, 'src')
if (retried.children?.[0]?.status !== 'loading') {
  throw new Error('re-expanding a failed directory must retry only that branch')
}
