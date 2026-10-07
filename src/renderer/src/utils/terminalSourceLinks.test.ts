import assert from 'node:assert/strict'
import test from 'node:test'
import { isSourceFilePath } from './fileEditorState'
import {
  absoluteSourcePathToRelative,
  chooseTerminalSourceSearchMatch,
  findTerminalSourceLinks,
  isTerminalFileLinkPath,
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

test('links readable text files and images but leaves Markdown and unknown files out', () => {
  assert.equal(isTerminalFileLinkPath('src/App.tsx'), true)
  assert.equal(isTerminalFileLinkPath('notes.txt'), true)
  assert.equal(isTerminalFileLinkPath('logs/app.log'), true)
  assert.equal(isTerminalFileLinkPath('assets/logo.PNG'), true)
  assert.equal(isTerminalFileLinkPath('README.md'), false)
  assert.equal(isTerminalFileLinkPath('release/app.exe'), false)
})

test('strips agent tool calls, Markdown links, and mentions around paths', () => {
  const text = String.raw`Read(src\main\a.ts) Update(src/b.ts:4) [c.ts](src/c.ts) @src/d.png src/foo/Baz.java(8,2)`
  assert.deepEqual(findTerminalSourceLinks(text).map(({ path, text: linkText }) => ({ path, linkText })), [
    { path: String.raw`src\main\a.ts`, linkText: String.raw`src\main\a.ts` },
    { path: 'src/b.ts', linkText: 'src/b.ts:4' },
    { path: 'src/c.ts', linkText: 'src/c.ts' },
    { path: 'src/d.png', linkText: 'src/d.png' },
    { path: 'src/foo/Baz.java', linkText: 'src/foo/Baz.java(8,2)' },
  ])
})

test('keeps paths relative when there is no base directory', () => {
  assert.equal(resolveTerminalSourcePath('src/main/a.ts'), 'src/main/a.ts')
  assert.equal(resolveTerminalSourcePath('src/main/a.ts', ''), 'src/main/a.ts')
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
