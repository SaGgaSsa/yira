import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import type { GitCommitHistoryResult, GitRepository, GitStatusResult } from '@shared/types'
import { getGitDiffSummary } from '../git/diff'
import { discoverGitRepositories, resolveConfiguredGitRepository } from '../git/repositories'

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
  const { registerGitIPC } = loadGitIPC(ipcMain)
  const roots: unknown[] = []
  registerGitIPC(ipcMain, {
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
    getGitDiffSummary: async () => ({ additions: 0, deletions: 0, available: true }),
    stageGitFiles: async () => undefined,
    unstageGitFiles: async () => undefined,
    commitGitChanges: async () => undefined,
    fetchGitRepository: async () => undefined,
    pullGitRepository: async () => undefined,
    pushGitRepository: async () => undefined,
    syncGitRepository: async () => undefined,
  })

  assert.deepEqual(await ipcMain.invoke('git:discoverRepositories', 'workspace-a'), [
    { relativePath: '.', name: 'workspace' },
    { relativePath: 'packages/web', name: 'web' },
  ])
  assert.equal(ipcMain.handlers.has('git:workspaceDiff'), true)
  assert.deepEqual(roots, ['/workspace'])
})

test('sums configured repository diffs and discards the total when one repository fails', async () => {
  const ipcMain = new FakeIpcMain()
  const { createGitIPCHandlers } = loadGitIPC(ipcMain)
  const resolvedPaths: string[] = []
  const handlers = createGitIPCHandlers({
    getWorkspaceGitConfigById: async () => ({ rootFolderPath: '/workspace', sourceControlRepositoryPaths: ['apps/web', 'apps/api'] }),
    discoverGitRepositories: async () => [],
    resolveConfiguredGitRepository: async (_rootPath, _configuredPaths, requestedPath) => {
      if (typeof requestedPath !== 'string') throw new Error('path must be text')
      resolvedPaths.push(requestedPath)
      return {
        absolutePath: `/workspace/${requestedPath}`,
        relativePath: requestedPath,
        repository: { relativePath: requestedPath, name: requestedPath.split('/').at(-1) ?? requestedPath },
      }
    },
    getGitStatus: async () => statusResult(),
    getGitCommitHistory: async () => historyResult(),
    getGitDiffSummary: async (rootPath) => rootPath.endsWith('/api')
      ? { additions: 4, deletions: 1, available: true }
      : { additions: 2, deletions: 3, available: true },
    stageGitFiles: async () => undefined,
    unstageGitFiles: async () => undefined,
    commitGitChanges: async () => undefined,
    fetchGitRepository: async () => undefined,
    pullGitRepository: async () => undefined,
    pushGitRepository: async () => undefined,
    syncGitRepository: async () => undefined,
  })

  assert.deepEqual(await handlers['git:workspaceDiff']({}, 'workspace-a'), {
    additions: 6,
    deletions: 4,
    available: true,
  })
  assert.deepEqual(resolvedPaths, ['apps/web', 'apps/api'])

  const unavailableHandlers = createGitIPCHandlers({
    getWorkspaceGitConfigById: async () => ({ rootFolderPath: '/workspace', sourceControlRepositoryPaths: ['apps/web', 'apps/api'] }),
    discoverGitRepositories: async () => [],
    resolveConfiguredGitRepository: async (_rootPath, _configuredPaths, requestedPath) => ({
      absolutePath: `/workspace/${requestedPath as string}`,
      relativePath: requestedPath as string,
      repository: { relativePath: requestedPath as string, name: 'repo' },
    }),
    getGitStatus: async () => statusResult(),
    getGitCommitHistory: async () => historyResult(),
    getGitDiffSummary: async (rootPath) => {
      if (rootPath.endsWith('/api')) throw new Error('repository failed')
      return { additions: 99, deletions: 99, available: true }
    },
    stageGitFiles: async () => undefined,
    unstageGitFiles: async () => undefined,
    commitGitChanges: async () => undefined,
    fetchGitRepository: async () => undefined,
    pullGitRepository: async () => undefined,
    pushGitRepository: async () => undefined,
    syncGitRepository: async () => undefined,
  })
  assert.deepEqual(await unavailableHandlers['git:workspaceDiff']({}, 'workspace-a'), {
    additions: 0,
    deletions: 0,
    available: false,
  })
})

test('returns an unavailable workspace diff for invalid or empty workspace configuration', async () => {
  const ipcMain = new FakeIpcMain()
  const { createGitIPCHandlers } = loadGitIPC(ipcMain)
  let resolverCalled = false
  const createHandlers = (config: { rootFolderPath?: string; sourceControlRepositoryPaths: string[] } | null) => createGitIPCHandlers({
    getWorkspaceGitConfigById: async () => config,
    discoverGitRepositories: async () => [],
    resolveConfiguredGitRepository: async () => {
      resolverCalled = true
      throw new Error('not expected')
    },
    getGitStatus: async () => statusResult(),
    getGitCommitHistory: async () => historyResult(),
    getGitDiffSummary: async () => ({ additions: 0, deletions: 0, available: true }),
    stageGitFiles: async () => undefined,
    unstageGitFiles: async () => undefined,
    commitGitChanges: async () => undefined,
    fetchGitRepository: async () => undefined,
    pullGitRepository: async () => undefined,
    pushGitRepository: async () => undefined,
    syncGitRepository: async () => undefined,
  })

  assert.deepEqual(await createHandlers({ rootFolderPath: '/workspace', sourceControlRepositoryPaths: [] })['git:workspaceDiff']({}, 'workspace-a'), {
    additions: 0,
    deletions: 0,
    available: false,
    repositoryCount: 0,
  })
  assert.equal(resolverCalled, false)
  assert.deepEqual(await createHandlers({ sourceControlRepositoryPaths: ['.'] })['git:workspaceDiff']({}, 'workspace-a'), {
    additions: 0,
    deletions: 0,
    available: false,
  })
  assert.deepEqual(await createHandlers(null)['git:workspaceDiff']({}, ''), {
    additions: 0,
    deletions: 0,
    available: false,
  })
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
    getGitDiffSummary: async () => ({ additions: 0, deletions: 0, available: true }),
    stageGitFiles: async (rootPath, paths) => { runnerCalls.push(`stage:${rootPath}:${paths.join(',')}`) },
    unstageGitFiles: async (rootPath, paths) => { runnerCalls.push(`unstage:${rootPath}:${paths.join(',')}`) },
    commitGitChanges: async (rootPath, message) => { runnerCalls.push(`commit:${rootPath}:${message}`) },
    fetchGitRepository: async (rootPath) => { runnerCalls.push(`fetch:${rootPath}`) },
    pullGitRepository: async (rootPath) => { runnerCalls.push(`pull:${rootPath}`) },
    pushGitRepository: async (rootPath) => { runnerCalls.push(`push:${rootPath}`) },
    syncGitRepository: async (rootPath) => { runnerCalls.push(`sync:${rootPath}`) },
  })
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler)

  await ipcMain.invoke('git:status', 'workspace-a', 'packages/web')
  await ipcMain.invoke('git:history', 'workspace-a', 'packages/web')
  await ipcMain.invoke('git:stage', 'workspace-a', 'packages/web', 'src/index.ts')
  await ipcMain.invoke('git:unstage', 'workspace-a', 'packages/web', 'src/index.ts', 'src/old.ts')
  await ipcMain.invoke('git:commit', 'workspace-a', 'packages/web', 'save changes')
  await ipcMain.invoke('git:sync', 'workspace-a', 'packages/web')
  await ipcMain.invoke('git:fetch', 'workspace-a', 'packages/web')
  await ipcMain.invoke('git:pull', 'workspace-a', 'packages/web')
  await ipcMain.invoke('git:push', 'workspace-a', 'packages/web')

  assert.deepEqual(resolveCalls, [
    { rootPath: '/workspace', configuredPaths: ['packages/web'], requestedPath: 'packages/web' },
    { rootPath: '/workspace', configuredPaths: ['packages/web'], requestedPath: 'packages/web' },
    { rootPath: '/workspace', configuredPaths: ['packages/web'], requestedPath: 'packages/web' },
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
    'fetch:/workspace/packages/web',
    'pull:/workspace/packages/web',
    'push:/workspace/packages/web',
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
    getGitDiffSummary: async () => ({ additions: 0, deletions: 0, available: true }),
    stageGitFiles: async () => { runnerCalled = true },
    unstageGitFiles: async () => { runnerCalled = true },
    commitGitChanges: async () => { runnerCalled = true },
    fetchGitRepository: async () => undefined,
    pullGitRepository: async () => undefined,
    pushGitRepository: async () => undefined,
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
    getGitDiffSummary: async () => ({ additions: 0, deletions: 0, available: true }),
    stageGitFiles: async () => undefined,
    unstageGitFiles: async () => undefined,
    commitGitChanges: async () => undefined,
    fetchGitRepository: async () => undefined,
    pullGitRepository: async () => undefined,
    pushGitRepository: async () => undefined,
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
      if (typeof rootPath !== 'string') throw new Error('Root path must be text')
      roots.push(rootPath)
      return [{ relativePath: '.', name: 'new-root' }]
    },
    resolveConfiguredGitRepository: async () => { throw new Error('not used') },
    getGitStatus: async () => statusResult(),
    getGitCommitHistory: async () => historyResult(),
    getGitDiffSummary: async () => ({ additions: 0, deletions: 0, available: true }),
    stageGitFiles: async () => undefined,
    unstageGitFiles: async () => undefined,
    commitGitChanges: async () => undefined,
    fetchGitRepository: async () => undefined,
    pullGitRepository: async () => undefined,
    pushGitRepository: async () => undefined,
    syncGitRepository: async () => undefined,
  })

  assert.deepEqual(await ipcMain.invoke('git:discoverRepositoriesAtRoot', '/new-root'), [{ relativePath: '.', name: 'new-root' }])
  assert.deepEqual(roots, ['/new-root'])
})

test('automatically sums shallow repositories, preserves selected deep repositories, and avoids duplicates', async () => {
  const { createGitIPCHandlers } = loadGitIPC(new FakeIpcMain())
  let configuredPaths = ['api', 'packages/web']
  let failChild = false
  const readPaths: string[] = []
  const handlers = createGitIPCHandlers({
    getWorkspaceGitConfigById: async () => ({ rootFolderPath: '/workspace', sourceControlRepositoryPaths: configuredPaths }),
    discoverGitRepositories: async (rootPath, maxDepth) => {
      assert.equal(rootPath, '/workspace')
      assert.equal(maxDepth, 1)
      return [{ relativePath: '.', name: 'workspace' }, { relativePath: 'api', name: 'api' }]
    },
    resolveConfiguredGitRepository: async (_rootPath, allowedPaths, requestedPath) => {
      assert.ok((allowedPaths as string[]).includes(requestedPath as string))
      const relativePath = requestedPath as string
      return {
        absolutePath: relativePath === '.' ? '/workspace' : `/workspace/${relativePath}`,
        relativePath,
        repository: { relativePath, name: relativePath },
      }
    },
    getGitStatus: async () => statusResult(),
    getGitCommitHistory: async () => historyResult(),
    getGitDiffSummary: async (rootPath) => {
      readPaths.push(rootPath)
      if (failChild && rootPath.endsWith('/api')) return { additions: 0, deletions: 0, available: false }
      return rootPath === '/workspace'
        ? { additions: 1, deletions: 0, available: true }
        : { additions: 3, deletions: 2, available: true }
    },
    stageGitFiles: async () => undefined,
    unstageGitFiles: async () => undefined,
    commitGitChanges: async () => undefined,
    fetchGitRepository: async () => undefined,
    pullGitRepository: async () => undefined,
    pushGitRepository: async () => undefined,
    syncGitRepository: async () => undefined,
  })

  assert.deepEqual(await handlers['git:workspaceDiff']({}, 'workspace-a'), {
    additions: 7, deletions: 4, available: true,
  })
  assert.deepEqual(readPaths, ['/workspace/api', '/workspace/packages/web', '/workspace'])

  configuredPaths = []
  readPaths.length = 0
  assert.deepEqual(await handlers['git:workspaceDiff']({}, 'workspace-a'), {
    additions: 4, deletions: 2, available: true,
  })
  assert.deepEqual(readPaths, ['/workspace', '/workspace/api'])

  failChild = true
  assert.deepEqual(await handlers['git:workspaceDiff']({}, 'workspace-a'), {
    additions: 0, deletions: 0, available: false,
  })
})

test('calculates a real multimodule workspace diff without a root repository or selected repositories', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'yira-workspace-diff-'))
  const execFileAsync = promisify(execFile)
  try {
    for (const relativePath of ['api', 'web', 'container/deep']) {
      const repositoryPath = join(rootPath, relativePath)
      await mkdir(repositoryPath, { recursive: true })
      const git = (args: string[]) => execFileAsync('git', ['-C', repositoryPath, ...args])
      await git(['init', '--quiet', '--initial-branch=main'])
      await git(['config', 'user.name', 'Yira Tests'])
      await git(['config', 'user.email', 'yira-tests@example.com'])
      await writeFile(join(repositoryPath, 'file.txt'), 'base\n')
      await git(['add', '.'])
      await git(['commit', '--quiet', '-m', 'base'])
      await git(['config', 'remote.origin.url', '.'])
      await git(['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'])
      await git(['update-ref', 'refs/remotes/origin/main', 'HEAD'])
      await git(['branch', '--set-upstream-to=origin/main', 'main'])
      await writeFile(join(repositoryPath, 'file.txt'), 'changed\nnew\n')
    }

    const { createGitIPCHandlers } = loadGitIPC(new FakeIpcMain())
    const handlers = createGitIPCHandlers({
      getWorkspaceGitConfigById: async () => ({ rootFolderPath: rootPath, sourceControlRepositoryPaths: [] }),
      discoverGitRepositories,
      resolveConfiguredGitRepository,
      getGitDiffSummary,
      getGitStatus: async () => statusResult(),
      getGitCommitHistory: async () => historyResult(),
      stageGitFiles: async () => undefined,
      unstageGitFiles: async () => undefined,
      commitGitChanges: async () => undefined,
      fetchGitRepository: async () => undefined,
      pullGitRepository: async () => undefined,
      pushGitRepository: async () => undefined,
      syncGitRepository: async () => undefined,
    })

    assert.deepEqual(await handlers['git:workspaceDiff']({}, 'workspace-a'), {
      additions: 4, deletions: 2, available: true,
    })
    await rm(join(rootPath, 'web'), { recursive: true, force: true })
    assert.deepEqual(await handlers['git:workspaceDiff']({}, 'workspace-a'), {
      additions: 2, deletions: 1, available: true,
    })
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
