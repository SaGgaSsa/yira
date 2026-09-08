import assert from 'node:assert/strict'
import test from 'node:test'
import {
  latestWorkspaceSelectionTimestamp,
  normalizeWorkspaceSelectionMetadata,
  nextWorkspaceSelectionTimestamp,
} from './workspaceSelection'

test('normalizes selection metadata and drops corrupt legacy values', () => {
  assert.deepEqual(
    normalizeWorkspaceSelectionMetadata({ pinned: true, lastSelectedAt: 123 }),
    { pinned: true, lastSelectedAt: 123 },
  )
  assert.deepEqual(
    normalizeWorkspaceSelectionMetadata({ pinned: 'true', lastSelectedAt: Number.NaN }),
    {},
  )
  assert.deepEqual(
    normalizeWorkspaceSelectionMetadata({ pinned: false, lastSelectedAt: -1 }),
    { pinned: false },
  )
  assert.deepEqual(
    normalizeWorkspaceSelectionMetadata({ pinned: true, lastSelectedAt: 1.5 }),
    { pinned: true },
  )
})

test('finds the latest valid persisted selection timestamp', () => {
  assert.equal(
    latestWorkspaceSelectionTimestamp([
      { lastSelectedAt: 10 },
      { lastSelectedAt: 'invalid' },
      { lastSelectedAt: 25 },
      { lastSelectedAt: Number.POSITIVE_INFINITY },
    ]),
    25,
  )
  assert.equal(latestWorkspaceSelectionTimestamp([]), 0)
})

test('selection timestamps are strictly monotonic when the clock does not advance', () => {
  const first = nextWorkspaceSelectionTimestamp(0, 1_700_000_000_000)
  const second = nextWorkspaceSelectionTimestamp(first, 1_700_000_000_000)
  const third = nextWorkspaceSelectionTimestamp(second, 1_699_000_000_000)

  assert.equal(first, 1_700_000_000_000)
  assert.equal(second, first + 1)
  assert.equal(third, second + 1)
})
