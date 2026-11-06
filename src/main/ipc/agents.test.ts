import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { AgentActiveSessionSnapshot, AgentSessionTranscriptResult, AgentUsageSnapshot } from '@shared/types'
import type { BotDefinition } from '@shared/bots'
import { AgentSessionRegistry } from '../agents/registry'
import { createAgentWorkspaceWorktrees, resolveWorkspaceWorktreeRepositories } from '../agents/worktree'
import type { LinkWorkspaceEntriesInput } from '../agents/workspaceLinks'
import { execGitCommand } from '../git/runner'
import { YIRA_HOME } from '../paths'
import type { AgentIPCWorkspaceLinks } from './agents'
import type { AgentsViewLaunchSpec } from './terminal'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

async function source(relativePath: string): Promise<string> {
  return readFile(resolve(repositoryRoot, relativePath), 'utf8')
}

test('registers restricted agent availability, snapshot/subscription, and history channels', async () => {
  const text = await source('src/main/ipc/agents.ts')
  assert.match(text, /ipcMain\.handle\('agents:availability'/)
  assert.match(text, /ipcMain\.handle\('agents:sessions:snapshot'/)
  assert.match(text, /ipcMain\.handle\('agents:sessions:capabilities'/)
  assert.match(text, /ipcMain\.handle\('agents:worktrees:list'/)
  assert.match(text, /ipcMain\.handle\('agents:sessions:create'/)
  assert.match(text, /ipcMain\.handle\('agents:sessions:close'/)
  assert.match(text, /ipcMain\.handle\('agents:sessions:subscribe'/)
  assert.match(text, /ipcMain\.handle\('agents:sessions:unsubscribe'/)
  assert.match(text, /ipcMain\.handle\('agents:history'/)
  assert.match(text, /ipcMain\.handle\('agents:history:transcript'/)
  assert.match(text, /normalizeAgentHistoryQuery/)
  assert.match(text, /getWorkspaceRootFolderById/)
  assert.match(text, /randomUUID/)
  assert.match(text, /token/)
  assert.match(text, /try\s*\{[\s\S]*sender\.send\(/)
  assert.match(text, /removeListener\('destroyed'/)
  assert.doesNotMatch(text, /rootPath:\s*(?:query|input)/)
})

test('registers a sanitized global usage bridge without reset or credit controls', async () => {
  const text = await source('src/main/ipc/agents.ts')
  const preload = await source('src/preload/index.ts')
  const declaration = await source('src/renderer/src/electron.d.ts')

  assert.match(text, /agents:usage:snapshot/)
  assert.match(text, /agents:usage:changed/)
  assert.match(text, /agents:usage:details/)
  assert.match(preload, /usageSnapshot/)
  assert.match(preload, /usageDetails/)
  assert.match(preload, /onUsageChanged/)
  assert.match(declaration, /usageSnapshot/)
  assert.match(declaration, /usageDetails/)
  assert.match(declaration, /onUsageChanged/)
  assert.doesNotMatch(preload, /rateLimitResetCredit|sendAddCreditsNudgeEmail/)
  assert.doesNotMatch(declaration, /rateLimitResetCredit|sendAddCreditsNudgeEmail/)
})

test('exposes only normalized agent contracts through preload', async () => {
  const text = await source('src/preload/index.ts')
  assert.match(text, /agents:\s*\{/)
  assert.match(text, /ipcRenderer\.invoke\('agents:availability'/)
  assert.match(text, /ipcRenderer\.invoke\('agents:sessions:capabilities'/)
  assert.match(text, /ipcRenderer\.invoke\('agents:sessions:create'/)
  assert.match(text, /ipcRenderer\.invoke\('agents:sessions:close'/)
  assert.match(text, /ipcRenderer\.invoke\('agents:sessions:snapshot'/)
  assert.match(text, /ipcRenderer\.invoke\('agents:history'/)
  assert.match(text, /ipcRenderer\.invoke\('agents:history:transcript'/)
  assert.match(text, /agents:sessions:changed/)
  assert.doesNotMatch(text, /agents[^\n]*readFile|agents[^\n]*rootPath/)
})

test('declares the agent bridge and registers it from main', async () => {
  const declaration = await source('src/renderer/src/electron.d.ts')
  const preload = await source('src/preload/index.ts')
  const main = await source('src/main/index.ts')
  assert.match(declaration, /agents:\s*\{/)
  assert.match(declaration, /AgentSessionHistoryResult/)
  assert.match(declaration, /AgentSessionTranscriptResult/)
  assert.match(declaration, /historyTranscript: \(query: AgentSessionTranscriptQuery\) => Promise<AgentSessionTranscriptResult>/)
  assert.match(declaration, /subscribeSessions: \(workspaceId\?: string\) => Promise<string \| false>/)
  assert.match(declaration, /unsubscribeSessions: \(token: string\) => Promise<boolean>/)
  assert.match(declaration, /onSessionsChanged/)
  assert.match(preload, /AgentSessionHistoryResult/)
  assert.match(preload, /subscribeSessions:[\s\S]*Promise<string \| false>/)
  assert.match(preload, /unsubscribeSessions: \(token: string\)/)
  assert.match(main, /registerAgentsIPC\(\{\s*usageService: agentUsageService,/)
})

type IpcHandler = (event: { sender: FakeWebContents }, ...args: unknown[]) => unknown

class FakeIpcMain {
  readonly handlers = new Map<string, IpcHandler>()

  handle(channel: string, handler: IpcHandler): void {
    this.handlers.set(channel, handler)
  }

  call(channel: string, sender: FakeWebContents, ...args: unknown[]): unknown {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
    return handler({ sender }, ...args)
  }
}

class FakeWebContents extends EventEmitter {
  readonly sentSnapshots: AgentActiveSessionSnapshot[] = []

  constructor(readonly id: number) {
    super()
  }

  isDestroyed(): boolean {
    return false
  }

  send(_channel: string, snapshot: AgentActiveSessionSnapshot): void {
    this.sentSnapshots.push(snapshot)
  }
}

function loadAgentsIPC(ipcMain: FakeIpcMain): typeof import('./agents') {
  const nodeRequire = createRequire(import.meta.url)
  const nodeModule = nodeRequire('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
    _cache: Record<string, unknown>
  }
  const originalLoad = nodeModule._load
  const modulePath = nodeRequire.resolve('./agents.ts')
  const fakeElectron = {
    ipcMain,
    dialog: {},
    BrowserWindow: {},
  }

  nodeModule._load = function(request, parent, isMain) {
    if (request === 'electron') return fakeElectron
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    delete nodeModule._cache[modulePath]
    return nodeRequire(modulePath) as typeof import('./agents')
  } finally {
    nodeModule._load = originalLoad
  }
}

test('returns a fresh usage snapshot without refreshing and refreshes a stale one', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const snapshot: AgentUsageSnapshot = {
    claude: { provider: 'claude', status: 'unavailable', windows: [] },
    codex: { provider: 'codex', status: 'unavailable', windows: [] },
  }
  let stale = false
  let refreshes = 0
  registerAgentsIPC({
    usageService: {
      getSnapshot: () => snapshot,
      isStale: () => stale,
      refresh: async () => { refreshes += 1 },
      subscribe: () => () => undefined,
    },
  })

  const sender = new FakeWebContents(70)
  assert.deepEqual(await ipcMain.call('agents:usage:snapshot', sender), snapshot)
  assert.equal(refreshes, 0)

  stale = true
  assert.deepEqual(await ipcMain.call('agents:usage:snapshot', sender), snapshot)
  assert.equal(refreshes, 1)
})

test('rejects malformed transcript queries and passes normalized IDs to the reader', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const result: AgentSessionTranscriptResult = { entries: [], start: 0, total: 0, found: true }
  const received: Array<{ provider: string; identifier: string }> = []
  registerAgentsIPC({
    transcript: async (query) => {
      received.push({ provider: query.provider, identifier: query.identifier })
      return result
    },
  })
  const sender = new FakeWebContents(99)
  const invalidInputs: unknown[] = [
    null,
    [],
    Object.create({ provider: 'claude', identifier: 'inherited-id' }),
    { provider: 'other', identifier: 'session-id' },
    { provider: 'claude', identifier: '../outside' },
    { provider: 'claude', identifier: 'session-id', workspaceId: '../workspace' },
    { provider: 'claude', identifier: 'session-id', before: -1 },
    { provider: 'claude', identifier: 'session-id', limit: 1.5 },
  ]

  for (const input of invalidInputs) {
    assert.deepEqual(
      await ipcMain.call('agents:history:transcript', sender, input),
      { entries: [], start: 0, total: 0, found: false },
    )
  }

  assert.equal(received.length, 0)
  assert.equal(await ipcMain.call('agents:history:transcript', sender, {
    provider: 'claude',
    identifier: '  valid-session  ',
    before: 0,
    limit: 0,
  }), result)
  assert.deepEqual(received, [{ provider: 'claude', identifier: 'valid-session' }])
})

test('passes pagination offsets to the history reader and rejects malformed ones', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const historyCalls: Array<{ offset?: number; limit?: number }> = []
  registerAgentsIPC({
    history: async (options) => {
      historyCalls.push({ offset: options.offset, limit: options.limit })
      return { items: [], hasMore: false }
    },
  })
  const sender = new FakeWebContents(70)

  for (const offset of [-1, 1.5, '0', null]) {
    assert.deepEqual(
      await ipcMain.call('agents:history', sender, { offset }),
      { items: [], hasMore: false },
    )
  }
  assert.equal(historyCalls.length, 0)

  assert.deepEqual(
    await ipcMain.call('agents:history', sender, { offset: 20, limit: 2 }),
    { items: [], hasMore: false },
  )
  assert.deepEqual(historyCalls, [{ offset: 20, limit: 2 }])
})

test('keeps the replacement session subscription after a late stale unsubscribe', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const registry = new AgentSessionRegistry()
  registerAgentsIPC({ registry })

  const sender = new FakeWebContents(41)
  const subscribeAResult = ipcMain.call('agents:sessions:subscribe', sender, 'workspace-a') as string | false
  let resolveA: ((result: string | false) => void) | undefined
  const subscribeAPromise = new Promise<string | false>((resolvePromise) => {
    resolveA = resolvePromise
  })

  // A unmounts before its IPC response continuation runs, then B mounts on the same sender.
  const subscribeBResult = ipcMain.call('agents:sessions:subscribe', sender, 'workspace-b') as string | false
  const tokenA = subscribeAResult as string
  const tokenB = subscribeBResult as string

  resolveA?.(subscribeAResult)
  assert.equal(await subscribeAPromise, subscribeAResult)

  // This models A's late teardown after B owns the sender's current subscription.
  ipcMain.call('agents:sessions:unsubscribe', sender, tokenA)

  const beforeEvent = sender.sentSnapshots.length
  registry.register({
    sessionId: 'session-b',
    tileId: 'tile-b',
    workspaceId: 'workspace-b',
    provider: 'claude',
  })

  assert.equal(sender.sentSnapshots.length, beforeEvent + 1)
  assert.equal(typeof tokenA, 'string')
  assert.equal(typeof tokenB, 'string')
  assert.notEqual(tokenA, tokenB)
  assert.deepEqual(sender.sentSnapshots.at(-1)?.sessions.map((session) => session.workspaceId), ['workspace-b'])
})

function workspaceAgentConfig() {
  return {
    rootFolderPath: 'C:\\workspace',
    sourceControlRepositoryPaths: [],
    agentProvider: 'claude' as const,
    agentProviders: {
      claude: { enabled: true, args: [] },
      codex: { enabled: true, args: [] },
    },
  }
}

function recordingWorkspaceLinks(
  has: (root: string) => boolean = () => false,
): { links: AgentIPCWorkspaceLinks; linked: LinkWorkspaceEntriesInput[]; removed: string[] } {
  const linked: LinkWorkspaceEntriesInput[] = []
  const removed: string[] = []
  return {
    linked,
    removed,
    links: {
      link: async (input) => { linked.push(input) },
      has: async (root) => has(root),
      remove: async (root) => { removed.push(root) },
    },
  }
}

test('reports no effective provider when user settings have not enabled the workspace provider', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  registerAgentsIPC({
    enabledProviders: async () => [],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    worktreesDirectory: async () => 'C:\\agent-worktrees',
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [{ relativePath: '.', absolutePath: 'C:\\workspace' }],
      listWorkspaceWorktrees: async () => [],
      createAgentWorkspaceWorktrees: async () => { throw new Error('not used') },
      removeAgentWorktreeIfClean: async () => 'missing',
    },
  })
  const sender = new FakeWebContents(52)

  assert.deepEqual(await ipcMain.call('agents:sessions:capabilities', sender, 'workspace-a'), {
    provider: null,
    providers: [],
    worktreeAvailable: true,
    worktreeRepositories: [{ relativePath: '.', name: basename('C:\\workspace') }],
    worktreesDirectory: 'C:\\agent-worktrees',
  })
  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', sender, { workspaceId: 'workspace-a', prompt: 'hello' }) as Promise<unknown>,
    /This workspace has no enabled agent/,
  )
})

test('reports only providers enabled globally and in the workspace', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  registerAgentsIPC({
    enabledProviders: async () => ['claude', 'codex'],
    workspaceAgentConfig: async () => ({
      ...workspaceAgentConfig(),
      agentProviders: {
        claude: { enabled: true, args: [] },
        codex: { enabled: false, args: [] },
      },
    }),
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [],
      listWorkspaceWorktrees: async () => [],
      createAgentWorkspaceWorktrees: async () => { throw new Error('not used') },
      removeAgentWorktreeIfClean: async () => 'missing',
    },
    worktreesDirectory: async () => 'C:\\agent-worktrees',
  })

  assert.deepEqual(
    await ipcMain.call('agents:sessions:capabilities', new FakeWebContents(61), 'workspace-a'),
    {
      provider: 'claude',
      providers: ['claude'],
      worktreeAvailable: false,
      worktreeRepositories: [],
      worktreesDirectory: 'C:\\agent-worktrees',
    },
  )
})

test('lists worktrees for a workspace and derives active roots from live sessions', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const registry = new AgentSessionRegistry()
  const inputs: Array<{
    rootPath: string
    configuredRepositoryPaths: string[]
    activeRoots: string[]
  }> = []
  registerAgentsIPC({
    registry,
    workspaceAgentConfig: async (workspaceId) => ({
      ...workspaceAgentConfig(),
      rootFolderPath: workspaceId === 'workspace-a' ? 'C:\\workspace' : '',
    }),
    worktreesDirectory: async () => 'C:\\agent-worktrees',
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [],
      listWorkspaceWorktrees: async (input) => {
        inputs.push(input)
        return [{
          path: 'C:\\worktrees\\feature',
          branch: 'feature/topic',
          head: 'abcdef1',
          repositories: [{ relativePath: '.', name: 'workspace', path: 'C:\\worktrees\\feature' }],
          createdByYira: false,
          activeSessions: 1,
          missing: false,
        }]
      },
      createAgentWorkspaceWorktrees: async () => { throw new Error('not used') },
      removeAgentWorktreeIfClean: async () => 'missing',
    },
  })
  registry.register({
    sessionId: 'live',
    tileId: 'live',
    workspaceId: 'workspace-a',
    provider: 'claude',
    worktreeRoot: 'C:\\worktrees\\feature',
  })
  registry.register({
    sessionId: 'exited',
    tileId: 'exited',
    workspaceId: 'workspace-a',
    provider: 'claude',
    worktreeRoot: 'C:\\worktrees\\old',
  })
  registry.markExited('workspace-a', 'exited')

  const sender = new FakeWebContents(88)
  assert.equal((await ipcMain.call('agents:worktrees:list', sender, 'workspace-a') as unknown[]).length, 1)
  assert.deepEqual(inputs, [{
    rootPath: 'C:\\workspace',
    configuredRepositoryPaths: [],
    activeRoots: ['C:\\worktrees\\feature'],
  }])
  assert.deepEqual(await ipcMain.call('agents:worktrees:list', sender, 'workspace-empty'), [])
})

test('uses the workspace .worktrees folder for a container workspace without a configured folder', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const { links } = recordingWorkspaceLinks()
  const bases: string[] = []
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    workspaceLinks: links,
    createSession: async () => undefined,
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [
        { relativePath: 'app', absolutePath: 'C:\\workspace\\app' },
        { relativePath: 'libs/api', absolutePath: 'C:\\workspace\\libs\\api' },
      ],
      listWorkspaceWorktrees: async () => [],
      createAgentWorkspaceWorktrees: async (input) => {
        bases.push(input.baseDirectory)
        return {
          root: join(input.baseDirectory, 'workspace-12345678'),
          branch: 'yira/agent-12345678',
          worktrees: [],
        }
      },
      removeAgentWorktreeIfClean: async () => 'removed',
    },
  })

  const capabilities = await ipcMain.call(
    'agents:sessions:capabilities',
    new FakeWebContents(90),
    'workspace-a',
  ) as { worktreesDirectory: string }
  assert.equal(capabilities.worktreesDirectory, join('C:\\workspace', '.worktrees'))

  await ipcMain.call('agents:sessions:create', new FakeWebContents(91), {
    workspaceId: 'workspace-a',
    prompt: 'Run the task',
    worktree: true,
  })
  assert.deepEqual(bases, [join('C:\\workspace', '.worktrees')])
})

test('uses the Yira worktrees folder for a repository workspace without a configured folder', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const { links, linked } = recordingWorkspaceLinks()
  const bases: string[] = []
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    workspaceLinks: links,
    createSession: async () => undefined,
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [
        { relativePath: '.', absolutePath: 'C:\\workspace' },
      ],
      listWorkspaceWorktrees: async () => [],
      createAgentWorkspaceWorktrees: async (input) => {
        bases.push(input.baseDirectory)
        return {
          root: join(input.baseDirectory, 'workspace-12345678'),
          branch: 'yira/agent-12345678',
          worktrees: [],
        }
      },
      removeAgentWorktreeIfClean: async () => 'removed',
    },
  })

  await ipcMain.call('agents:sessions:create', new FakeWebContents(92), {
    workspaceId: 'workspace-a',
    prompt: 'Run the task',
    worktree: true,
  })
  assert.deepEqual(bases, [join(YIRA_HOME, 'worktrees')])
  assert.deepEqual(linked, [])
})

test('prefers the configured worktree folder and excludes it from the container replica', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const { links, linked } = recordingWorkspaceLinks()
  const configuredDirectory = 'C:\\workspace\\agent-worktrees'
  const bases: string[] = []
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    workspaceLinks: links,
    worktreesDirectory: async () => configuredDirectory,
    createSession: async () => undefined,
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [
        { relativePath: 'app', absolutePath: 'C:\\workspace\\app' },
      ],
      listWorkspaceWorktrees: async () => [],
      createAgentWorkspaceWorktrees: async (input) => {
        bases.push(input.baseDirectory)
        return {
          root: join(input.baseDirectory, 'workspace-12345678'),
          branch: 'yira/agent-12345678',
          worktrees: [],
        }
      },
      removeAgentWorktreeIfClean: async () => 'removed',
    },
  })

  await ipcMain.call('agents:sessions:create', new FakeWebContents(93), {
    workspaceId: 'workspace-a',
    prompt: 'Run the task',
    worktree: true,
  })
  assert.deepEqual(bases, [configuredDirectory])
  assert.deepEqual(linked[0].excludedPaths, ['.worktrees', 'agent-worktrees'])
})

test('links the container around a new worktree with only the chosen repositories', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const { links, linked } = recordingWorkspaceLinks()
  const createdRoot = 'C:\\workspace\\.worktrees\\workspace-12345678'
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    workspaceLinks: links,
    createSession: async () => undefined,
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [
        { relativePath: 'app', absolutePath: 'C:\\workspace\\app' },
        { relativePath: 'libs/api', absolutePath: 'C:\\workspace\\libs\\api' },
        { relativePath: 'docs', absolutePath: 'C:\\workspace\\docs' },
      ],
      listWorkspaceWorktrees: async () => [],
      createAgentWorkspaceWorktrees: async () => ({
        root: createdRoot,
        branch: 'yira/agent-12345678',
        worktrees: [],
      }),
      removeAgentWorktreeIfClean: async () => 'removed',
    },
  })

  await ipcMain.call('agents:sessions:create', new FakeWebContents(94), {
    workspaceId: 'workspace-a',
    prompt: 'Run the task',
    worktree: true,
    worktreeRepositories: ['app'],
  })
  assert.equal(linked.length, 1)
  assert.equal(linked[0].workspaceRoot, 'C:\\workspace')
  assert.equal(linked[0].targetRoot, createdRoot)
  assert.deepEqual(linked[0].worktreePaths, ['app'])
  assert.deepEqual(linked[0].excludedPaths, ['.worktrees'])
})

test('removes a new worktree when creating the container replica fails', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const linkError = new Error('container replica failed')
  const { links } = recordingWorkspaceLinks()
  links.link = async () => { throw linkError }
  const removedWorktrees: string[] = []
  const removedLinks: string[] = []
  links.remove = async (root) => { removedLinks.push(root) }
  const worktreeRoot = 'C:\\workspace\\.worktrees\\workspace-12345678'
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    workspaceLinks: links,
    createSession: async () => undefined,
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [
        { relativePath: 'app', absolutePath: 'C:\\workspace\\app' },
        { relativePath: 'libs/api', absolutePath: 'C:\\workspace\\libs\\api' },
      ],
      listWorkspaceWorktrees: async () => [],
      createAgentWorkspaceWorktrees: async () => ({
        root: worktreeRoot,
        branch: 'yira/agent-12345678',
        worktrees: [
          { path: join(worktreeRoot, 'app'), repositoryPath: 'app', baseSha: 'a'.repeat(40) },
          { path: join(worktreeRoot, 'libs', 'api'), repositoryPath: 'libs/api', baseSha: 'b'.repeat(40) },
        ],
      }),
      removeAgentWorktreeIfClean: async ({ path }) => {
        removedWorktrees.push(path)
        return 'removed'
      },
    },
  })

  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(95), {
      workspaceId: 'workspace-a',
      prompt: 'Run the task',
      worktree: true,
    }) as Promise<unknown>,
    (error: unknown) => error === linkError,
  )
  assert.deepEqual(removedWorktrees, [
    join(worktreeRoot, 'libs', 'api'),
    join(worktreeRoot, 'app'),
  ])
  assert.deepEqual(removedLinks, [worktreeRoot])
})

test('starts an existing container worktree in a replica view with add directories', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const { links, linked } = recordingWorkspaceLinks()
  const worktreePath = 'C:\\worktrees\\feature-topic'
  const modules = [
    { relativePath: 'app', name: 'app', path: join(worktreePath, 'app') },
    { relativePath: 'libs/api', name: 'api', path: join(worktreePath, 'libs', 'api') },
  ]
  let launch: { target: { tileId: string }; spec: AgentsViewLaunchSpec } | undefined
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    workspaceLinks: links,
    createSession: async (target, spec) => { launch = { target, spec } },
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [
        { relativePath: 'app', absolutePath: 'C:\\workspace\\app' },
        { relativePath: 'libs/api', absolutePath: 'C:\\workspace\\libs\\api' },
      ],
      listWorkspaceWorktrees: async () => [{
        path: worktreePath,
        branch: 'feature/topic',
        head: 'abcdef1',
        repositories: modules,
        createdByYira: true,
        activeSessions: 0,
        missing: false,
      }],
      createAgentWorkspaceWorktrees: async () => { throw new Error('not used') },
      removeAgentWorktreeIfClean: async () => 'removed',
    },
  })

  await ipcMain.call('agents:sessions:create', new FakeWebContents(96), {
    workspaceId: 'workspace-a',
    existingWorktreePath: worktreePath,
  })

  const suffix = (launch?.target.tileId ?? '').replace(/^agent-/, '').slice(0, 8)
  const view = join('C:\\workspace', '.worktrees', '.sessions', suffix)
  assert.equal(launch?.spec.cwd, view)
  assert.deepEqual(launch?.spec.addDirectories, [modules[0].path, modules[1].path])
  assert.deepEqual(launch?.spec.worktree, {
    root: worktreePath,
    branch: 'feature/topic',
    worktrees: [],
  })
  assert.deepEqual(linked[0].linkedWorktrees, [
    { relativePath: 'app', path: modules[0].path },
    { relativePath: 'libs/api', path: modules[1].path },
  ])
  assert.deepEqual(linked[0].excludedPaths, ['.worktrees'])
})

test('keeps an existing container worktree as cwd when its replica already exists', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const worktreePath = 'C:\\worktrees\\feature-topic'
  const { links, linked } = recordingWorkspaceLinks(() => true)
  let launch: AgentsViewLaunchSpec | undefined
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    workspaceLinks: links,
    createSession: async (_target, spec) => { launch = spec },
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [
        { relativePath: 'app', absolutePath: 'C:\\workspace\\app' },
      ],
      listWorkspaceWorktrees: async () => [{
        path: worktreePath,
        branch: 'feature/topic',
        head: 'abcdef1',
        repositories: [{ relativePath: 'app', name: 'app', path: join(worktreePath, 'app') }],
        createdByYira: true,
        activeSessions: 0,
        missing: false,
      }],
      createAgentWorkspaceWorktrees: async () => { throw new Error('not used') },
      removeAgentWorktreeIfClean: async () => 'removed',
    },
  })

  await ipcMain.call('agents:sessions:create', new FakeWebContents(97), {
    workspaceId: 'workspace-a',
    existingWorktreePath: worktreePath,
  })
  assert.equal(launch?.cwd, worktreePath)
  assert.equal('addDirectories' in (launch ?? {}), false)
  assert.deepEqual(linked, [])
})

test('allows a valid enabled provider override for a new session', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  let launch: AgentsViewLaunchSpec | undefined
  registerAgentsIPC({
    enabledProviders: async () => ['claude', 'codex'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    createSession: async (_target, spec) => { launch = spec },
  })

  const result = await ipcMain.call('agents:sessions:create', new FakeWebContents(55), {
    workspaceId: 'workspace-a',
    provider: 'codex',
    prompt: 'Use Codex',
  }) as { workspaceId: string; tileId: string; provider: string }

  assert.equal(result.workspaceId, 'workspace-a')
  assert.match(result.tileId, /^agent-[0-9a-f-]+$/)
  assert.equal(result.provider, 'codex')
  assert.equal(launch?.provider, 'codex')
})

function fakeBot(overrides: Partial<BotDefinition> = {}): BotDefinition {
  return {
    id: 'bot-1234',
    name: 'Reviewer',
    icon: 'eye',
    color: 'sky',
    provider: 'codex',
    model: 'gpt-5',
    description: 'Reviews changes',
    role: 'Review the diff',
    workspaces: { mode: 'all' },
    tools: [],
    callable: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}

function registerBotSessionIPC(bot: BotDefinition | null, onLaunch: (spec: AgentsViewLaunchSpec) => void): FakeIpcMain {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  registerAgentsIPC({
    enabledProviders: async () => ['claude', 'codex'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    getBot: async () => bot,
    createSession: async (_target, spec) => onLaunch(spec),
  })
  return ipcMain
}

test('launches a bot session with the bot provider, role and name as title', async () => {
  let launch: AgentsViewLaunchSpec | undefined
  const ipcMain = registerBotSessionIPC(fakeBot(), (spec) => { launch = spec })

  const result = await ipcMain.call('agents:sessions:create', new FakeWebContents(70), {
    workspaceId: 'workspace-a',
    provider: 'claude',
    botId: 'bot-1234',
  }) as { provider: string }

  assert.equal(result.provider, 'codex')
  assert.equal(launch?.provider, 'codex')
  assert.deepEqual(launch?.bot, { id: 'bot-1234', role: 'Review the diff', model: 'gpt-5', tools: [] })
  assert.equal(launch?.title, 'Reviewer')
})

test('passes the bot tools through to the launch spec', async () => {
  let launch: AgentsViewLaunchSpec | undefined
  const bot = fakeBot({ tools: ['sessions_search', 'session_read'] })
  const ipcMain = registerBotSessionIPC(bot, (spec) => { launch = spec })

  await ipcMain.call('agents:sessions:create', new FakeWebContents(75), {
    workspaceId: 'workspace-a',
    botId: 'bot-1234',
  })

  assert.deepEqual(launch?.bot?.tools, ['sessions_search', 'session_read'])
})

test('the session launcher creates sessions without IPC', async () => {
  const { createAgentSessionLauncher } = loadAgentsIPC(new FakeIpcMain())
  let launch: AgentsViewLaunchSpec | undefined
  const launcher = createAgentSessionLauncher({
    enabledProviders: async () => ['claude', 'codex'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    createSession: async (_target, spec) => { launch = spec },
  })

  const result = await launcher({ workspaceId: 'workspace-a', provider: 'codex', prompt: 'Find the bug' })

  assert.equal(result.workspaceId, 'workspace-a')
  assert.match(result.tileId, /^agent-[0-9a-f-]+$/)
  assert.equal(result.provider, 'codex')
  assert.equal(launch?.prompt, 'Find the bug')
  await assert.rejects(() => launcher('nope'), /Invalid agent session input/)
})

test('rejects a bot session for an unknown bot', async () => {
  let launches = 0
  const ipcMain = registerBotSessionIPC(null, () => { launches += 1 })

  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(71), {
      workspaceId: 'workspace-a',
      botId: 'bot-1234',
    }) as Promise<unknown>,
    /Bot not found/,
  )
  assert.equal(launches, 0)
})

test('rejects a bot session in a workspace the bot is not enabled for', async () => {
  let launches = 0
  const bot = fakeBot({ workspaces: { mode: 'selected', workspaceIds: ['otro'] } })
  const ipcMain = registerBotSessionIPC(bot, () => { launches += 1 })

  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(72), {
      workspaceId: 'workspace-a',
      botId: 'bot-1234',
    }) as Promise<unknown>,
    /This bot is not enabled for this workspace/,
  )
  assert.equal(launches, 0)
})

test('rejects an invalid bot id and a bot session that resumes a conversation', async () => {
  const ipcMain = registerBotSessionIPC(fakeBot(), () => undefined)

  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(73), {
      workspaceId: 'workspace-a',
      botId: 'not a bot',
    }) as Promise<unknown>,
    /Invalid bot id/,
  )
  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(74), {
      workspaceId: 'workspace-a',
      botId: 'bot-1234',
      resumeSessionId: 'agent-resume-1',
    }) as Promise<unknown>,
    /Bot sessions cannot resume a conversation yet/,
  )
})

test('passes attached image paths in the initial prompt and uses an image title when needed', async (t) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yira-agent-prompt-images-'))
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))

  const promptImageDirectory = join(temporaryDirectory, 'agent-images')
  await mkdir(promptImageDirectory)
  const imagePath = join(promptImageDirectory, '00000000-0000-4000-8000-000000000001.png')
  await writeFile(imagePath, 'image')

  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  let launch: AgentsViewLaunchSpec | undefined
  registerAgentsIPC({
    promptImageDirectory,
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    createSession: async (_target, spec) => { launch = spec },
  })

  await ipcMain.call('agents:sessions:create', new FakeWebContents(62), {
    workspaceId: 'workspace-a',
    prompt: '  Please inspect [Image #2].  ',
    images: [{ number: 2, path: imagePath }],
  })

  assert.equal(
    launch?.prompt,
    'Please inspect [Image #2].\n\nAttached images:\n- [Image #2]: ' + imagePath,
  )
  assert.equal(launch?.title, 'Please inspect [Image #2].')

  await ipcMain.call('agents:sessions:create', new FakeWebContents(63), {
    workspaceId: 'workspace-a',
    images: [{ number: 1, path: imagePath }],
  })

  assert.equal(launch?.prompt, 'Attached images:\n- [Image #1]: ' + imagePath)
  assert.equal(launch?.title, 'Image prompt')

  await ipcMain.call('agents:sessions:create', new FakeWebContents(65), {
    workspaceId: 'workspace-a',
    resumeSessionId: 'history-123',
    images: [{ number: 1, path: 'ignored-image-path' }],
  })

  assert.equal(launch?.prompt, undefined)
  assert.equal(launch?.resumeSessionId, 'history-123')
  assert.equal(launch?.title, 'Resume history-')
})

test('rejects a session when an attached image is no longer available', async (t) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yira-agent-prompt-images-'))
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))

  const promptImageDirectory = join(temporaryDirectory, 'agent-images')
  const imagePath = join(promptImageDirectory, '00000000-0000-4000-8000-000000000001.png')
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  let launches = 0
  registerAgentsIPC({
    promptImageDirectory,
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    createSession: async () => { launches += 1 },
  })

  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(64), {
      workspaceId: 'workspace-a',
      images: [{ number: 1, path: imagePath }],
    }) as Promise<unknown>,
    /Agent prompt image is no longer available/,
  )
  assert.equal(launches, 0)
})

test('rejects a provider override that is disabled in user settings', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
  })

  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(59), {
      workspaceId: 'workspace-a',
      provider: 'codex',
      prompt: 'Use Codex',
    }) as Promise<unknown>,
    /Agent provider "codex" is disabled in user settings/,
  )
})

test('rejects an unknown provider value during session input normalization', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  registerAgentsIPC({})

  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(60), {
      workspaceId: 'workspace-a',
      provider: 'other',
      prompt: 'Run the task',
    }) as Promise<unknown>,
    /Invalid agent provider/,
  )
})

test('rejects a provider override disabled in the workspace', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  let launches = 0
  registerAgentsIPC({
    enabledProviders: async () => ['claude', 'codex'],
    workspaceAgentConfig: async () => ({
      ...workspaceAgentConfig(),
      agentProviders: {
        claude: { enabled: true, args: [] },
        codex: { enabled: false, args: [] },
      },
    }),
    createSession: async () => { launches += 1 },
  })

  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(58), {
      workspaceId: 'workspace-a',
      provider: 'codex',
      prompt: 'Use Codex',
    }) as Promise<unknown>,
    /Agent provider "codex" is disabled for this workspace/,
  )
  assert.equal(launches, 0)
})

test('starts a session without an initial prompt when the prompt is blank', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const launches: AgentsViewLaunchSpec[] = []
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    createSession: async (_target, spec) => { launches.push(spec) },
  })

  for (const [id, prompt] of [[53, ' \n\t '], [54, undefined]] as const) {
    await ipcMain.call('agents:sessions:create', new FakeWebContents(id), {
      workspaceId: 'workspace-a',
      ...(prompt !== undefined ? { prompt } : {}),
    })
  }

  assert.equal(launches.length, 2)
  for (const launch of launches) {
    assert.equal(launch.prompt, undefined)
    assert.equal(launch.title, '')
  }
})

test('ignores legacy overrides when launching a resumed session from its worktree cwd', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  let launch: { target: { workspaceId: string; tileId: string }; spec: AgentsViewLaunchSpec } | undefined
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    createSession: async (target, spec) => { launch = { target, spec } },
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [{ relativePath: '.', absolutePath: 'C:\\workspace' }],
      listWorkspaceWorktrees: async () => [],
      createAgentWorkspaceWorktrees: async () => ({
        root: 'C:\\worktrees\\sample-workspace',
        branch: 'yira/agent-12345678',
        worktrees: [
          { path: 'C:\\worktrees\\sample-workspace', repositoryPath: '.', baseSha: 'a'.repeat(40) },
          { path: 'C:\\worktrees\\sample-workspace\\packages\\app', repositoryPath: 'packages/app', baseSha: 'b'.repeat(40) },
        ],
      }),
      removeAgentWorktreeIfClean: async () => 'removed',
    },
  })

  const result = await ipcMain.call('agents:sessions:create', new FakeWebContents(56), {
    workspaceId: 'workspace-a',
    resumeSessionId: 'history-123',
    resumeCwd: 'packages/app',
    worktree: true,
    overrides: { model: '-unsafe' },
  })

  assert.deepEqual(result, {
    workspaceId: 'workspace-a',
    tileId: launch?.target.tileId,
    provider: 'claude',
  })
  assert.match(launch?.target.tileId ?? '', /^agent-[0-9a-f-]+$/)
  assert.equal(launch?.spec.cwd, 'C:\\worktrees\\sample-workspace')
  assert.equal(launch?.spec.title, 'Resume history-')
  assert.equal(launch?.spec.resumeSessionId, 'history-123')
  assert.equal('overrides' in (launch?.spec ?? {}), false)
  assert.deepEqual(launch?.spec.worktree, {
    root: 'C:\\worktrees\\sample-workspace',
    branch: 'yira/agent-12345678',
    worktrees: [
      { path: 'C:\\worktrees\\sample-workspace', baseSha: 'a'.repeat(40) },
      { path: 'C:\\worktrees\\sample-workspace\\packages\\app', baseSha: 'b'.repeat(40) },
    ],
  })
})

test('cleans up a newly created worktree when the terminal launch fails', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const launchError = new Error('terminal launch failed')
  const removed: string[] = []
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    createSession: async () => { throw launchError },
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [{ relativePath: '.', absolutePath: 'C:\\workspace' }],
      listWorkspaceWorktrees: async () => [],
      createAgentWorkspaceWorktrees: async () => ({
        root: 'C:\\worktrees\\sample-workspace',
        branch: 'yira/agent-12345678',
        worktrees: [
          { path: 'C:\\worktrees\\sample-workspace', repositoryPath: '.', baseSha: 'a'.repeat(40) },
          { path: 'C:\\worktrees\\sample-workspace\\packages\\app', repositoryPath: 'packages/app', baseSha: 'b'.repeat(40) },
        ],
      }),
      removeAgentWorktreeIfClean: async ({ path }) => {
        removed.push(path)
        return 'removed'
      },
    },
  })

  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(57), {
      workspaceId: 'workspace-a',
      prompt: 'Run the task',
      worktree: true,
    }) as Promise<unknown>,
    (error: unknown) => error === launchError,
  )
  assert.deepEqual(removed, [
    'C:\\worktrees\\sample-workspace\\packages\\app',
    'C:\\worktrees\\sample-workspace',
  ])
})

test('starts a session in an existing worktree and closes it without removing files', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const registry = new AgentSessionRegistry()
  const removed: string[] = []
  const listInputs: unknown[] = []
  let launch: AgentsViewLaunchSpec | undefined
  const worktreePath = 'C:\\worktrees\\feature-topic'
  registerAgentsIPC({
    registry,
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    worktreesDirectory: async () => 'C:\\agent-worktrees',
    createSession: async (_target, spec) => { launch = spec },
    destroySession: async () => undefined,
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [
        { relativePath: '.', absolutePath: 'C:\\workspace' },
      ],
      listWorkspaceWorktrees: async (input) => {
        listInputs.push(input)
        return [{
          path: worktreePath,
          branch: 'feature/topic',
          head: 'abcdef1234',
          repositories: [{ relativePath: '.', name: 'workspace', path: worktreePath }],
          createdByYira: false,
          changedFiles: 2,
          activeSessions: 0,
          missing: false,
        }]
      },
      createAgentWorkspaceWorktrees: async () => { throw new Error('not used') },
      removeAgentWorktreeIfClean: async ({ path }) => {
        removed.push(path)
        return 'removed'
      },
    },
  })

  const result = await ipcMain.call('agents:sessions:create', new FakeWebContents(80), {
    workspaceId: 'workspace-a',
    // The dialog always sends the flag, so `false` must not count as a conflict.
    worktree: false,
    existingWorktreePath: worktreePath,
  }) as { tileId: string }
  assert.equal(launch?.cwd, worktreePath)
  assert.deepEqual(launch?.worktree, {
    root: worktreePath,
    branch: 'feature/topic',
    worktrees: [],
  })
  assert.equal('relativeCwd' in (launch ?? {}), false)
  assert.deepEqual(listInputs, [{
    rootPath: 'C:\\workspace',
    configuredRepositoryPaths: [],
    activeRoots: [],
  }])

  registry.register({
    sessionId: result.tileId,
    tileId: result.tileId,
    workspaceId: 'workspace-a',
    provider: 'claude',
    surface: 'agents-view',
    worktreeRoot: worktreePath,
    worktreeBranch: 'feature/topic',
    worktrees: [],
  })
  assert.deepEqual(await ipcMain.call('agents:sessions:close', new FakeWebContents(81), {
    workspaceId: 'workspace-a',
    tileId: result.tileId,
  }), { worktree: 'none' })
  assert.deepEqual(removed, [])
})

test('rejects an existing worktree that is no longer available', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  let launches = 0
  let options = [{
    path: 'C:\\worktrees\\other',
    branch: 'feature/other',
    head: 'abcdef1',
    repositories: [{ relativePath: '.', name: 'workspace', path: 'C:\\worktrees\\other' }],
    createdByYira: false,
    activeSessions: 0,
    missing: false,
  }]
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    createSession: async () => { launches += 1 },
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [],
      listWorkspaceWorktrees: async () => options,
      createAgentWorkspaceWorktrees: async () => { throw new Error('not used') },
      removeAgentWorktreeIfClean: async () => 'removed',
    },
  })

  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(82), {
      workspaceId: 'workspace-a',
      existingWorktreePath: 'C:\\worktrees\\missing',
    }) as Promise<unknown>,
    /This worktree is no longer available/,
  )

  options = [{ ...options[0], path: 'C:\\worktrees\\missing', missing: true }]
  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(83), {
      workspaceId: 'workspace-a',
      existingWorktreePath: 'C:\\worktrees\\missing',
    }) as Promise<unknown>,
    /This worktree is no longer available/,
  )
  assert.equal(launches, 0)
})

test('rejects combining an existing worktree with a new worktree or a resume', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  registerAgentsIPC({})

  for (const input of [
    { workspaceId: 'workspace-a', existingWorktreePath: 'C:\\worktrees\\feature', worktree: true },
    { workspaceId: 'workspace-a', existingWorktreePath: 'C:\\worktrees\\feature', resumeCwd: 'packages/app' },
    { workspaceId: 'workspace-a', existingWorktreePath: 'C:\\worktrees\\feature', resumeSessionId: 'history-123' },
  ]) {
    await assert.rejects(
      () => ipcMain.call('agents:sessions:create', new FakeWebContents(84), input) as Promise<unknown>,
      /Invalid agent worktree option/,
    )
  }
})

test('limits a new worktree to the requested repositories', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const created: string[][] = []
  let launches = 0
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    worktreesDirectory: async () => 'C:\\agent-worktrees',
    createSession: async () => { launches += 1 },
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [
        { relativePath: '.', absolutePath: 'C:\\workspace' },
        { relativePath: 'packages/app', absolutePath: 'C:\\workspace\\packages\\app' },
      ],
      listWorkspaceWorktrees: async () => [],
      createAgentWorkspaceWorktrees: async (input) => {
        created.push(input.repositories.map(({ relativePath }) => relativePath))
        return { root: 'C:\\worktrees\\subset', branch: 'yira/agent-subset', worktrees: [] }
      },
      removeAgentWorktreeIfClean: async () => 'removed',
    },
  })

  await ipcMain.call('agents:sessions:create', new FakeWebContents(85), {
    workspaceId: 'workspace-a',
    worktree: true,
    worktreeRepositories: ['packages/app'],
  })
  assert.deepEqual(created, [['packages/app']])
  assert.equal(launches, 1)

  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(86), {
      workspaceId: 'workspace-a',
      worktree: true,
      worktreeRepositories: ['missing'],
    }) as Promise<unknown>,
    /Agent worktree repository is not available/,
  )
  assert.deepEqual(created, [['packages/app']])
  assert.equal(launches, 1)
})

test('keeps a worktree while another live session still uses it', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const registry = new AgentSessionRegistry()
  const removed: string[] = []
  const worktreeRoot = 'C:\\worktrees\\shared'
  registerAgentsIPC({
    registry,
    destroySession: async () => undefined,
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    workspaceLinks: recordingWorkspaceLinks().links,
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [],
      listWorkspaceWorktrees: async () => [],
      createAgentWorkspaceWorktrees: async () => { throw new Error('not used') },
      removeAgentWorktreeIfClean: async ({ path }) => {
        removed.push(path)
        return 'removed'
      },
    },
  })
  registry.register({
    sessionId: 'agent-owner',
    tileId: 'agent-owner',
    workspaceId: 'workspace-a',
    provider: 'claude',
    surface: 'agents-view',
    worktreeRoot,
    worktreeBranch: 'yira/agent-owner',
    worktrees: [{ path: worktreeRoot, baseSha: 'a'.repeat(40) }],
  })
  registry.register({
    sessionId: 'agent-other',
    tileId: 'agent-other',
    workspaceId: 'workspace-a',
    provider: 'claude',
    surface: 'agents-view',
    worktreeRoot: join(worktreeRoot, 'packages', 'app'),
    worktreeBranch: 'yira/agent-owner',
  })

  assert.deepEqual(await ipcMain.call('agents:sessions:close', new FakeWebContents(87), {
    workspaceId: 'workspace-a',
    tileId: 'agent-owner',
  }), { worktree: 'kept', worktreeRoot, worktreeKeptReason: 'shared' })
  assert.deepEqual(removed, [])
  assert.ok(registry.get('workspace-a', 'agent-other'))
})

test('rejects closing a persistent tile session from Agents View', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const registry = new AgentSessionRegistry()
  let destroys = 0
  registerAgentsIPC({
    registry,
    destroySession: async () => { destroys += 1 },
  })
  registry.register({
    sessionId: 'tile-session',
    tileId: 'terminal-tile',
    workspaceId: 'workspace-a',
    provider: 'claude',
    surface: 'tile',
  })

  await assert.rejects(
    () => ipcMain.call('agents:sessions:close', new FakeWebContents(54), {
      workspaceId: 'workspace-a',
      tileId: 'terminal-tile',
    }) as Promise<unknown>,
    /Only Agents View sessions can be closed here/,
  )
  assert.equal(destroys, 0)
  assert.ok(registry.get('workspace-a', 'terminal-tile'))
})

test('the session closer closes Agents View sessions without IPC', async () => {
  const { createAgentSessionCloser } = loadAgentsIPC(new FakeIpcMain())
  const registry = new AgentSessionRegistry()
  const destroyed: string[] = []
  const closeSession = createAgentSessionCloser({
    registry,
    destroySession: async ({ tileId }) => { destroyed.push(tileId) },
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    workspaceLinks: recordingWorkspaceLinks().links,
  })
  registry.register({
    sessionId: 'agent-closer',
    tileId: 'agent-closer',
    workspaceId: 'workspace-a',
    provider: 'claude',
    surface: 'agents-view',
  })

  assert.deepEqual(await closeSession({ workspaceId: 'workspace-a', tileId: 'agent-closer' }), { worktree: 'none' })
  assert.deepEqual(destroyed, ['agent-closer'])
  assert.equal(registry.get('workspace-a', 'agent-closer'), null)
  await assert.rejects(() => closeSession({ workspaceId: 'workspace-a', tileId: 'agent-closer' }), /Agent session not found/)
})

test('closes Agents View sessions and reports whether their worktrees were kept or removed', async () => {
  for (const worktreeResult of ['kept', 'removed'] as const) {
    const ipcMain = new FakeIpcMain()
    const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
    const registry = new AgentSessionRegistry()
    const destroyed: string[] = []
    const removed: string[] = []
    registerAgentsIPC({
      registry,
      destroySession: async ({ tileId }) => { destroyed.push(tileId) },
      workspaceAgentConfig: async () => workspaceAgentConfig(),
      workspaceLinks: recordingWorkspaceLinks().links,
      worktrees: {
        resolveWorkspaceWorktreeRepositories: async () => [{ relativePath: '.', absolutePath: 'C:\\workspace' }],
        listWorkspaceWorktrees: async () => [],
        createAgentWorkspaceWorktrees: async () => { throw new Error('not used') },
        removeAgentWorktreeIfClean: async ({ path }) => {
          removed.push(path)
          return worktreeResult
        },
      },
    })
    const tileId = `agent-${worktreeResult}`
    registry.register({
      sessionId: tileId,
      tileId,
      workspaceId: 'workspace-a',
      provider: 'codex',
      surface: 'agents-view',
      worktreeRoot: `C:\\worktrees\\${worktreeResult}`,
      worktreeBranch: 'yira/agent-12345678',
      worktrees: [
        { path: `C:\\worktrees\\${worktreeResult}`, baseSha: 'a'.repeat(40) },
        { path: `C:\\worktrees\\${worktreeResult}\\packages\\repo`, baseSha: 'b'.repeat(40) },
      ],
    })

    assert.deepEqual(await ipcMain.call('agents:sessions:close', new FakeWebContents(55), {
      workspaceId: 'workspace-a',
      tileId,
    }), worktreeResult === 'kept'
      ? { worktree: 'kept', worktreeRoot: `C:\\worktrees\\${worktreeResult}` }
      : { worktree: 'removed' })
    assert.deepEqual(destroyed, [tileId])
    assert.deepEqual(removed, worktreeResult === 'kept'
      ? [`C:\\worktrees\\${worktreeResult}\\packages\\repo`]
      : [
          `C:\\worktrees\\${worktreeResult}\\packages\\repo`,
          `C:\\worktrees\\${worktreeResult}`,
        ])
    assert.equal(registry.get('workspace-a', tileId), null)
  }
})

test('removes the replica view when a session closes without touching worktrees', async () => {
  const { createAgentSessionCloser } = loadAgentsIPC(new FakeIpcMain())
  const registry = new AgentSessionRegistry()
  const tileId = 'agent-view1234'
  const view = join('C:\\workspace', '.worktrees', '.sessions', 'view1234')
  const { links, removed } = recordingWorkspaceLinks((root) => root === view)
  const removedWorktrees: string[] = []
  const closeSession = createAgentSessionCloser({
    registry,
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    workspaceLinks: links,
    destroySession: async () => undefined,
    worktrees: {
      resolveWorkspaceWorktreeRepositories: async () => [],
      listWorkspaceWorktrees: async () => [],
      createAgentWorkspaceWorktrees: async () => { throw new Error('not used') },
      removeAgentWorktreeIfClean: async ({ path }) => {
        removedWorktrees.push(path)
        return 'removed'
      },
    },
  })
  registry.register({
    sessionId: tileId,
    tileId,
    workspaceId: 'workspace-a',
    provider: 'claude',
    surface: 'agents-view',
    worktreeRoot: 'C:\\worktrees\\feature-topic',
    worktreeBranch: 'feature/topic',
    worktrees: [],
  })

  assert.deepEqual(await closeSession({ workspaceId: 'workspace-a', tileId }), { worktree: 'none' })
  assert.deepEqual(removed, [view])
  assert.deepEqual(removedWorktrees, [])
})

test('removes the replica root only after every worktree was removed', async () => {
  for (const removal of ['removed', 'kept'] as const) {
    const { createAgentSessionCloser } = loadAgentsIPC(new FakeIpcMain())
    const registry = new AgentSessionRegistry()
    const tileId = 'agent-owner123'
    const worktreeRoot = 'C:\\worktrees\\clean'
    const childPath = join(worktreeRoot, 'packages', 'app')
    const { links } = recordingWorkspaceLinks()
    const events: string[] = []
    links.remove = async (root) => { events.push(`links:${root}`) }
    const closeSession = createAgentSessionCloser({
      registry,
      workspaceAgentConfig: async () => workspaceAgentConfig(),
      workspaceLinks: links,
      destroySession: async () => undefined,
      worktrees: {
        resolveWorkspaceWorktreeRepositories: async () => [],
        listWorkspaceWorktrees: async () => [],
        createAgentWorkspaceWorktrees: async () => { throw new Error('not used') },
        removeAgentWorktreeIfClean: async ({ path }) => {
          events.push(`worktree:${path}`)
          return removal
        },
      },
    })
    registry.register({
      sessionId: tileId,
      tileId,
      workspaceId: 'workspace-a',
      provider: 'claude',
      surface: 'agents-view',
      worktreeRoot,
      worktreeBranch: 'yira/agent-owner123',
      worktrees: [
        { path: worktreeRoot, baseSha: 'a'.repeat(40) },
        { path: childPath, baseSha: 'b'.repeat(40) },
      ],
    })

    await closeSession({ workspaceId: 'workspace-a', tileId })
    assert.deepEqual(events, removal === 'removed'
      ? [`worktree:${childPath}`, `worktree:${worktreeRoot}`, `links:${worktreeRoot}`]
      : [`worktree:${childPath}`])
  }
})

test('keeps the root worktree when a real child worktree has uncommitted changes', async (t) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yira-agent-close-worktree-'))
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const rootPath = join(temporaryDirectory, 'workspace')
  const childPath = join(rootPath, 'child')

  const initializeRepository = async (repositoryPath: string, fileName: string) => {
    await mkdir(repositoryPath, { recursive: true })
    await execGitCommand('git', ['-C', repositoryPath, 'init', '--quiet'])
    await execGitCommand('git', ['-C', repositoryPath, 'config', 'user.name', 'Yira Test'])
    await execGitCommand('git', ['-C', repositoryPath, 'config', 'user.email', 'yira-test@example.invalid'])
    await writeFile(join(repositoryPath, fileName), 'initial\n')
    await execGitCommand('git', ['-C', repositoryPath, 'add', fileName])
    await execGitCommand('git', ['-C', repositoryPath, 'commit', '--quiet', '-m', 'initial commit'])
  }

  await initializeRepository(rootPath, 'README.md')
  await initializeRepository(childPath, 'README.md')
  const repositories = await resolveWorkspaceWorktreeRepositories({ rootPath, configuredRepositoryPaths: [] })
  const worktree = await createAgentWorkspaceWorktrees({
    rootPath,
    repositories,
    sessionId: 'agent-dirtychild',
    baseDirectory: join(temporaryDirectory, 'worktrees'),
  })
  const childWorktree = worktree.worktrees[1]
  await writeFile(join(childWorktree.path, 'README.md'), 'changed\n')

  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const registry = new AgentSessionRegistry()
  registerAgentsIPC({
    registry,
    destroySession: async () => undefined,
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    workspaceLinks: recordingWorkspaceLinks().links,
  })
  registry.register({
    sessionId: 'session-dirtychild',
    tileId: 'agent-dirtychild',
    workspaceId: 'workspace-a',
    provider: 'claude',
    surface: 'agents-view',
    worktreeRoot: worktree.root,
    worktreeBranch: worktree.branch,
    worktrees: worktree.worktrees.map(({ path, baseSha }) => ({ path, baseSha })),
  })

  assert.deepEqual(await ipcMain.call('agents:sessions:close', new FakeWebContents(58), {
    workspaceId: 'workspace-a',
    tileId: 'agent-dirtychild',
  }), { worktree: 'kept', worktreeRoot: worktree.root })
  await access(worktree.root)
  await access(worktree.worktrees[0].path)
  await access(childWorktree.path)
})

test('moves an Agents View session to a canvas tile and reports resumable metadata', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const registry = new AgentSessionRegistry()
  const moved: Array<{ workspaceId: string; tileId: string }> = []
  registerAgentsIPC({
    registry,
    moveSessionToTile: async (target) => { moved.push(target) },
  })
  registry.register({
    sessionId: 'claude-session-1',
    tileId: 'agent-pin-1',
    workspaceId: 'workspace-a',
    provider: 'claude',
    surface: 'agents-view',
    cwd: 'packages/app',
  })
  registry.register({
    sessionId: 'agent-pin-2',
    tileId: 'agent-pin-2',
    workspaceId: 'workspace-a',
    provider: 'codex',
    surface: 'agents-view',
  })

  assert.deepEqual(await ipcMain.call('agents:sessions:pin', new FakeWebContents(66), {
    workspaceId: 'workspace-a',
    tileId: 'agent-pin-1',
  }), {
    provider: 'claude',
    sessionId: 'claude-session-1',
    cwd: 'packages/app',
  })
  // A Codex session id equal to the tile id is synthetic, so it is omitted.
  assert.deepEqual(await ipcMain.call('agents:sessions:pin', new FakeWebContents(67), {
    workspaceId: 'workspace-a',
    tileId: 'agent-pin-2',
  }), { provider: 'codex' })
  assert.deepEqual(moved, [
    { workspaceId: 'workspace-a', tileId: 'agent-pin-1' },
    { workspaceId: 'workspace-a', tileId: 'agent-pin-2' },
  ])
})

test('rejects pinning an Agents View session that runs in a worktree', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  const registry = new AgentSessionRegistry()
  let moves = 0
  registerAgentsIPC({
    registry,
    moveSessionToTile: async () => { moves += 1 },
  })
  registry.register({
    sessionId: 'worktree-session',
    tileId: 'agent-worktree',
    workspaceId: 'workspace-a',
    provider: 'claude',
    surface: 'agents-view',
    worktreeRoot: 'C:\\worktrees\\agent-worktree',
    worktreeBranch: 'yira/agent-worktree',
    worktrees: [{ path: 'C:\\worktrees\\agent-worktree', baseSha: 'a'.repeat(40) }],
  })

  await assert.rejects(
    () => ipcMain.call('agents:sessions:pin', new FakeWebContents(68), {
      workspaceId: 'workspace-a',
      tileId: 'agent-worktree',
    }) as Promise<unknown>,
    /worktree cannot be moved to a tile/,
  )
  assert.equal(moves, 0)
})
