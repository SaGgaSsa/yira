import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

async function readRepositoryFile(relativePath: string): Promise<string> {
  return readFile(resolve(repositoryRoot, relativePath), 'utf8')
}

test('registers a safe git history IPC handler with workspace fallback handling', async () => {
  const source = await readRepositoryFile('src/main/ipc/git.ts')

  assert.match(source, /import type \{[^}]*GitCommitHistoryResult[^}]*GitRepository[^}]*\} from '@shared\/types'/s)
  assert.match(source, /import \{[^}]*getGitCommitHistory[^}]*\} from '\.\.\/git\/runner'/s)
  assert.match(
    source,
    /ipcMain\.handle\('git:history', async \(_event, workspaceId: string, repositoryPath: string\): Promise<GitCommitHistoryResult> => \{[\s\S]*?getGitCommitHistory[\s\S]*?resolveWorkspaceGitRepository[\s\S]*?outgoing: \[\],[\s\S]*?upstream: \[\],[\s\S]*?local: \[\],[\s\S]*?error:/,
  )
})

test('exposes git history through the exact restricted preload channel and result type', async () => {
  const source = await readRepositoryFile('src/preload/index.ts')

  assert.match(source, /GitCommitHistoryResult/)
  assert.match(source, /history: \(workspaceId: string, repositoryPath: string\) => ipcRenderer\.invoke\('git:history', workspaceId, repositoryPath\) as Promise<GitCommitHistoryResult>/)
})

test('declares the git history bridge for the renderer', async () => {
  const source = await readRepositoryFile('src/renderer/src/electron.d.ts')

  assert.match(source, /GitCommitHistoryResult/)
  assert.match(source, /history: \(workspaceId: string, repositoryPath: string\) => Promise<GitCommitHistoryResult>/)
})

test('registers discovery and resolves every Git operation against the configured repository', async () => {
  const source = await readRepositoryFile('src/main/ipc/git.ts')

  assert.match(source, /import type \{[^}]*GitRepository[^}]*\} from '@shared\/types'/s)
  assert.match(source, /import \{[^}]*discoverGitRepositories[^}]*resolveConfiguredGitRepository[^}]*\} from '\.\.\/git\/repositories'/s)
  assert.match(source, /configuredRepositoryPaths: workspaceConfig\.sourceControlRepositoryPaths/)
  assert.match(source, /resolveConfiguredGitRepository\(rootPath, configuredRepositoryPaths, repositoryPath\)/)
  assert.match(
    source,
    /ipcMain\.handle\('git:discoverRepositories', async \(_event, workspaceId: string\): Promise<GitRepository\[\]> => \{[\s\S]*?discoverGitRepositories[\s\S]*?getWorkspaceGitRoot\(workspaceId\)/,
  )

  const expectedHandlers = [
    { channel: 'git:status', call: 'getGitStatus', signature: 'workspaceId: string, repositoryPath: string' },
    { channel: 'git:history', call: 'getGitCommitHistory', signature: 'workspaceId: string, repositoryPath: string' },
    { channel: 'git:stage', call: 'stageGitFiles', signature: 'workspaceId: string, repositoryPath: string, relativePath: string' },
    { channel: 'git:unstage', call: 'unstageGitFiles', signature: 'workspaceId: string, repositoryPath: string, relativePath: string' },
    { channel: 'git:commit', call: 'commitGitChanges', signature: 'workspaceId: string, repositoryPath: string, message: string' },
    { channel: 'git:sync', call: 'syncGitRepository', signature: 'workspaceId: string, repositoryPath: string' },
  ]

  for (const { channel, call, signature } of expectedHandlers) {
    const handlerStart = source.indexOf(`ipcMain.handle('${channel}'`)
    const nextHandler = source.indexOf('\n  ipcMain.handle(', handlerStart + 1)
    const handler = source.slice(handlerStart, nextHandler < 0 ? source.length : nextHandler)
    assert.notEqual(handlerStart, -1, `${channel} handler must be registered`)
    assert.match(handler, new RegExp(`async \\(_event, ${signature}`))
    assert.match(handler, /resolveWorkspaceGitRepository/)
    assert.match(handler, new RegExp(call))
  }
})

test('exposes repository discovery and repository-path Git signatures through the restricted bridge', async () => {
  const preload = await readRepositoryFile('src/preload/index.ts')
  const rendererTypes = await readRepositoryFile('src/renderer/src/electron.d.ts')

  assert.match(preload, /discoverRepositories: \(workspaceId: string\) => ipcRenderer\.invoke\('git:discoverRepositories', workspaceId\) as Promise<GitRepository\[\]>/)
  assert.match(rendererTypes, /discoverRepositories: \(workspaceId: string\) => Promise<GitRepository\[\]>/)

  for (const method of ['status', 'history']) {
    assert.match(preload, new RegExp(`${method}: \\(workspaceId: string, repositoryPath: string\\)`))
    assert.match(rendererTypes, new RegExp(`${method}: \\(workspaceId: string, repositoryPath: string\\)`))
  }
  for (const method of ['stage', 'unstage']) {
    assert.match(preload, new RegExp(`${method}: \\(workspaceId: string, repositoryPath: string, relativePath: string`))
    assert.match(rendererTypes, new RegExp(`${method}: \\(workspaceId: string, repositoryPath: string, relativePath: string`))
  }
  for (const method of ['commit']) {
    assert.match(preload, new RegExp(`${method}: \\(workspaceId: string, repositoryPath: string, message: string\\)`))
    assert.match(rendererTypes, new RegExp(`${method}: \\(workspaceId: string, repositoryPath: string, message: string\\)`))
  }
  assert.match(preload, /sync: \(workspaceId: string, repositoryPath: string\) => ipcRenderer\.invoke\('git:sync', workspaceId, repositoryPath\)/)
  assert.match(rendererTypes, /sync: \(workspaceId: string, repositoryPath: string\) => Promise<void>/)
})
