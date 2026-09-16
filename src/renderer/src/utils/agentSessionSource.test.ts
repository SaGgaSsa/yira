import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentActiveSessionSnapshot } from '@shared/types'
import { createAgentSessionSource, type AgentSessionBridge } from './agentSessionSource'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => { resolve = accept })
  return { promise, resolve }
}

function harness() {
  const reads: ReturnType<typeof deferred<AgentActiveSessionSnapshot>>[] = []
  const tokens: ReturnType<typeof deferred<string | false>>[] = []
  const callbacks: Array<(snapshot: AgentActiveSessionSnapshot) => void> = []
  const released: string[] = []
  let removals = 0
  const bridge: AgentSessionBridge = {
    sessionsSnapshot: () => {
      const read = deferred<AgentActiveSessionSnapshot>()
      reads.push(read)
      return read.promise
    },
    subscribeSessions: () => {
      const token = deferred<string | false>()
      tokens.push(token)
      return token.promise
    },
    unsubscribeSessions: async (token) => { released.push(token); return true },
    onSessionsChanged: (callback) => { callbacks.push(callback); return () => { removals += 1 } },
  }
  return { source: createAgentSessionSource(() => bridge), reads, tokens, callbacks, released, removals: () => removals }
}

test('workspace, tile and agent panel consumers share one global subscription until the last unmount', async () => {
  const h = harness()
  let notifications = 0
  const removeWorkspace = h.source.subscribe(() => { notifications += 1 })
  const removePanel = h.source.subscribe(() => { notifications += 1 })
  assert.equal(h.tokens.length, 1)
  h.tokens[0].resolve('shared')
  await Promise.resolve()
  h.callbacks[0]({ sessions: [] })
  assert.equal(notifications, 2)
  removePanel()
  assert.deepEqual(h.released, [])
  removeWorkspace()
  assert.deepEqual(h.released, ['shared'])
  assert.equal(h.removals(), 1)
})

test('a late initial snapshot cannot overwrite a newer streamed status', async () => {
  const h = harness()
  const remove = h.source.subscribe(() => {})
  const newer: AgentActiveSessionSnapshot = { sessions: [{
    workspaceId: 'b', tileId: '1', sessionId: '1', provider: 'claude',
    status: 'needs-input', startedAt: '', lastActivityAt: '',
  }] }
  h.callbacks[0](newer)
  h.reads[0].resolve({ sessions: [] })
  await Promise.resolve()
  assert.equal(h.source.getSnapshot(), newer)
  remove()
})

test('late tokens and snapshots from a disposed subscription do not affect its replacement', async () => {
  const h = harness()
  const removeOld = h.source.subscribe(() => {})
  removeOld()
  const removeNew = h.source.subscribe(() => {})
  const current: AgentActiveSessionSnapshot = { sessions: [] }
  h.callbacks[1](current)
  h.tokens[0].resolve('old')
  h.reads[0].resolve({ sessions: [] })
  h.callbacks[0]({ sessions: [] })
  h.tokens[1].resolve('new')
  await Promise.resolve()
  assert.deepEqual(h.released, ['old'])
  assert.equal(h.source.getSnapshot(), current)
  removeNew()
  assert.deepEqual(h.released, ['old', 'new'])
})

test('initial snapshot works when no live event has arrived', async () => {
  const h = harness()
  const remove = h.source.subscribe(() => {})
  const initial: AgentActiveSessionSnapshot = { sessions: [] }
  h.reads[0].resolve(initial)
  await Promise.resolve()
  assert.equal(h.source.getSnapshot(), initial)
  remove()
})
