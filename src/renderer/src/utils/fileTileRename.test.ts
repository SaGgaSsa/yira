import assert from 'node:assert/strict'
import { planFileTileClosures, planFileTileRenames } from './fileTileRename'
import type { TileState } from '@shared/types'

function fileTile(id: string, filePath: string, overrides: Partial<TileState> = {}): TileState {
  return { id, type: 'files', x: 0, y: 0, width: 100, height: 100, zIndex: 1, filePath, label: filePath, ...overrides }
}

const exact = planFileTileRenames([fileTile('a', 'src/hola.ts')], 'src/hola.ts', 'src/chau.ts')
assert.deepEqual(exact, [{ tileId: 'a', patch: { filePath: 'src/chau.ts', label: 'chau.ts' } }])

const caseOnly = planFileTileRenames([fileTile('a', 'src/chau.ts')], 'src/chau.ts', 'src/Chau.ts')
assert.deepEqual(caseOnly, [{ tileId: 'a', patch: { filePath: 'src/Chau.ts', label: 'Chau.ts' } }])

const folder = planFileTileRenames([
  fileTile('child', 'src/a/b.ts'),
  fileTile('sibling', 'src2/b.ts'),
  fileTile('prefix', 'srcfile.ts'),
  fileTile('other', 'lib/b.ts'),
], 'src', 'source')
assert.deepEqual(folder, [{ tileId: 'child', patch: { filePath: 'source/a/b.ts', label: 'b.ts' } }])

const nonFile = planFileTileRenames([{ ...fileTile('t', 'src/x.ts'), type: 'terminal' }], 'src/x.ts', 'src/y.ts')
assert.deepEqual(nonFile, [])

const diff = planFileTileRenames(
  [fileTile('d', 'src/x.ts', { fileDiff: { repositoryPath: '.', path: 'src/x.ts', staged: false } })],
  'src/x.ts',
  'src/y.ts',
  () => ' (Working tree)',
)
assert.deepEqual(diff[0].patch.label, 'y.ts (Working tree)')

const closures = planFileTileClosures([
  fileTile('clean', 'src/a.ts'),
  fileTile('dirty', 'src/b.ts', { fileDraft: 'unsaved' }),
  fileTile('exact', 'src'),
  fileTile('similar', 'src2/a.ts'),
  fileTile('elsewhere', 'lib/a.ts'),
], 'src')
assert.deepEqual(closures, ['clean', 'exact'])
assert.deepEqual(planFileTileClosures([fileTile('f', 'a/Hola.ts')], 'a/hola.ts'), [])
