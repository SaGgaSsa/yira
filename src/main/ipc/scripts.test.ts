import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'

import type {
  TerminalCreateResult,
  WorkspaceScript,
  WorkspaceScriptRun,
  WorkspaceScriptsSnapshot,
} from '@shared/types'
import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'
import { workspaceScriptTileId } from '../workspaceScripts'
import type { WorkspaceScriptSessionEvent } from './terminal'

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
  readonly sentSnapshots: WorkspaceScriptsSnapshot[] = []

  constructor(readonly id: number) {
    super()
  }

  isDestroyed(): boolean {
    return false
  }

  send(channel: string, payload: WorkspaceScriptsSnapshot): void {
    if (channel === 'scripts:changed') this.sentSnapshots.push(payload)
  }
}

interface ScriptsHarness {
  ipcMain: FakeIpcMain
  scripts: WorkspaceScript[]
  liveSessions: TerminalSessionTarget[]
  created: Array<{ target: TerminalSessionTarget; command: string; cwd: string }>
  destroyed: TerminalSessionTarget[]
  emitSessionEvent: (event: WorkspaceScriptSessionEvent) => void
}

function loadScriptsIPC(ipcMain: FakeIpcMain, harness: Omit<ScriptsHarness, 'ipcMain'>): typeof import('./scripts') {
  const nodeRequire = createRequire(import.meta.url)
  const nodeModule = nodeRequire('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
    _cache: Record<string, unknown>
  }
  const originalLoad = nodeModule._load
  const modulePath = nodeRequire.resolve('./scripts.ts')
  const fakeElectron = { ipcMain, dialog: {}, BrowserWindow: { getAllWindows: () => [] } }

  nodeModule._load = function(request, parent, isMain) {
    if (request === 'electron') return fakeElectron
    if (request === './terminal') {
      return {
        createWorkspaceScriptSession: async () => { throw new Error('createSession injection was not used') },
        destroyWorkspaceScriptSession: async () => undefined,
        listWorkspaceScriptSessions: async () => [],
        subscribeWorkspaceScriptSessionEvents: (listener: (event: WorkspaceScriptSessionEvent) => void) => {
          harness.emitSessionEvent = listener
          return () => undefined
        },
      }
    }
    if (request === './workspace') return { getWorkspaceAgentConfigById: async () => null }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    delete nodeModule._cache[modulePath]
    return nodeRequire(modulePath) as typeof import('./scripts')
  } finally {
    nodeModule._load = originalLoad
  }
}

function createHarness(): ScriptsHarness {
  const ipcMain = new FakeIpcMain()
  const scripts: WorkspaceScript[] = [
    {
      id: 'package:.:dev',
      name: 'dev',
      command: 'npm run dev',
      source: 'package',
      cwd: '/workspace',
    },
    {
      id: 'custom:check',
      name: 'check',
      command: 'pnpm test',
      source: 'custom',
      cwd: '/workspace',
    },
  ]
  const liveSessions: TerminalSessionTarget[] = []
  const created: ScriptsHarness['created'] = []
  const destroyed: TerminalSessionTarget[] = []
  let emitSessionEvent = (_event: WorkspaceScriptSessionEvent): void => undefined
  const harness: ScriptsHarness = {
    ipcMain,
    scripts,
    liveSessions,
    created,
    destroyed,
    get emitSessionEvent() { return emitSessionEvent },
    set emitSessionEvent(listener) { emitSessionEvent = listener },
  }

  const { registerScriptsIPC } = loadScriptsIPC(ipcMain, harness)
  registerScriptsIPC({
    ipc: ipcMain as never,
    workspaceConfig: async () => ({
      rootFolderPath: '/workspace',
      sourceControlRepositoryPaths: ['packages/web'],
      customScripts: [],
    }),
    discover: async () => scripts,
    createSession: async (target, spec) => {
      created.push({ target, command: spec.command, cwd: spec.cwd })
      if (!liveSessions.some((session) => session.tileId === target.tileId)) liveSessions.push(target)
      return terminalResult(target)
    },
    destroySession: async (target) => {
      destroyed.push(target)
      const index = liveSessions.findIndex((session) => session.workspaceId === target.workspaceId && session.tileId === target.tileId)
      if (index >= 0) liveSessions.splice(index, 1)
      emitSessionEvent({ type: 'destroyed', target })
    },
    listSessions: async (workspaceId) => liveSessions.filter((session) => session.workspaceId === workspaceId),
    subscribeSessionEvents: (listener) => {
      emitSessionEvent = listener
      return () => undefined
    },
  })
  return harness
}

function terminalResult(target: TerminalSessionTarget, exitEvent?: { exitCode: number }): TerminalCreateResult {
  return {
    identity: { ...target, generation: 1 },
    cols: 120,
    rows: 30,
    buffer: '',
    ...(exitEvent ? { exitEvent } : {}),
  }
}

async function flushSnapshots(): Promise<void> {
  await new Promise<void>((resolvePromise) => setImmediate(resolvePromise))
  await new Promise<void>((resolvePromise) => setImmediate(resolvePromise))
}

test('snapshot combines discovered scripts and known executions', async () => {
  const harness = createHarness()
  const sender = new FakeWebContents(1)
  const run = await harness.ipcMain.call('scripts:run', sender, {
    workspaceId: 'workspace-a',
    scriptId: 'package:.:dev',
  }) as WorkspaceScriptRun

  const snapshot = await harness.ipcMain.call('scripts:snapshot', sender, 'workspace-a') as WorkspaceScriptsSnapshot
  assert.deepEqual(snapshot.scripts.map((script) => script.id), ['package:.:dev', 'custom:check'])
  assert.deepEqual(snapshot.runs, [run])
})

test('run rejects unknown script ids and launches only the discovered command and cwd', async () => {
  const harness = createHarness()
  const sender = new FakeWebContents(2)

  await assert.rejects(
    () => harness.ipcMain.call('scripts:run', sender, { workspaceId: 'workspace-a', scriptId: 'custom:missing' }) as Promise<unknown>,
    /not found/,
  )
  await harness.ipcMain.call('scripts:run', sender, {
    workspaceId: 'workspace-a',
    scriptId: 'custom:check',
    command: 'rm -rf /',
    cwd: '/untrusted',
  })

  assert.deepEqual(harness.created, [{
    target: { workspaceId: 'workspace-a', tileId: workspaceScriptTileId('custom:check') },
    command: 'pnpm test',
    cwd: '/workspace',
  }])
})

test('run returns an existing running record without relaunching', async () => {
  const harness = createHarness()
  const sender = new FakeWebContents(3)
  const first = await harness.ipcMain.call('scripts:run', sender, {
    workspaceId: 'workspace-a',
    scriptId: 'package:.:dev',
  }) as WorkspaceScriptRun
  const second = await harness.ipcMain.call('scripts:run', sender, {
    workspaceId: 'workspace-a',
    scriptId: 'package:.:dev',
  }) as WorkspaceScriptRun

  assert.deepEqual(second, first)
  assert.equal(harness.created.length, 1)
})

test('run destroys an exited session and starts a replacement', async () => {
  const harness = createHarness()
  const sender = new FakeWebContents(4)
  const first = await harness.ipcMain.call('scripts:run', sender, {
    workspaceId: 'workspace-a',
    scriptId: 'package:.:dev',
  }) as WorkspaceScriptRun

  harness.liveSessions.splice(0)
  harness.emitSessionEvent({
    type: 'exit',
    target: { workspaceId: 'workspace-a', tileId: first.tileId },
    exitEvent: { exitCode: 3 },
  })
  const ended = await harness.ipcMain.call('scripts:snapshot', sender, 'workspace-a') as WorkspaceScriptsSnapshot
  assert.equal(ended.runs[0].state, 'exited')
  assert.equal(ended.runs[0].exitCode, 3)

  const replacement = await harness.ipcMain.call('scripts:run', sender, {
    workspaceId: 'workspace-a',
    scriptId: 'package:.:dev',
  }) as WorkspaceScriptRun
  assert.equal(replacement.state, 'running')
  assert.equal(harness.destroyed.length, 1)
  assert.equal(harness.created.length, 2)
})

test('runCommand trims the command, uses the workspace root, and survives live-session reconciliation', async () => {
  const harness = createHarness()
  const sender = new FakeWebContents(12)
  const run = await harness.ipcMain.call('scripts:runCommand', sender, {
    workspaceId: 'workspace-a',
    command: '  git pull  ',
  }) as WorkspaceScriptRun

  assert.match(run.scriptId, /^adhoc:/)
  assert.equal(run.command, 'git pull')
  assert.deepEqual(harness.created, [{
    target: { workspaceId: 'workspace-a', tileId: workspaceScriptTileId(run.scriptId) },
    command: 'git pull',
    cwd: resolve('/workspace'),
  }])

  const snapshot = await harness.ipcMain.call('scripts:snapshot', sender, 'workspace-a') as WorkspaceScriptsSnapshot
  assert.equal(snapshot.runs[0].scriptId, run.scriptId)
  assert.equal(snapshot.runs[0].command, 'git pull')
})

test('runCommand rejects empty, multiline, and overlong commands', async () => {
  const harness = createHarness()
  const sender = new FakeWebContents(13)
  const invalidCommands = ['  ', 'git pull\nnpm install', 'x'.repeat(4097)]

  for (const command of invalidCommands) {
    await assert.rejects(
      () => harness.ipcMain.call('scripts:runCommand', sender, {
        workspaceId: 'workspace-a',
        command,
      }) as Promise<unknown>,
      /Invalid workspace command/,
    )
  }
  assert.equal(harness.created.length, 0)
})

test('run re-executes a known ad-hoc command with its existing tile id', async () => {
  const harness = createHarness()
  const sender = new FakeWebContents(14)
  const first = await harness.ipcMain.call('scripts:runCommand', sender, {
    workspaceId: 'workspace-a',
    command: 'npm install foo',
  }) as WorkspaceScriptRun
  harness.liveSessions.splice(0)
  harness.emitSessionEvent({
    type: 'exit',
    target: { workspaceId: 'workspace-a', tileId: first.tileId },
    exitEvent: { exitCode: 0 },
  })

  const replacement = await harness.ipcMain.call('scripts:run', sender, {
    workspaceId: 'workspace-a',
    scriptId: first.scriptId,
  }) as WorkspaceScriptRun

  assert.equal(replacement.scriptId, first.scriptId)
  assert.equal(replacement.tileId, first.tileId)
  assert.equal(replacement.command, 'npm install foo')
  assert.deepEqual(harness.created.map((entry) => entry.command), ['npm install foo', 'npm install foo'])
  assert.equal(harness.destroyed.length, 1)
})

test('stop discards an ad-hoc run and its definition', async () => {
  const harness = createHarness()
  const sender = new FakeWebContents(15)
  const run = await harness.ipcMain.call('scripts:runCommand', sender, {
    workspaceId: 'workspace-a',
    command: 'git pull',
  }) as WorkspaceScriptRun

  await harness.ipcMain.call('scripts:stop', sender, {
    workspaceId: 'workspace-a',
    scriptId: run.scriptId,
  })
  const snapshot = await harness.ipcMain.call('scripts:snapshot', sender, 'workspace-a') as WorkspaceScriptsSnapshot

  assert.deepEqual(snapshot.runs, [])
  await assert.rejects(
    () => harness.ipcMain.call('scripts:run', sender, {
      workspaceId: 'workspace-a',
      scriptId: run.scriptId,
    }) as Promise<unknown>,
    /Workspace script was not found/,
  )
})

test('the ad-hoc run limit discards the oldest exited session', async () => {
  const harness = createHarness()
  const sender = new FakeWebContents(16)
  const firstEight: WorkspaceScriptRun[] = []

  for (let index = 0; index < 8; index += 1) {
    const run = await harness.ipcMain.call('scripts:runCommand', sender, {
      workspaceId: 'workspace-a',
      command: `echo ${index}`,
    }) as WorkspaceScriptRun
    firstEight.push(run)
    harness.liveSessions.splice(harness.liveSessions.findIndex((session) => session.tileId === run.tileId), 1)
    harness.emitSessionEvent({
      type: 'exit',
      target: { workspaceId: 'workspace-a', tileId: run.tileId },
      exitEvent: { exitCode: 0 },
    })
  }

  const newest = await harness.ipcMain.call('scripts:runCommand', sender, {
    workspaceId: 'workspace-a',
    command: 'echo newest',
  }) as WorkspaceScriptRun
  const snapshot = await harness.ipcMain.call('scripts:snapshot', sender, 'workspace-a') as WorkspaceScriptsSnapshot

  assert.equal(harness.destroyed.some((target) => target.tileId === firstEight[0].tileId), true)
  assert.equal(snapshot.runs.length, 8)
  assert.equal(snapshot.runs.some((run) => run.scriptId === firstEight[0].scriptId), false)
  assert.equal(snapshot.runs.some((run) => run.scriptId === newest.scriptId), true)
})

test('stop destroys a run and emits a changed snapshot', async () => {
  const harness = createHarness()
  const sender = new FakeWebContents(5)
  const token = harness.ipcMain.call('scripts:subscribe', sender, 'workspace-a') as string
  await harness.ipcMain.call('scripts:run', sender, { workspaceId: 'workspace-a', scriptId: 'custom:check' })
  await harness.ipcMain.call('scripts:stop', sender, { workspaceId: 'workspace-a', scriptId: 'custom:check' })
  await flushSnapshots()

  assert.equal(harness.destroyed.length, 1)
  assert.ok(sender.sentSnapshots.some((snapshot) => snapshot.runs.length === 0))
  assert.equal(await harness.ipcMain.call('scripts:unsubscribe', sender, token), true)
})

test('a script exit records its exit code and emits a changed snapshot', async () => {
  const harness = createHarness()
  const sender = new FakeWebContents(6)
  harness.ipcMain.call('scripts:subscribe', sender, 'workspace-a')
  const run = await harness.ipcMain.call('scripts:run', sender, { workspaceId: 'workspace-a', scriptId: 'custom:check' }) as WorkspaceScriptRun
  harness.liveSessions.splice(0)
  harness.emitSessionEvent({
    type: 'exit',
    target: { workspaceId: 'workspace-a', tileId: run.tileId },
    exitEvent: { exitCode: 7 },
  })
  await flushSnapshots()

  const snapshot = await harness.ipcMain.call('scripts:snapshot', sender, 'workspace-a') as WorkspaceScriptsSnapshot
  assert.equal(snapshot.runs[0].state, 'exited')
  assert.equal(snapshot.runs[0].exitCode, 7)
  assert.ok(sender.sentSnapshots.some((entry) => entry.runs[0]?.exitCode === 7))
})

test('external destruction removes a run and emits a changed snapshot', async () => {
  const harness = createHarness()
  const sender = new FakeWebContents(11)
  harness.ipcMain.call('scripts:subscribe', sender, 'workspace-a')
  const run = await harness.ipcMain.call('scripts:run', sender, { workspaceId: 'workspace-a', scriptId: 'custom:check' }) as WorkspaceScriptRun
  harness.liveSessions.splice(0)
  harness.emitSessionEvent({
    type: 'destroyed',
    target: { workspaceId: 'workspace-a', tileId: run.tileId },
  })
  await flushSnapshots()

  const snapshot = await harness.ipcMain.call('scripts:snapshot', sender, 'workspace-a') as WorkspaceScriptsSnapshot
  assert.equal(snapshot.runs.length, 0)
  assert.ok(sender.sentSnapshots.some((entry) => entry.runs.length === 0))
})

test('snapshot reconciles orphan script sessions and stop accepts their tile id', async () => {
  const harness = createHarness()
  const orphan = { workspaceId: 'workspace-a', tileId: `script-${'a'.repeat(24)}` }
  harness.liveSessions.push(orphan)
  const sender = new FakeWebContents(7)

  const snapshot = await harness.ipcMain.call('scripts:snapshot', sender, 'workspace-a') as WorkspaceScriptsSnapshot
  assert.deepEqual(snapshot.runs, [{
    scriptId: orphan.tileId,
    tileId: orphan.tileId,
    state: 'running',
    startedAt: snapshot.runs[0].startedAt,
  }])
  await assert.rejects(
    () => harness.ipcMain.call('scripts:run', sender, { workspaceId: 'workspace-a', scriptId: orphan.tileId }) as Promise<unknown>,
    /not found/,
  )
  await harness.ipcMain.call('scripts:stop', sender, { workspaceId: 'workspace-a', scriptId: orphan.tileId })
  assert.deepEqual(harness.destroyed, [orphan])
})

test('IPC rejects invalid input and subscription tokens are sender-bound', async () => {
  const harness = createHarness()
  const sender = new FakeWebContents(8)
  const otherSender = new FakeWebContents(9)

  await assert.rejects(
    () => harness.ipcMain.call('scripts:snapshot', sender, '../workspace') as Promise<unknown>,
    /Invalid scripts workspace id/,
  )
  await assert.rejects(
    () => harness.ipcMain.call('scripts:run', sender, null) as Promise<unknown>,
    /Invalid workspace script input/,
  )
  await assert.rejects(
    () => harness.ipcMain.call('scripts:run', sender, { workspaceId: 'workspace-a', scriptId: 'bad\nscript' }) as Promise<unknown>,
    /Invalid workspace script id/,
  )
  const token = harness.ipcMain.call('scripts:subscribe', sender, 'workspace-a') as string
  assert.equal(await harness.ipcMain.call('scripts:unsubscribe', otherSender, token), false)
  assert.equal(await harness.ipcMain.call('scripts:unsubscribe', sender, token), true)

  const destroyedSender = new FakeWebContents(10)
  const destroyedToken = harness.ipcMain.call('scripts:subscribe', destroyedSender, 'workspace-a') as string
  destroyedSender.emit('destroyed')
  assert.equal(await harness.ipcMain.call('scripts:unsubscribe', destroyedSender, destroyedToken), false)
})
