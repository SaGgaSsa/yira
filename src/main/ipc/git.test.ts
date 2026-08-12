import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { GitCommitHistoryResult, GitRepository, GitStatusResult } from '@shared/types'

type Handler = (event: unknown, ...args: unknown[]) => unknown

class FakeIpcMain {
  readonly handlers = new Map<string, Handler>()

  handle(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler)
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
    return handler({}, ...args)
  }
}

interface LoadedGitIPC {
  createGitIPCHandlers: typeof import('./git').createGitIPCHandlers
  registerGitIPC: typeof import('./git').registerGitIPC
}

function loadGitIPC(ipcMain: FakeIpcMain): LoadedGitIPC {
  const nodeRequire = createRequire(import.meta.url)
  const nodeModule = nodeRequire('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
  }
  const originalLoad = nodeModule._load
  nodeModule._load = function(request, parent, isMain) {
    if (request === 'electron') return { ipcMain }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    return nodeRequire('./git.ts') as LoadedGitIPC
  } finally {
    nodeModule._load = originalLoad
  }
}

function statusResult(): GitStatusResult {
  return { isRepository: true, branch: 'main', ahead: 0, behind: 0, staged: [], unstaged: [] }
}

function historyResult(): GitCommitHistoryResult {
  return { outgoing: [], upstream: [], local: [] }
}

test('registers and invokes discovery through the Git IPC boundary', async () => {
  const ipcMain = new FakeIpcMain()
  const { createGitIPCHandlers } = loadGitIPC(ipcMain)
  const roots: unknown[] = []
  const handlers = createGitIPCHandlers({
    getWorkspaceGitConfigById: async (workspaceId) => {
      assert.equal(workspaceId, 'workspace-a')
      return { rootFolderPath: '/workspace', sourceControlRepositoryPaths: ['.', 'packages/web'] }
    },
    discoverGitRepositories: async (rootPath) => {
      roots.push(rootPath)
      return [{ relativePath: '.', name: 'workspace' }, { relativePath: 'packages/web', name: 'web' }]
    },
    resolveConfiguredGitRepository: async () => ({ absolutePath: '/workspace', relativePath: '.', repository: { relativePath: '.', name: 'workspace' } }),
    getGitStatus: async () => statusResult(),
    getGitCommitHistory: async () => historyResult(),
    stageGitFiles: async () => undefined,
    unstageGitFiles: async () => undefined,
    commitGitChanges: async () => undefined,
    syncGitRepository: async () => undefined,
  })
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler)

  assert.deepEqual(await ipcMain.invoke('git:discoverRepositories', 'workspace-a'), [
    { relativePath: '.', name: 'workspace' },
    { relativePath: 'packages/web', name: 'web' },
  ])
  assert.deepEqual(roots, ['/workspace'])
})

test('resolves the configured repository before status, history, and mutations', async () => {
  const ipcMain = new FakeIpcMain()
  const { createGitIPCHandlers } = loadGitIPC(ipcMain)
  const resolveCalls: Array<{ rootPath: unknown; configuredPaths: unknown; requestedPath: unknown }> = []
  const runnerCalls: string[] = []
  const handlers = createGitIPCHandlers({
    getWorkspaceGitConfigById: async (workspaceId) => {
      assert.equal(workspaceId, 'workspace-a')
      return { rootFolderPath: '/workspace', sourceControlRepositoryPaths: ['packages/web'] }
    },
    discoverGitRepositories: async () => [],
    resolveConfiguredGitRepository: async (rootPath, configuredPaths, requestedPath) => {
      resolveCalls.push({ rootPath, configuredPaths, requestedPath })
      return { absolutePath: '/workspace/packages/web', relativePath: 'packages/web', repository: { relativePath: 'packages/web', name: 'web' } }
    },
    getGitStatus: async (rootPath) => { runnerCalls.push(`status:${rootPath}`); return statusResult() },
    getGitCommitHistory: async (rootPath) => { runnerCalls.push(`history:${rootPath}`); return historyResult() },
    stageGitFiles: async (rootPath, paths) => { runnerCalls.push(`stage:${rootPath}:${paths.join(',')}`) },
    unstageGitFiles: async (rootPath, paths) => { runnerCalls.push(`unstage:${rootPath}:${paths.join(',')}`) },
    commitGitChanges: async (rootPath, message) => { runnerCalls.push(`commit:${rootPath}:${message}`) },
    syncGitRepository: async (rootPath) => { runnerCalls.push(`sync:${rootPath}`) },
  })
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler)

  await ipcMain.invoke('git:status', 'workspace-a', 'packages/web')
  await ipcMain.invoke('git:history', 'workspace-a', 'packages/web')
  await ipcMain.invoke('git:stage', 'workspace-a', 'packages/web', 'src/index.ts')
  await ipcMain.invoke('git:unstage', 'workspace-a', 'packages/web', 'src/index.ts', 'src/old.ts')
  await ipcMain.invoke('git:commit', 'workspace-a', 'packages/web', 'save changes')
  await ipcMain.invoke('git:sync', 'workspace-a', 'packages/web')

  assert.deepEqual(resolveCalls, [
    { rootPath: '/workspace', configuredPaths: ['packages/web'], requestedPath: 'packages/web' },
    { rootPath: '/workspace', configuredPaths: ['packages/web'], requestedPath: 'packages/web' },
    { rootPath: '/workspace', configuredPaths: ['packages/web'], requestedPath: 'packages/web' },
    { rootPath: '/workspace', configuredPaths: ['packages/web'], requestedPath: 'packages/web' },
    { rootPath: '/workspace', configuredPaths: ['packages/web'], requestedPath: 'packages/web' },
    { rootPath: '/workspace', configuredPaths: ['packages/web'], requestedPath: 'packages/web' },
  ])
  assert.deepEqual(runnerCalls, [
    'status:/workspace/packages/web',
    'history:/workspace/packages/web',
    'stage:/workspace/packages/web:src/index.ts',
    'unstage:/workspace/packages/web:src/index.ts,src/old.ts',
    'commit:/workspace/packages/web:save changes',
    'sync:/workspace/packages/web',
  ])
})

test('rejects an unconfigured or escaping repository before mutation runner execution', async () => {
  const ipcMain = new FakeIpcMain()
  const { createGitIPCHandlers } = loadGitIPC(ipcMain)
  let runnerCalled = false
  const handlers = createGitIPCHandlers({
    getWorkspaceGitConfigById: async () => ({ rootFolderPath: '/workspace', sourceControlRepositoryPaths: ['packages/web'] }),
    discoverGitRepositories: async () => [],
    resolveConfiguredGitRepository: async (_rootPath, _configuredPaths, requestedPath) => {
      if (requestedPath === 'packages/api') throw new Error('Repository is not configured')
      throw new Error('Repository path escapes the workspace folder')
    },
    getGitStatus: async () => statusResult(),
    getGitCommitHistory: async () => historyResult(),
    stageGitFiles: async () => { runnerCalled = true },
    unstageGitFiles: async () => { runnerCalled = true },
    commitGitChanges: async () => { runnerCalled = true },
    syncGitRepository: async () => { runnerCalled = true },
  })
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler)

  await assert.rejects(
    ipcMain.invoke('git:stage', 'workspace-a', 'packages/api', 'file.txt'),
    /not configured/,
  )
  await assert.rejects(
    ipcMain.invoke('git:stage', 'workspace-a', '../outside', 'file.txt'),
    /escapes the workspace folder/,
  )
  assert.equal(runnerCalled, false)
})

test('keeps safe fallback results when repository resolution fails', async () => {
  const ipcMain = new FakeIpcMain()
  const { createGitIPCHandlers } = loadGitIPC(ipcMain)
  const handlers = createGitIPCHandlers({
    getWorkspaceGitConfigById: async () => ({ rootFolderPath: '/workspace', sourceControlRepositoryPaths: [] }),
    discoverGitRepositories: async () => [],
    resolveConfiguredGitRepository: async () => { throw new Error('Repository is not configured') },
    getGitStatus: async () => statusResult(),
    getGitCommitHistory: async () => historyResult(),
    stageGitFiles: async () => undefined,
    unstageGitFiles: async () => undefined,
    commitGitChanges: async () => undefined,
    syncGitRepository: async () => undefined,
  })
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler)

  assert.deepEqual(await ipcMain.invoke('git:status', 'workspace-a', '.'), {
    isRepository: false,
    branch: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    error: 'Repository is not configured',
  })
  assert.deepEqual(await ipcMain.invoke('git:history', 'workspace-a', '.'), {
    outgoing: [],
    upstream: [],
    local: [],
    error: 'Repository is not configured',
  })
})

test('registers discovery by root path for unsaved workspace roots', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerGitIPC } = loadGitIPC(ipcMain)
  const roots: string[] = []
  registerGitIPC(ipcMain, {
    getWorkspaceGitConfigById: async () => null,
    discoverGitRepositories: async (rootPath) => {
      roots.push(rootPath)
      return [{ relativePath: '.', name: 'new-root' }]
    },
    resolveConfiguredGitRepository: async () => { throw new Error('not used') },
    getGitStatus: async () => statusResult(),
    getGitCommitHistory: async () => historyResult(),
    stageGitFiles: async () => undefined,
    unstageGitFiles: async () => undefined,
    commitGitChanges: async () => undefined,
    syncGitRepository: async () => undefined,
  })

  assert.deepEqual(await ipcMain.invoke('git:discoverRepositoriesAtRoot', '/new-root'), [{ relativePath: '.', name: 'new-root' }])
  assert.deepEqual(roots, ['/new-root'])
})
