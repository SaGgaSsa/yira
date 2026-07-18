import { buildSourceControlTree } from './sourceControlTree'

const tree = buildSourceControlTree([
  { path: 'src/main/index.ts', status: 'modified' },
  { path: 'src/shared/types.ts', status: 'added' },
  { path: 'README.md', status: 'deleted' },
])

if (tree.map((node) => node.name).join(',') !== 'README.md,src') {
  throw new Error('source-control tree must group root files and directories by path')
}

const src = tree[1]
if (src?.children?.map((node) => node.name).join(',') !== 'main,shared') {
  throw new Error('source-control tree must sort nested directories')
}

if (src?.children?.[0]?.children?.[0]?.entry?.path !== 'src/main/index.ts') {
  throw new Error('source-control tree must retain the changed file entry at its leaf')
}
