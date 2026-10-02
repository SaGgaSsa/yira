import assert from 'node:assert/strict'
import test from 'node:test'
import { computeAgentsViewGrid } from './agentsViewLayout'

test('returns no cells for an empty view and one cell for one session', () => {
  assert.deepEqual(computeAgentsViewGrid(0, 1200, 800), { columns: 0, rows: 0 })
  assert.deepEqual(computeAgentsViewGrid(1, 1200, 800), { columns: 1, rows: 1 })
})

test('places two sessions side by side in a landscape view and stacked in a portrait view', () => {
  assert.deepEqual(computeAgentsViewGrid(2, 1200, 800), { columns: 2, rows: 1 })
  assert.deepEqual(computeAgentsViewGrid(2, 600, 900), { columns: 1, rows: 2 })
})

test('uses a balanced two by two grid for four sessions', () => {
  assert.deepEqual(computeAgentsViewGrid(4, 1600, 900), { columns: 2, rows: 2 })
})

test('keeps the selected grid compact and close to the target terminal aspect', () => {
  const grid = computeAgentsViewGrid(5, 1600, 900)

  assert.ok(grid.columns * grid.rows >= 5)
  assert.ok((grid.columns - 1) * grid.rows < 5)
  assert.ok((grid.rows - 1) * grid.columns < 5)
  assert.deepEqual(grid, { columns: 3, rows: 2 })
})
