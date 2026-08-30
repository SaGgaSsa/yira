import assert from 'node:assert/strict'
import test from 'node:test'

import { TerminalDelivery } from './terminalDelivery'
import type { TerminalExitEvent } from '@shared/types'
import type { TerminalSessionIdentity } from '@shared/terminalSessionIdentity'

interface SentMessage {
  channel: string
  payload: unknown
}

const identity: TerminalSessionIdentity = {
  workspaceId: 'workspace-a',
  tileId: 'tile-a',
  generation: 1,
}

function createListener(messages: SentMessage[], destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    send: (channel: string, payload: unknown) => messages.push({ channel, payload }),
  }
}

test('delivers ordered data and exit events for one terminal identity', () => {
  const sent: SentMessage[] = []
  const delivery = new TerminalDelivery(identity, 500_000)
  const listener = createListener(sent)

  assert.equal(delivery.attach(identity, listener), true)
  delivery.append('final output')
  delivery.recordExit({ exitCode: 130 })

  assert.deepEqual(sent, [
    { channel: 'terminal:data:workspace-a:tile-a:1', payload: 'final output' },
    { channel: 'terminal:exit:workspace-a:tile-a:1', payload: { exitCode: 130 } },
  ])
  assert.deepEqual(delivery.snapshot(), {
    identity,
    buffer: 'final output',
    exitEvent: { exitCode: 130 },
  })
})

test('rejects stale generations when attaching or detaching listeners', () => {
  const delivery = new TerminalDelivery(identity, 500_000)
  const listener = createListener([])
  const staleIdentity = { ...identity, generation: 2 }

  assert.equal(delivery.attach(staleIdentity, listener), false)
  assert.equal(delivery.detach(staleIdentity, listener), false)
  assert.equal(delivery.detach(identity, listener), false)
})

test('replays a retained exit to a later listener', () => {
  const sent: SentMessage[] = []
  const delivery = new TerminalDelivery(identity, 500_000)
  const exitEvent: TerminalExitEvent = { exitCode: 0, signal: 1 }

  delivery.recordExit(exitEvent)
  const listener = createListener(sent)
  assert.equal(delivery.attach(identity, listener), true)

  assert.deepEqual(sent, [{
    channel: 'terminal:exit:workspace-a:tile-a:1',
    payload: exitEvent,
  }])
  assert.deepEqual(delivery.snapshot().exitEvent, exitEvent)
})

test('retains only the configured trailing buffer length', () => {
  const delivery = new TerminalDelivery(identity, 500_000)

  delivery.append('a'.repeat(500_001))

  assert.equal(delivery.snapshot().buffer.length, 500_000)
  assert.equal(delivery.snapshot().buffer, 'a'.repeat(500_000))
})

test('disposal is idempotent and suppresses later delivery', () => {
  const sent: SentMessage[] = []
  const delivery = new TerminalDelivery(identity, 500_000)
  const listener = createListener(sent)

  assert.equal(delivery.attach(identity, listener), true)
  delivery.dispose()
  delivery.dispose()
  delivery.append('late data')
  delivery.recordExit({ exitCode: 0 })
  assert.equal(delivery.attach(identity, createListener(sent)), false)

  assert.deepEqual(sent, [])
})

test('removes a destroyed listener without delivering data to it', () => {
  const sent: SentMessage[] = []
  const delivery = new TerminalDelivery(identity, 500_000)
  const destroyedListener = createListener(sent, true)

  assert.equal(delivery.attach(identity, destroyedListener), true)
  delivery.append('ignored data')

  assert.deepEqual(sent, [])
  assert.equal(delivery.detach(identity, destroyedListener), false)
})
