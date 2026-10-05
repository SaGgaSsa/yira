import {
  createExplorerNode,
  getLoadedExpandedDirectories,
  mergeExplorerDirectoryChildren,
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

const cachedTree = mergeExplorerDirectoryChildren(
  updateExplorerDirectory(createExplorerNode('', 'Workspace', 'directory'), '', {
    status: 'ready',
    children: [
      { ...createExplorerNode('src', 'src', 'directory'), expanded: true, status: 'ready', children: [createExplorerNode('src/a.ts', 'a.ts', 'file')] },
      createExplorerNode('old.txt', 'old.txt', 'file'),
    ],
  }),
  '',
  [createExplorerNode('src', 'src', 'directory'), createExplorerNode('new.txt', 'new.txt', 'file')],
)
const mergedSource = cachedTree.children?.find((child) => child.relativePath === 'src')
if (!mergedSource?.expanded || mergedSource.children?.length !== 1) {
  throw new Error('refreshing a directory must keep expanded subfolders and their loaded children')
}
if (cachedTree.children?.some((child) => child.relativePath === 'old.txt') || !cachedTree.children?.some((child) => child.relativePath === 'new.txt')) {
  throw new Error('refreshing a directory must apply the new listing')
}
if (getLoadedExpandedDirectories(cachedTree).join(',') !== ',src') {
  throw new Error('loaded expanded directories must be listed parents first')
}
