import assert from 'node:assert/strict'
import test from 'node:test'
import { computeAgentsViewLayout, computeAgentsViewStacks } from './agentsViewLayout'

test('returns no cells for an empty view and one full cell for one session', () => {
  assert.deepEqual(computeAgentsViewLayout(0), { columns: 0, rows: 0, stacks: [], placements: [] })
  assert.deepEqual(computeAgentsViewLayout(1), {
    columns: 1,
    rows: 1,
    stacks: [1],
    placements: [{ column: 1, rowStart: 1, rowSpan: 1 }],
  })
})

test('adds columns up to three, then stacks into the rightmost columns', () => {
  assert.deepEqual(computeAgentsViewStacks(2), [1, 1])
  assert.deepEqual(computeAgentsViewStacks(3), [1, 1, 1])
  assert.deepEqual(computeAgentsViewStacks(4), [1, 1, 2])
  assert.deepEqual(computeAgentsViewStacks(5), [1, 2, 2])
})

test('moves to four balanced columns from six sessions on', () => {
  assert.deepEqual(computeAgentsViewStacks(6), [1, 1, 2, 2])
  assert.deepEqual(computeAgentsViewStacks(7), [1, 2, 2, 2])
  assert.deepEqual(computeAgentsViewStacks(8), [2, 2, 2, 2])
  assert.deepEqual(computeAgentsViewStacks(9), [2, 2, 2, 3])
  assert.deepEqual(computeAgentsViewStacks(16), [4, 4, 4, 4])
  assert.deepEqual(computeAgentsViewStacks(17), [4, 4, 4, 5])
})

test('fills each column top to bottom with spans that cover the shared rows', () => {
  assert.deepEqual(computeAgentsViewLayout(5), {
    columns: 3,
    rows: 2,
    stacks: [1, 2, 2],
    placements: [
      { column: 1, rowStart: 1, rowSpan: 2 },
      { column: 2, rowStart: 1, rowSpan: 1 },
      { column: 2, rowStart: 2, rowSpan: 1 },
      { column: 3, rowStart: 1, rowSpan: 1 },
      { column: 3, rowStart: 2, rowSpan: 1 },
    ],
  })

  const nine = computeAgentsViewLayout(9)
  assert.equal(nine.rows, 6)
  assert.deepEqual(nine.placements.at(-1), { column: 4, rowStart: 5, rowSpan: 2 })
  assert.deepEqual(nine.placements[0], { column: 1, rowStart: 1, rowSpan: 3 })
})
