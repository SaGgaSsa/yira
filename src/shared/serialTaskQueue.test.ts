import assert from 'node:assert/strict'
import test from 'node:test'
import { createSerialTaskQueue } from './serialTaskQueue'

test('serializes preparation callbacks after a timed-out caller retries', async () => {
  const queue = createSerialTaskQueue()
  const calls: string[] = []
  let releaseFirst: (() => void) | undefined
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })

  const first = queue.run(async () => {
    calls.push('first:start')
    await firstGate
    calls.push('first:end')
  })
  const second = queue.run(async () => {
    calls.push('second:start')
    calls.push('second:end')
  })

  await Promise.resolve()
  assert.deepEqual(calls, ['first:start'])
  releaseFirst?.()
  await Promise.all([first, second])
  assert.deepEqual(calls, ['first:start', 'first:end', 'second:start', 'second:end'])
})

test('continues with the next task after a previous task rejects', async () => {
  const queue = createSerialTaskQueue()
  const first = queue.run(async () => {
    throw new Error('failed')
  })
  const second = queue.run(async () => 'completed')

  await assert.rejects(first, /failed/)
  assert.equal(await second, 'completed')
})
