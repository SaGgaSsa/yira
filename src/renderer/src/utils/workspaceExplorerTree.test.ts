import {
  createExplorerNode,
  expandExplorerDirectory,
  findExplorerNode,
  getCreateParentPath,
  getLoadedExpandedDirectories,
  hasExplorerSiblingNamed,
  joinRootPath,
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

const dirTarget = { relativePath: 'src/utils', kind: 'directory' as const }
const fileTarget = { relativePath: 'src/utils/a.ts', kind: 'file' as const }
if (getCreateParentPath(null) !== '' || getCreateParentPath(dirTarget) !== 'src/utils' || getCreateParentPath(fileTarget) !== 'src/utils') {
  throw new Error('create target must be the selected folder, the parent of a selected file, or the root')
}
if (getCreateParentPath({ relativePath: 'README.md', kind: 'file' }) !== '') {
  throw new Error('a root-level file must create entries in the root')
}

const siblingTree = updateExplorerDirectory(root, '', {
  status: 'ready',
  children: [createExplorerNode('Src', 'Src', 'directory'), createExplorerNode('a.ts', 'a.ts', 'file')],
})
if (!hasExplorerSiblingNamed(siblingTree, '', 'src') || !hasExplorerSiblingNamed(siblingTree, '', 'SRC/x.ts')) {
  throw new Error('sibling names must collide case-insensitively on the first segment')
}
if (hasExplorerSiblingNamed(siblingTree, '', 'a.ts', 'a.ts') || hasExplorerSiblingNamed(siblingTree, '', 'b.ts')) {
  throw new Error('the renamed entry itself and unknown names must not collide')
}
if (findExplorerNode(siblingTree, 'a.ts')?.name !== 'a.ts' || findExplorerNode(siblingTree, 'zzz') !== null) {
  throw new Error('findExplorerNode must locate loaded nodes only')
}

const collapsedSrc = updateExplorerDirectory(siblingTree, '', {
  status: 'ready',
  children: [createExplorerNode('src', 'src', 'directory')],
})
const expandedSrc = expandExplorerDirectory(collapsedSrc, 'src')
const srcNode = findExplorerNode(expandedSrc, 'src')
if (!srcNode?.expanded || srcNode.status !== 'loading') {
  throw new Error('expanding an unloaded directory must flag it as loading')
}

if (joinRootPath('C:\\repo\\', 'src/a.ts') !== 'C:\\repo\\src\\a.ts' || joinRootPath('/repo', 'src/a.ts') !== '/repo/src/a.ts' || joinRootPath('/repo', '') !== '/repo') {
  throw new Error('absolute paths must use the root path separator')
}
