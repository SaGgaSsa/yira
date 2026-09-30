import assert from 'node:assert/strict'
import test from 'node:test'
import { isSourceFilePath } from './fileEditorState'
import {
  absoluteSourcePathToRelative,
  chooseTerminalSourceSearchMatch,
  findTerminalSourceLinks,
  resolveTerminalSourcePath,
} from './terminalSourceLinks'

test('uses Monaco language support to distinguish source files from Markdown and plaintext', () => {
  assert.equal(isSourceFilePath('Dockerfile'), true)
  assert.equal(isSourceFilePath('src/App.tsx'), true)
  assert.equal(isSourceFilePath('README.md'), false)
  assert.equal(isSourceFilePath('notes.txt'), false)
})

test('detects source paths with line, column, range, parenthesized, and hash suffixes', () => {
  const text = 'SIAzureStorageImagen.java:127-129 src/foo/Bar.java:42 src/foo/Bar.java:42:7 src/foo/Baz.java(8,2) src/Qux.ts#L10 C:\\repo\\Bar.java:10 Dockerfile https://host/Foo.java:10 ./https://host/Foo.java'
  assert.deepEqual(findTerminalSourceLinks(text).map(({ path, line, column, endLine }) => ({ path, line, column, endLine })), [
    { path: 'SIAzureStorageImagen.java', line: 127, column: undefined, endLine: 129 },
    { path: 'src/foo/Bar.java', line: 42, column: undefined, endLine: undefined },
    { path: 'src/foo/Bar.java', line: 42, column: 7, endLine: undefined },
    { path: 'src/foo/Baz.java', line: 8, column: 2, endLine: undefined },
    { path: 'src/Qux.ts', line: 10, column: undefined, endLine: undefined },
    { path: 'C:\\repo\\Bar.java', line: 10, column: undefined, endLine: undefined },
    { path: 'Dockerfile', line: undefined, column: undefined, endLine: undefined },
  ])
})

test('normalizes safe relative paths and rejects escapes, roots, UNC, and protocols', () => {
  assert.equal(resolveTerminalSourcePath('src/../Bar.java', 'packages/app'), 'packages/app/Bar.java')
  assert.equal(resolveTerminalSourcePath('../Bar.java', 'packages/app'), 'packages/Bar.java')
  for (const unsafe of ['../../../Bar.java', '/Bar.java', String.raw`\\server\share\Bar.java`, 'https://host/Bar.java', 'C:/Bar.java']) {
    assert.equal(resolveTerminalSourcePath(unsafe, 'packages/app'), null, unsafe)
  }
})

test('converts absolute paths only when they remain inside the workspace', () => {
  assert.equal(absoluteSourcePathToRelative(String.raw`C:\repo`, String.raw`c:\REPO\src\Bar.java`), 'src/Bar.java')
  assert.equal(absoluteSourcePathToRelative('/repo', '/repo/src/Bar.java'), 'src/Bar.java')
  assert.equal(absoluteSourcePathToRelative('/repo', '/repository/Bar.java'), null)
})

test('chooses an exact basename match under the agent base directory, then the shortest path', () => {
  const entries = [
    { name: 'Foo.java', relativePath: 'other/deep/Foo.java' },
    { name: 'Foo.java', relativePath: 'agent/Foo.java' },
    { name: 'Foo.java', relativePath: 'agent/nested/Foo.java' },
    { name: 'Foo.java.txt', relativePath: 'agent/Foo.java.txt' },
  ]
  assert.equal(chooseTerminalSourceSearchMatch(entries, 'foo.JAVA', 'agent'), 'agent/Foo.java')
  assert.equal(chooseTerminalSourceSearchMatch(entries, 'missing.java', 'agent'), null)
})
