import assert from 'node:assert/strict'
import test from 'node:test'

import { createTerminalReplayController } from './terminalReplay'

interface ExitEvent {
  exitCode: number
  signal?: number
}

test('writes the snapshot before flushing live data and exit', () => {
  const order: string[] = []
  let completeWrite: (() => void) | undefined
  const controller = createTerminalReplayController({
    isCurrent: () => true,
    write: (data, callback) => {
      order.push(`write:${data}`)
      completeWrite = callback
    },
    onData: (data) => order.push(`data:${data}`),
    onExit: (event: ExitEvent) => order.push(`exit:${event.exitCode}`),
  })

  controller.onData('live')
  controller.onExit({ exitCode: 7 })
  controller.replay({ buffer: 'snapshot', exitEvent: { exitCode: 7 } })

  assert.deepEqual(order, ['write:snapshot'])
  completeWrite?.()

  assert.deepEqual(order, ['write:snapshot', 'data:live', 'exit:7'])
})

test('does not apply a stale write callback to a newer session', () => {
  const order: string[] = []
  let current = true
  let completeWrite: (() => void) | undefined
  const controller = createTerminalReplayController({
    isCurrent: () => current,
    write: (data, callback) => {
      order.push(`write:${data}`)
      completeWrite = callback
    },
    onData: (data) => order.push(`data:${data}`),
    onExit: (event: ExitEvent) => order.push(`exit:${event.exitCode}`),
  })

  controller.onData('old-live')
  controller.replay({ buffer: 'old-snapshot' })
  current = false
  completeWrite?.()

  assert.deepEqual(order, ['write:old-snapshot'])
})

test('silently finalizes an exit after queued output replay', () => {
  const order: string[] = []
  let completeWrite: (() => void) | undefined
  const controller = createTerminalReplayController({
    isCurrent: () => true,
    write: (_data, callback) => {
      completeWrite = callback
    },
    onData: (data) => order.push(`data:${data}`),
    onExit: (event: ExitEvent) => order.push(`finalize:${event.exitCode}`),
  })

  controller.replay({ buffer: 'snapshot' })
  controller.onData('queued-1')
  controller.onData('queued-2')
  controller.onExit({ exitCode: 0 })
  completeWrite?.()

  assert.deepEqual(order, ['data:queued-1', 'data:queued-2', 'finalize:0'])
})
