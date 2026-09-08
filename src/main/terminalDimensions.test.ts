import assert from 'node:assert/strict'
import test from 'node:test'

import { resizeTerminalDimensions, type TerminalDimensions } from './terminalDimensions'

function dimensions(cols = 80, rows = 24): TerminalDimensions {
  return { cols, rows }
}

test('returns the current dimensions without resizing invalid values', () => {
  const current = dimensions()
  const resizeCalls: Array<[number, number]> = []
  const resize = (cols: number, rows: number) => resizeCalls.push([cols, rows])

  for (const [cols, rows] of [
    [Number.NaN, 24],
    [Number.POSITIVE_INFINITY, 24],
    [80, Number.NEGATIVE_INFINITY],
    [-1, 24],
    [80, 0],
    [0.5, 24],
  ]) {
    assert.strictEqual(resizeTerminalDimensions(current, resize, cols, rows), current)
  }

  assert.deepEqual(resizeCalls, [])
})

test('normalizes dimensions and calls PTY resize before returning new state', () => {
  const current = dimensions()
  const events: string[] = []
  const next = resizeTerminalDimensions(
    current,
    (cols, rows) => events.push(`resize:${cols}x${rows}`),
    132.8,
    41.9,
  )

  assert.deepEqual(next, dimensions(132, 41))
  assert.notStrictEqual(next, current)
  assert.deepEqual(events, ['resize:132x41'])
})

test('propagates PTY resize errors without changing current dimensions', () => {
  const current = dimensions()
  const error = new Error('resize failed')

  assert.throws(
    () => resizeTerminalDimensions(current, () => { throw error }, 132, 41),
    error,
  )
  assert.deepEqual(current, dimensions())
})
