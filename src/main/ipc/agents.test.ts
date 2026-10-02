import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { AgentActiveSessionSnapshot } from '@shared/types'
import { AgentSessionRegistry } from '../agents/registry'
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
  assert.match(text, /ipcMain\.handle\('agents:sessions:create'/)
  assert.match(text, /ipcMain\.handle\('agents:sessions:close'/)
  assert.match(text, /ipcMain\.handle\('agents:sessions:subscribe'/)
  assert.match(text, /ipcMain\.handle\('agents:sessions:unsubscribe'/)
  assert.match(text, /ipcMain\.handle\('agents:history'/)
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
  assert.match(text, /agents:sessions:changed/)
  assert.doesNotMatch(text, /agents[^\n]*readFile|agents[^\n]*rootPath/)
})

test('declares the agent bridge and registers it from main', async () => {
  const declaration = await source('src/renderer/src/electron.d.ts')
  const preload = await source('src/preload/index.ts')
  const main = await source('src/main/index.ts')
  assert.match(declaration, /agents:\s*\{/)
  assert.match(declaration, /AgentSessionHistoryResult/)
  assert.match(declaration, /subscribeSessions: \(workspaceId\?: string\) => Promise<string \| false>/)
  assert.match(declaration, /unsubscribeSessions: \(token: string\) => Promise<boolean>/)
  assert.match(declaration, /onSessionsChanged/)
  assert.match(preload, /AgentSessionHistoryResult/)
  assert.match(preload, /subscribeSessions:[\s\S]*Promise<string \| false>/)
  assert.match(preload, /unsubscribeSessions: \(token: string\)/)
  assert.match(main, /registerAgentsIPC\(\{ usageService: agentUsageService, usageDetailsService: agentUsageDetailsService, usageIndex: agentUsageIndex,/)
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
    agentProvider: 'claude' as const,
    agentProviders: {
      claude: { enabled: true, args: [] },
      codex: { enabled: true, args: [] },
    },
  }
}

test('reports no effective provider when user settings have not enabled the workspace provider', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  registerAgentsIPC({
    enabledProviders: async () => [],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    worktrees: {
      canCreateAgentWorktree: async () => true,
      createAgentWorktree: async () => { throw new Error('not used') },
      removeAgentWorktreeIfClean: async () => 'missing',
    },
  })
  const sender = new FakeWebContents(52)

  assert.deepEqual(await ipcMain.call('agents:sessions:capabilities', sender, 'workspace-a'), {
    provider: null,
    worktreeAvailable: true,
  })
  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', sender, { workspaceId: 'workspace-a', prompt: 'hello' }) as Promise<unknown>,
    /This workspace has no enabled agent/,
  )
})

test('rejects an empty prompt before attempting to launch', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  let launches = 0
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    createSession: async () => { launches += 1 },
  })

  await assert.rejects(
    () => ipcMain.call('agents:sessions:create', new FakeWebContents(53), {
      workspaceId: 'workspace-a',
      prompt: ' \n\t ',
    }) as Promise<unknown>,
    /Agent prompt is required/,
  )
  assert.equal(launches, 0)
})

test('launches a resumed session from its worktree cwd with session metadata', async () => {
  const ipcMain = new FakeIpcMain()
  const { registerAgentsIPC } = loadAgentsIPC(ipcMain)
  let launch: { target: { workspaceId: string; tileId: string }; spec: AgentsViewLaunchSpec } | undefined
  registerAgentsIPC({
    enabledProviders: async () => ['claude'],
    workspaceAgentConfig: async () => workspaceAgentConfig(),
    createSession: async (target, spec) => { launch = { target, spec } },
    worktrees: {
      canCreateAgentWorktree: async () => true,
      createAgentWorktree: async () => ({
        path: 'C:\\worktrees\\sample-repo',
        cwd: 'C:\\worktrees\\sample-repo',
        branch: 'yira/agent-12345678',
        baseSha: 'a'.repeat(40),
      }),
      removeAgentWorktreeIfClean: async () => 'removed',
    },
  })

  const result = await ipcMain.call('agents:sessions:create', new FakeWebContents(56), {
    workspaceId: 'workspace-a',
    resumeSessionId: 'history-123',
    resumeCwd: 'packages/app',
    worktree: true,
  })

  assert.deepEqual(result, {
    workspaceId: 'workspace-a',
    tileId: launch?.target.tileId,
    provider: 'claude',
  })
  assert.match(launch?.target.tileId ?? '', /^agent-[0-9a-f-]+$/)
  assert.equal(launch?.spec.cwd, 'C:\\worktrees\\sample-repo\\packages\\app')
  assert.equal(launch?.spec.title, 'Resume history-')
  assert.equal(launch?.spec.resumeSessionId, 'history-123')
  assert.deepEqual(launch?.spec.worktree, {
    path: 'C:\\worktrees\\sample-repo',
    branch: 'yira/agent-12345678',
    baseSha: 'a'.repeat(40),
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
      canCreateAgentWorktree: async () => true,
      createAgentWorktree: async () => ({
        path: 'C:\\worktrees\\sample-repo',
        cwd: 'C:\\worktrees\\sample-repo',
        branch: 'yira/agent-12345678',
        baseSha: 'a'.repeat(40),
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
  assert.deepEqual(removed, ['C:\\worktrees\\sample-repo'])
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
      worktrees: {
        canCreateAgentWorktree: async () => true,
        createAgentWorktree: async () => { throw new Error('not used') },
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
      worktreePath: `C:\\worktrees\\${worktreeResult}`,
      worktreeBranch: 'yira/agent-12345678',
      worktreeBaseSha: 'a'.repeat(40),
    })

    assert.deepEqual(await ipcMain.call('agents:sessions:close', new FakeWebContents(55), {
      workspaceId: 'workspace-a',
      tileId,
    }), { worktree: worktreeResult })
    assert.deepEqual(destroyed, [tileId])
    assert.deepEqual(removed, [`C:\\worktrees\\${worktreeResult}`])
    assert.equal(registry.get('workspace-a', tileId), null)
  }
})
