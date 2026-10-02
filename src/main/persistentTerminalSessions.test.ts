import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import type {
  TerminalDaemonAlert,
  TerminalDaemonEvent,
  TerminalDaemonMethods,
  TerminalDaemonSnapshot,
} from '@shared/terminalDaemonProtocol'
import type { TerminalSessionIdentity, TerminalSessionTarget } from '@shared/terminalSessionIdentity'
import {
  PersistentTerminalSessions,
  type PersistentTerminalSubscriber,
  type PersistentTerminalTransport,
} from './persistentTerminalSessions'
import { AgentSessionRegistry } from './agents/registry'

const identity: TerminalSessionIdentity = { workspaceId: 'workspace-a', tileId: 'tile-a', generation: 7 }
const target: TerminalSessionTarget = { workspaceId: identity.workspaceId, tileId: identity.tileId }

function snapshot(overrides: Partial<TerminalDaemonSnapshot> = {}): TerminalDaemonSnapshot {
  return {
    identity: { ...identity },
    cols: 80,
    rows: 24,
    buffer: 'restored screen',
    sequence: 1,
    pid: 1234,
    ...overrides,
  }
}

class FakeSender extends EventEmitter implements PersistentTerminalSubscriber {
  readonly messages: Array<{ channel: string; payload: unknown }> = []

  private destroyed = false

  isDestroyed(): boolean {
    return this.destroyed
  }

  send(channel: string, payload: unknown): void {
    if (this.destroyed) throw new Error('sender destroyed')
    this.messages.push({ channel, payload })
  }

  destroy(): void {
    this.destroyed = true
    this.emit('destroyed')
  }
}

class FakeTransport implements PersistentTerminalTransport {
  readonly requests: Array<{ method: string; params: unknown }> = []

  private readonly eventListeners = new Set<(event: TerminalDaemonEvent) => void>()

  private readonly disconnectListeners = new Set<(error: Error) => void>()

  private readonly handlers = new Map<string, (params: unknown) => unknown>()

  disconnected = false

  onEvent(callback: (event: TerminalDaemonEvent) => void): () => void {
    this.eventListeners.add(callback)
    return () => this.eventListeners.delete(callback)
  }

  onDisconnect(callback: (error: Error) => void): () => void {
    this.disconnectListeners.add(callback)
    return () => this.disconnectListeners.delete(callback)
  }

  disconnect(): void {
    if (this.disconnected) return
    this.disconnected = true
    const error = new Error('transport disconnected')
    for (const listener of [...this.disconnectListeners]) listener(error)
  }

  request<M extends keyof TerminalDaemonMethods>(
    method: M,
    params: TerminalDaemonMethods[M]['params'],
  ): Promise<TerminalDaemonMethods[M]['result']> {
    this.requests.push({ method, params })
    const handler = this.handlers.get(method)
    const result = handler ? handler(params) : null
    return Promise.resolve(result) as Promise<TerminalDaemonMethods[M]['result']>
  }

  setHandler(method: string, handler: (params: unknown) => unknown): void {
    this.handlers.set(method, handler)
  }

  emitEvent(event: TerminalDaemonEvent): void {
    for (const listener of [...this.eventListeners]) listener(event)
  }

  requestCount(method: string): number {
    return this.requests.filter(request => request.method === method).length
  }
}

function createSessions(
  transport: FakeTransport,
  options: Partial<ConstructorParameters<typeof PersistentTerminalSessions>[0]> = {},
): PersistentTerminalSessions {
  return new PersistentTerminalSessions({ connect: async () => transport, ...options })
}

test('reattach checks attach before the builder and runs launch preparation once', async () => {
  const transport = new FakeTransport()
  const existing = snapshot({ sequence: 4, buffer: 'existing' })
  transport.setHandler('attach', () => existing)
  const sessions = createSessions(transport)
  let builds = 0

  const result = await sessions.create(target, () => {
    builds += 1
    return {
      target,
      executable: '/bin/sh',
      args: [],
      cwd: '/tmp',
      env: {},
      cols: 80,
      rows: 24,
      local: true,
      initialCommand: 'must not run',
    }
  })

  assert.equal(result.sequence, 4)
  assert.equal(builds, 0)
  assert.equal(transport.requestCount('attach'), 1)
  assert.equal(transport.requestCount('create'), 0)
})

test('lists attached terminal sessions with valid process ids', async () => {
  const transport = new FakeTransport()
  transport.setHandler('attach', () => snapshot({ pid: 1234 }))
  const sessions = createSessions(transport)

  await sessions.attach(target)

  assert.deepEqual(sessions.listRunningTerminalProcesses(), [
    { workspaceId: identity.workspaceId, tileId: identity.tileId, pid: 1234 },
  ])
})

test('does not list attached terminal sessions without a valid process id', async () => {
  const transport = new FakeTransport()
  transport.setHandler('attach', () => snapshot({ pid: 0 }))
  const sessions = createSessions(transport)

  await sessions.attach(target)

  assert.deepEqual(sessions.listRunningTerminalProcesses(), [])
})

test('rendererAttach captures interleaved events and sends them as live IPC', async () => {
  const transport = new FakeTransport()
  transport.setHandler('attach', () => snapshot())
  transport.setHandler('rendererAttach', () => {
    transport.emitEvent({
      event: 'data',
      identity: { ...identity },
      sequence: 2,
      data: '\u001b[6n',
    })
    transport.emitEvent({
      event: 'alert',
      identity: { ...identity },
      sequence: 3,
      alert: { provider: 'codex', event: 'permission', tileId: identity.tileId },
    })
    return snapshot({ sequence: 1 })
  })
  const sessions = createSessions(transport)
  await sessions.attach(target)
  const sender = new FakeSender()

  const result = await sessions.rendererAttach(identity, sender)

  assert.equal(result.sequence, 1)
  assert.deepEqual(sender.messages.map(message => message.channel), [
    `terminal:agentAlert:${identity.tileId}`,
    `terminal:data:${encodeURIComponent(identity.workspaceId)}:${encodeURIComponent(identity.tileId)}:${identity.generation}`,
    `terminal:agentAlert:${identity.tileId}`,
  ])
  assert.equal(sender.messages[1].payload, '\u001b[6n')
  assert.deepEqual(sender.messages[2].payload, {
    provider: 'codex',
    event: 'permission',
    tileId: identity.tileId,
    priority: 'intervention',
  })
})

test('last renderer detach and destroyed WebContents release renderer readiness', async () => {
  const transport = new FakeTransport()
  transport.setHandler('attach', () => snapshot())
  transport.setHandler('rendererAttach', () => snapshot())
  transport.setHandler('rendererDetach', () => null)
  const sessions = createSessions(transport)
  await sessions.attach(target)
  const sender = new FakeSender()

  await sessions.rendererAttach(identity, sender)
  sender.destroy()
  await new Promise<void>(resolve => setImmediate(resolve))

  assert.equal(transport.requestCount('rendererDetach'), 1)
})

test('does not leave daemon renderer readiness when the sender is already destroyed', async () => {
  const transport = new FakeTransport()
  transport.setHandler('attach', () => snapshot())
  transport.setHandler('rendererAttach', () => snapshot())
  transport.setHandler('rendererDetach', () => null)
  const sessions = createSessions(transport)
  await sessions.attach(target)
  const sender = new FakeSender()
  sender.destroy()

  await assert.rejects(sessions.rendererAttach(identity, sender), /renderer is destroyed/)
  assert.equal(transport.requestCount('rendererDetach'), 1)
})

test('a destroyed second sender does not detach a live first renderer', async () => {
  const transport = new FakeTransport()
  transport.setHandler('attach', () => snapshot())
  transport.setHandler('rendererAttach', () => snapshot())
  transport.setHandler('rendererDetach', () => null)
  const sessions = createSessions(transport)
  await sessions.attach(target)
  const first = new FakeSender()
  await sessions.rendererAttach(identity, first)
  const second = new FakeSender()
  second.destroy()

  await assert.rejects(sessions.rendererAttach(identity, second), /renderer is destroyed/)
  assert.equal(transport.requestCount('rendererDetach'), 0)
})

test('hydrate restores agent metadata and maps alert and exit state', async () => {
  const transport = new FakeTransport()
  const registry = new AgentSessionRegistry({ now: () => 1_700_000_000_000 })
  const agent = {
    provider: 'codex' as const,
    sessionId: 'resume-1',
    startedAt: '2024-01-01T00:00:00.000Z',
    surface: 'agents-view' as const,
    title: 'Restore this task',
    worktreeRoot: '/tmp/worktrees/agent-1',
    worktreeBranch: 'agents/restore',
    worktrees: [
      { path: '/tmp/worktrees/agent-1/repo-a', baseSha: 'abcdef123456' },
      { path: '/tmp/worktrees/agent-1/repo-b', baseSha: 'fedcba654321' },
    ],
  }
  const alert: TerminalDaemonAlert = { provider: 'codex', event: 'permission', tileId: identity.tileId }
  transport.setHandler('list', () => [snapshot({ agent, alert, exitEvent: { exitCode: 0 } })])
  transport.setHandler('attach', () => snapshot({ agent, alert, exitEvent: { exitCode: 0 } }))
  const alerts: Array<TerminalDaemonAlert | null> = []
  const sessions = createSessions(transport, {
    registry,
    onAgentAlert: (_identity, state) => alerts.push(state),
  })

  await sessions.hydrate()

  const restored = registry.get(identity.workspaceId, identity.tileId)
  assert.equal(restored?.sessionId, agent.sessionId)
  assert.equal(restored?.startedAt, agent.startedAt)
  assert.equal(restored?.surface, agent.surface)
  assert.equal(restored?.title, agent.title)
  assert.equal(restored?.worktreeRoot, agent.worktreeRoot)
  assert.equal(restored?.worktreeBranch, agent.worktreeBranch)
  assert.deepEqual(restored?.worktrees, agent.worktrees)
  assert.equal(restored?.status, 'exited')
  assert.equal(alerts.length, 1)
  assert.deepEqual(alerts[0], alert)
})

test('empty input does not restore working status or clear an agent alert', async () => {
  const transport = new FakeTransport()
  const registry = new AgentSessionRegistry({ now: () => 1_700_000_000_000 })
  const agent = { provider: 'codex' as const, sessionId: 'resume-2', startedAt: '2024-01-01T00:00:00.000Z' }
  transport.setHandler('attach', () => snapshot({ agent }))
  transport.setHandler('write', () => null)
  const sessions = createSessions(transport, { registry })
  await sessions.attach(target)
  await sessions.write(identity, 'input')
  registry.reportAgentAlert({ provider: 'codex', event: 'permission', tileId: identity.tileId }, identity.workspaceId)
  await sessions.write(identity, '')

  assert.equal(registry.get(identity.workspaceId, identity.tileId)?.status, 'needs-input')
  assert.equal(registry.alerts.has(identity.tileId), true)
})

test('terminal protocol replies do not restore working status or clear an agent alert', async () => {
  const transport = new FakeTransport()
  const registry = new AgentSessionRegistry({ now: () => 1_700_000_000_000 })
  const agent = { provider: 'codex' as const, sessionId: 'resume-3', startedAt: '2024-01-01T00:00:00.000Z' }
  transport.setHandler('attach', () => snapshot({ agent }))
  transport.setHandler('write', () => null)
  const sessions = createSessions(transport, { registry })
  await sessions.attach(target)
  registry.reportAgentAlert({ provider: 'codex', event: 'completed', tileId: identity.tileId }, identity.workspaceId)
  await sessions.write(identity, '\u001b[I')
  await sessions.write(identity, '\u001b[12;40R\u001b[O')

  assert.equal(registry.get(identity.workspaceId, identity.tileId)?.status, 'done')
  assert.equal(registry.alerts.has(identity.tileId), true)

  await sessions.write(identity, 'next\r')
  assert.equal(registry.get(identity.workspaceId, identity.tileId)?.status, 'working')
})

test('workspace deletion waits for an in-flight create and blocks a later create', async () => {
  const transport = new FakeTransport()
  transport.setHandler('attach', () => null)
  transport.setHandler('create', () => snapshot())
  transport.setHandler('destroyWorkspace', () => null)
  const sessions = createSessions(transport)
  let releaseBuild!: () => void
  let markBuildStarted!: () => void
  const buildGate = new Promise<void>(resolve => { releaseBuild = resolve })
  const builderStarted = new Promise<void>(resolve => { markBuildStarted = resolve })
  const creating = sessions.create(target, async () => {
    markBuildStarted()
    await buildGate
    return { target, executable: '/bin/sh', args: [], cwd: '/tmp', env: {}, cols: 80, rows: 24, local: true }
  })
  await builderStarted
  const deletion = sessions.destroyWorkspace(identity.workspaceId)
  await assert.rejects(
    sessions.create(target, () => ({ target, executable: '/bin/sh', args: [], cwd: '/tmp', env: {}, cols: 80, rows: 24, local: true })),
    /being deleted/,
  )
  releaseBuild()
  await creating
  await deletion
  assert.equal(transport.requestCount('destroyWorkspace'), 1)
})

test('closing workspace terminals allows creating them again', async () => {
  const transport = new FakeTransport()
  transport.setHandler('attach', () => null)
  transport.setHandler('create', () => snapshot())
  transport.setHandler('destroyWorkspace', () => null)
  const sessions = createSessions(transport)

  await sessions.closeWorkspace(identity.workspaceId)
  const created = await sessions.create(target, () => ({
    target,
    executable: '/bin/sh',
    args: [],
    cwd: '/tmp',
    env: {},
    cols: 80,
    rows: 24,
    local: true,
  }))

  assert.deepEqual(created.identity, identity)
  assert.equal(transport.requestCount('destroyWorkspace'), 1)
  assert.equal(transport.requestCount('create'), 1)
})

test('shutdown disconnects transport without destroying daemon sessions', async () => {
  const transport = new FakeTransport()
  transport.setHandler('attach', () => snapshot())
  const sessions = createSessions(transport)
  await sessions.attach(target)

  await sessions.shutdown()

  assert.equal(transport.disconnected, true)
  assert.equal(transport.requestCount('destroy'), 0)
  assert.equal(transport.requestCount('destroyCurrent'), 0)
  assert.equal(transport.requestCount('destroyWorkspace'), 0)
})

test('a transport disconnect is surfaced and does not silently create another daemon', async () => {
  const first = new FakeTransport()
  first.setHandler('attach', () => snapshot())
  let connectCalls = 0
  const sessions = new PersistentTerminalSessions({
    connect: async () => {
      connectCalls += 1
      return first
    },
  })
  await sessions.attach(target)
  first.disconnect()

  await assert.rejects(sessions.attach(target), /transport disconnected/)
  assert.equal(connectCalls, 1)
})

test('failed creation rejects without an unhandled cleanup promise', async () => {
  const sessions = new PersistentTerminalSessions({
    connect: async () => { throw new Error('cannot connect') },
  })

  await assert.rejects(
    sessions.create(target, () => {
      throw new Error('builder must not run')
    }),
    /cannot connect/,
  )
})

test('late events from a destroyed generation do not replace a newer record', async () => {
  const transport = new FakeTransport()
  const newer = snapshot({ identity: { ...identity, generation: identity.generation + 1 } })
  transport.setHandler('attach', () => newer)
  transport.setHandler('destroy', () => null)
  const alerts: Array<TerminalDaemonAlert | null> = []
  const sessions = createSessions(transport, {
    onAgentAlert: (_identity, alert) => alerts.push(alert),
  })
  await sessions.attach(target)
  transport.emitEvent({
    event: 'alert',
    identity: { ...identity },
    sequence: 20,
    alert: { provider: 'codex', event: 'permission', tileId: identity.tileId },
  })

  assert.deepEqual(alerts, [])
})
