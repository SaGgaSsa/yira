import assert from 'node:assert/strict'
import test from 'node:test'

import { mapWithConcurrency } from './mapWithConcurrency'

test('maps every item while preserving input order', async () => {
  const items = [3, 1, 2]

  const result = await mapWithConcurrency(items, 2, async (value, index) => {
    await new Promise((resolve) => setTimeout(resolve, value))
    return `${index}:${value * 2}`
  })

  assert.deepEqual(result, ['0:6', '1:2', '2:4'])
})

test('never exceeds the requested concurrency', async () => {
  const items = Array.from({ length: 12 }, (_, index) => index)
  let active = 0
  let peak = 0

  const result = await mapWithConcurrency(items, 3, async (value) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active -= 1
    return value
  })

  assert.equal(peak, 3)
  assert.deepEqual(result, items)
})

test('returns an empty result without calling the mapper', async () => {
  let calls = 0

  const result = await mapWithConcurrency([], 4, async () => {
    calls += 1
    return 'unused'
  })

  assert.deepEqual(result, [])
  assert.equal(calls, 0)
})
