import assert from 'node:assert/strict'
import test from 'node:test'
import { createWindowBufferRegistry } from './windowBufferRegistry'

test('flush waits for every registered buffer callback', async () => {
  const registry = createWindowBufferRegistry()
  const calls: string[] = []
  registry.register('first', () => { calls.push('first') })
  registry.register('second', async () => {
    await Promise.resolve()
    calls.push('second')
  })

  await registry.flush()

  assert.deepEqual(calls.sort(), ['first', 'second'])
})

test('unregistered buffers are not flushed', async () => {
  const registry = createWindowBufferRegistry()
  let calls = 0
  const unregister = registry.register('file-tile', () => { calls += 1 })
  unregister()

  await registry.flush()

  assert.equal(calls, 0)
})

test('registering the same key replaces the stale callback without removing the replacement', async () => {
  const registry = createWindowBufferRegistry()
  const calls: string[] = []
  const unregisterStale = registry.register('file-tile', () => { calls.push('stale') })
  registry.register('file-tile', () => { calls.push('latest') })
  unregisterStale()

  await registry.flush()

  assert.deepEqual(calls, ['latest'])
})
