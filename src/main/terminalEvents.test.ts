import assert from 'node:assert/strict'
import test from 'node:test'

import { broadcastTerminalExit, TerminalExitState } from './terminalEvents'

test('broadcasts the terminal exit payload and removes destroyed listeners', () => {
  const messages: Array<{ channel: string; payload: unknown }> = []
  const activeListener = {
    isDestroyed: () => false,
    send: (channel: string, payload: unknown) => messages.push({ channel, payload }),
  }
  const destroyedListener = {
    isDestroyed: () => true,
    send: () => {
      throw new Error('destroyed listeners must not receive terminal exit events')
    },
  }
  const listeners = new Set([activeListener, destroyedListener])

  broadcastTerminalExit(listeners, 'ssh-terminal', { exitCode: 255, signal: 0 })

  assert.deepEqual(messages, [{
    channel: 'terminal:exit:ssh-terminal',
    payload: { exitCode: 255, signal: 0 },
  }])
  assert.deepEqual([...listeners], [activeListener])
})

test('isolates a terminal exit listener failure', () => {
  const messages: string[] = []
  const failedListener = {
    isDestroyed: () => false,
    send: () => {
      throw new Error('renderer closed during send')
    },
  }
  const activeListener = {
    isDestroyed: () => false,
    send: (channel: string) => messages.push(channel),
  }
  const listeners = new Set([failedListener, activeListener])

  assert.doesNotThrow(() => {
    broadcastTerminalExit(listeners, 'ssh-terminal', { exitCode: 255 })
  })
  assert.deepEqual(messages, ['terminal:exit:ssh-terminal'])
  assert.deepEqual([...listeners], [activeListener])
})

test('retains and broadcasts an exit that happens before listeners are attached', () => {
  const messages: unknown[] = []
  const state = new TerminalExitState('ssh-terminal')

  state.record({ exitCode: 255 })
  state.attach(new Set([{
    isDestroyed: () => false,
    send: (_channel: string, payload: unknown) => messages.push(payload),
  }]))

  assert.deepEqual(state.event, { exitCode: 255 })
  assert.deepEqual(messages, [{ exitCode: 255 }])
})

test('retains an exit without listeners for a later terminal reattach', () => {
  const state = new TerminalExitState('ssh-terminal')
  const listeners = new Set<{
    isDestroyed(): boolean
    send(channel: string, payload: unknown): void
  }>()

  state.attach(listeners)
  state.record({ exitCode: 0, signal: 1 })

  assert.deepEqual(state.event, { exitCode: 0, signal: 1 })
})
