import assert from 'node:assert/strict'
import test from 'node:test'
import type { WorkspaceMetadata } from '@shared/types'
import {
  mergeWorkspaceSelectionResult,
  setWorkspacePinnedOptimistically,
} from './workspaceSelectionActions'

const workspaces = [
  { id: 'alpha', name: 'Alpha', pinned: false, lastSelectedAt: 10 },
  { id: 'beta', name: 'Beta', pinned: true, lastSelectedAt: 20 },
] as WorkspaceMetadata[]

test('applies only the requested selection field', () => {
  const result = mergeWorkspaceSelectionResult(
    workspaces,
    { ...workspaces[0], pinned: true, lastSelectedAt: 30 },
    'lastSelectedAt',
  )

  assert.equal(result[0].lastSelectedAt, 30)
  assert.equal(result[0].pinned, false)
  assert.equal(result[1], workspaces[1])
})

test('does not move selection recency backwards after an old response', () => {
  const result = mergeWorkspaceSelectionResult(
    workspaces,
    { ...workspaces[0], pinned: true, lastSelectedAt: 5 },
    'lastSelectedAt',
  )

  assert.equal(result[0], workspaces[0])
})

test('applies only pin state from a pin response', () => {
  const result = mergeWorkspaceSelectionResult(
    workspaces,
    { ...workspaces[0], pinned: true, lastSelectedAt: 999 },
    'pinned',
  )

  assert.equal(result[0].pinned, true)
  assert.equal(result[0].lastSelectedAt, 10)
})

test('supports an optimistic pin update without mutating the input', () => {
  const result = setWorkspacePinnedOptimistically(workspaces, 'alpha', true)

  assert.equal(result[0].pinned, true)
  assert.equal(workspaces[0].pinned, false)
  assert.equal(result[1], workspaces[1])
})
