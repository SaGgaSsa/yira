import assert from 'node:assert/strict'
import test from 'node:test'
import type { WorkspaceMetadata } from '@shared/types'
import { getWorkspaceSidebarOrder } from './workspaceOrdering'

const managerOrder = [
  { id: 'legacy-unpinned', name: 'Legacy unpinned', pinned: false },
  { id: 'pinned-old', name: 'Pinned old', pinned: true, lastSelectedAt: 10 },
  { id: 'unpinned-new', name: 'Unpinned new', pinned: false, lastSelectedAt: 30 },
  { id: 'pinned-new', name: 'Pinned new', pinned: true, lastSelectedAt: 40 },
  { id: 'pinned-legacy', name: 'Pinned legacy', pinned: true },
  { id: 'unpinned-same', name: 'Unpinned same', pinned: false, lastSelectedAt: 30 },
] as WorkspaceMetadata[]

test('orders by selection timestamps newest first and ignores pinned state', () => {
  const sidebarOrder = getWorkspaceSidebarOrder(managerOrder)

  assert.deepEqual(
    sidebarOrder.map((workspace) => workspace.id),
    ['pinned-new', 'unpinned-new', 'unpinned-same', 'pinned-old', 'legacy-unpinned', 'pinned-legacy'],
  )
})

test('keeps input order for timestamp ties and workspaces without dates', () => {
  const input = [
    { id: 'first', name: 'First', pinned: true },
    { id: 'second', name: 'Second', pinned: true },
    { id: 'third', name: 'Third', pinned: true, lastSelectedAt: 5 },
    { id: 'fourth', name: 'Fourth', pinned: true, lastSelectedAt: 5 },
  ] as WorkspaceMetadata[]

  assert.deepEqual(
    getWorkspaceSidebarOrder(input).map((workspace) => workspace.id),
    ['third', 'fourth', 'first', 'second'],
  )
})

test('does not mutate the manager metadata array or workspace objects', () => {
  const input = managerOrder.slice()
  const ordered = getWorkspaceSidebarOrder(input)

  assert.notEqual(ordered, input)
  assert.deepEqual(input.map((workspace) => workspace.id), managerOrder.map((workspace) => workspace.id))
  assert.deepEqual(input, managerOrder)
})
