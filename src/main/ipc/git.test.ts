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

  assert.match(source, /import type \{[^}]*GitCommitHistoryResult[^}]*\} from '@shared\/types'/s)
  assert.match(source, /import \{[^}]*getGitCommitHistory[^}]*\} from '\.\.\/git\/runner'/s)
  assert.match(
    source,
    /ipcMain\.handle\('git:history', async \(_event, workspaceId: string\): Promise<GitCommitHistoryResult> => \{[\s\S]*?return await getGitCommitHistory\(await getWorkspaceGitRoot\(workspaceId\)\)[\s\S]*?outgoing: \[\],[\s\S]*?upstream: \[\],[\s\S]*?local: \[\],[\s\S]*?error:/,
  )
})

test('exposes git history through the exact restricted preload channel and result type', async () => {
  const source = await readRepositoryFile('src/preload/index.ts')

  assert.match(source, /GitCommitHistoryResult/)
  assert.match(source, /history: \(workspaceId: string\) => ipcRenderer\.invoke\('git:history', workspaceId\) as Promise<GitCommitHistoryResult>/)
})

test('declares the git history bridge for the renderer', async () => {
  const source = await readRepositoryFile('src/renderer/src/electron.d.ts')

  assert.match(source, /GitCommitHistoryResult/)
  assert.match(source, /history: \(workspaceId: string\) => Promise<GitCommitHistoryResult>/)
})
