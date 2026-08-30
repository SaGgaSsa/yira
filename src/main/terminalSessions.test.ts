import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TerminalSessionManager,
  type ManagedTerminalSession,
} from './terminalSessions'

class FakePty {
  killCalls = 0

  private exitCallback: (() => void) | undefined

  constructor(private readonly exitOnKill = false) {}

  kill(): void {
    this.killCalls += 1
    if (this.exitOnKill) this.exit()
  }

  onExit(callback: () => void): void {
    this.exitCallback = callback
  }

  exit(): void {
    this.exitCallback?.()
  }
}

function sessionFor(
  pty: FakePty,
  onProcessExit: () => void = () => undefined,
  onDispose: () => void = () => undefined,
): ManagedTerminalSession {
  return { pty, onCleanup: onDispose, onProcessExit, onDispose }
}

test('shuts down every session and counts immediate exit notifications', async () => {
  const first = new FakePty()
  const second = new FakePty()
  const manager = new TerminalSessionManager({ timeoutMs: 50 })

  manager.add('one', sessionFor(first))
  manager.add('two', sessionFor(second))

  const stopping = manager.shutdownAll()
  assert.equal(manager.isAcceptingSessions(), false)
  assert.equal(first.killCalls, 1)
  assert.equal(second.killCalls, 1)

  first.exit()
  second.exit()

  assert.deepEqual(await stopping, { requested: 2, exited: 2, timedOut: 0 })
  assert.equal(manager.get('one'), undefined)
  assert.equal(manager.get('two'), undefined)
})

test('resolves immediately when there are no sessions', async () => {
  const manager = new TerminalSessionManager({ timeoutMs: 50 })

  assert.deepEqual(await manager.shutdownAll(), { requested: 0, exited: 0, timedOut: 0 })
})

test('retains an exited session until shutdown counts its exit', async () => {
  const pty = new FakePty()
  const session = sessionFor(pty)
  const manager = new TerminalSessionManager({ timeoutMs: 50 })

  manager.add('one', session)
  pty.exit()

  assert.equal(manager.get('one'), session)
  assert.deepEqual(await manager.shutdownAll(), { requested: 1, exited: 1, timedOut: 0 })
  assert.equal(pty.killCalls, 1)
})

test('isolates kill failures and still asks other PTYs to exit', async () => {
  const failed = new FakePty()
  const healthy = new FakePty()
  failed.kill = () => {
    failed.killCalls += 1
    throw new Error('already exited')
  }
  const manager = new TerminalSessionManager({ timeoutMs: 5 })

  manager.add('failed', sessionFor(failed))
  manager.add('healthy', sessionFor(healthy))

  const stopping = manager.shutdownAll()
  healthy.exit()

  assert.deepEqual(await stopping, { requested: 2, exited: 1, timedOut: 1 })
  assert.equal(failed.killCalls, 1)
  assert.equal(healthy.killCalls, 1)
})

test('uses one global timeout for sessions that do not report exit', async () => {
  const first = new FakePty()
  const second = new FakePty()
  const manager = new TerminalSessionManager({ timeoutMs: 5 })

  manager.add('one', sessionFor(first))
  manager.add('two', sessionFor(second))

  assert.deepEqual(await manager.shutdownAll(), { requested: 2, exited: 0, timedOut: 2 })
  assert.equal(manager.get('one'), undefined)
  assert.equal(manager.get('two'), undefined)
})

test('shares one shutdown promise and sends one kill request per PTY', async () => {
  const first = new FakePty(true)
  const second = new FakePty(true)
  const manager = new TerminalSessionManager({ timeoutMs: 50 })

  manager.add('one', sessionFor(first))
  manager.add('two', sessionFor(second))

  const firstShutdown = manager.shutdownAll()
  const secondShutdown = manager.shutdownAll()

  assert.equal(firstShutdown, secondShutdown)
  assert.deepEqual(await firstShutdown, { requested: 2, exited: 2, timedOut: 0 })
  assert.equal(first.killCalls, 1)
  assert.equal(second.killCalls, 1)
})

test('rejects new sessions after shutdown begins', () => {
  const manager = new TerminalSessionManager({ timeoutMs: 50 })
  const existing = new FakePty()
  const late = new FakePty()

  manager.add('existing', sessionFor(existing))
  manager.shutdownAll()

  assert.throws(
    () => manager.add('late', sessionFor(late)),
    /shutting down/i,
  )
  assert.equal(manager.isAcceptingSessions(), false)
})

test('invokes disposal once when a session is removed before shutdown', async () => {
  const pty = new FakePty()
  let disposeCalls = 0
  const manager = new TerminalSessionManager({ timeoutMs: 5 })

  manager.add('one', sessionFor(pty, undefined, () => { disposeCalls += 1 }))
  pty.exit()

  assert.equal(manager.delete('one')?.session.pty, pty)
  await manager.shutdownAll()

  assert.equal(disposeCalls, 1)
  assert.equal(pty.killCalls, 0)
})

test('invokes disposal once for every session during shutdown', async () => {
  const first = new FakePty(true)
  const second = new FakePty(true)
  let disposeCalls = 0
  const manager = new TerminalSessionManager({ timeoutMs: 50 })
  const onDispose = () => { disposeCalls += 1 }

  manager.add('one', sessionFor(first, undefined, onDispose))
  manager.add('two', sessionFor(second, undefined, onDispose))

  await manager.shutdownAll()

  assert.equal(disposeCalls, 2)
})

test('does not kill a PTY twice when delete runs during shutdown', async () => {
  const pty = new FakePty()
  let disposeCalls = 0
  const manager = new TerminalSessionManager({ timeoutMs: 5 })

  manager.add('one', sessionFor(pty, undefined, () => { disposeCalls += 1 }))
  const stopping = manager.shutdownAll()
  const deletion = manager.delete('one')

  assert.ok(deletion)
  assert.equal(deletion.killRequested, true)
  if (deletion && !deletion.killRequested) deletion.session.pty.kill()

  assert.equal(pty.killCalls, 1)
  assert.equal(disposeCalls, 1)
  assert.deepEqual(await stopping, { requested: 1, exited: 0, timedOut: 1 })
})

test('delete leaves one kill for an ordinary terminal destroy', () => {
  const pty = new FakePty()
  let disposeCalls = 0
  const manager = new TerminalSessionManager({ timeoutMs: 5 })

  manager.add('one', sessionFor(pty, undefined, () => { disposeCalls += 1 }))
  const deletion = manager.delete('one')

  assert.ok(deletion)
  assert.equal(deletion.killRequested, false)
  if (!deletion.killRequested) deletion.session.pty.kill()

  assert.equal(pty.killCalls, 1)
  assert.equal(disposeCalls, 1)
})

test('calls process-exit once and keeps disposal separate and idempotent', async () => {
  const pty = new FakePty(true)
  let processExitCalls = 0
  let disposeCalls = 0
  const manager = new TerminalSessionManager({ timeoutMs: 50 })

  manager.add('one', sessionFor(
    pty,
    () => { processExitCalls += 1 },
    () => { disposeCalls += 1 },
  ))

  pty.exit()
  pty.exit()
  const stopping = manager.shutdownAll()
  manager.delete('one')

  assert.deepEqual(await stopping, { requested: 1, exited: 1, timedOut: 0 })
  assert.equal(processExitCalls, 1)
  assert.equal(disposeCalls, 1)
})

test('does not dispose an active session when its process exits', () => {
  const pty = new FakePty()
  let processExitCalls = 0
  let disposeCalls = 0
  const manager = new TerminalSessionManager({ timeoutMs: 5 })

  manager.add('one', sessionFor(
    pty,
    () => { processExitCalls += 1 },
    () => { disposeCalls += 1 },
  ))
  pty.exit()

  assert.equal(processExitCalls, 1)
  assert.equal(disposeCalls, 0)
  assert.equal(manager.get('one')?.pty, pty)
})

test('keeps the legacy cleanup callback idempotent', async () => {
  const pty = new FakePty()
  let cleanupCalls = 0
  const manager = new TerminalSessionManager({ timeoutMs: 5 })

  manager.add('one', {
    pty,
    onCleanup: () => { cleanupCalls += 1 },
  })
  pty.exit()
  manager.delete('one')
  await manager.shutdownAll()

  assert.equal(cleanupCalls, 1)
})
