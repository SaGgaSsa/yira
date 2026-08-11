import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { AgentActiveSessionSnapshot } from '@shared/types'
import { AgentSessionRegistry } from '../agents/registry'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

async function source(relativePath: string): Promise<string> {
  return readFile(resolve(repositoryRoot, relativePath), 'utf8')
}

test('registers restricted agent availability, snapshot/subscription, and history channels', async () => {
  const text = await source('src/main/ipc/agents.ts')
  assert.match(text, /ipcMain\.handle\('agents:availability'/)
  assert.match(text, /ipcMain\.handle\('agents:sessions:snapshot'/)
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
  assert.match(preload, /usageSnapshot/)
  assert.match(preload, /onUsageChanged/)
  assert.match(declaration, /usageSnapshot/)
  assert.match(declaration, /onUsageChanged/)
  assert.doesNotMatch(preload, /rateLimitResetCredit|sendAddCreditsNudgeEmail/)
  assert.doesNotMatch(declaration, /rateLimitResetCredit|sendAddCreditsNudgeEmail/)
})

test('exposes only normalized agent contracts through preload', async () => {
  const text = await source('src/preload/index.ts')
  assert.match(text, /agents:\s*\{/)
  assert.match(text, /ipcRenderer\.invoke\('agents:availability'/)
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
  assert.match(main, /registerAgentsIPC\(\{ usageService: agentUsageService \}\)/)
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
  }
  const originalLoad = nodeModule._load
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
    return nodeRequire('./agents.ts') as typeof import('./agents')
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
