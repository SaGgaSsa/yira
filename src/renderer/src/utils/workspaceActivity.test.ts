import assert from 'node:assert/strict'
import test from 'node:test'
import type { WorkspaceMetadata } from '@shared/types'
import {
  buildWorkspaceActivityCards,
  hasWorkspaceActivityAttention,
  resolveActivationFocusTarget,
  resolveWorkspaceAttentionTileId,
} from './workspaceActivity'

function workspace(id: string, overrides: Partial<WorkspaceMetadata> = {}): WorkspaceMetadata {
  return {
    id,
    name: id,
    path: `/workspaces/${id}`,
    pinned: false,
    config: {
      type: 'canvas',
      sourceControlRepositoryPaths: [],
      workspacePanelOpen: false,
      sourceControlViewMode: 'list',
      agentProviders: { claude: { enabled: false, args: [] }, codex: { enabled: false, args: [] } },
    },
    ...overrides,
  }
}

test('replicates the sidebar grey/white criterion: only workspaces visited this session', () => {
  const visited = workspace('visited', { name: 'Visited' })
  const idleVisited = workspace('idle-visited', { name: 'Idle visited' })
  const savedNotVisited = workspace('saved', {
    name: 'Saved with history',
    lastSelectedAt: Date.now(),
  } as Partial<WorkspaceMetadata>)

  const cards = buildWorkspaceActivityCards({
    workspaces: [visited, idleVisited, savedNotVisited],
    sessionActiveIds: new Set(['visited', 'idle-visited']),
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: 'visited',
  })

  assert.deepEqual(cards.map((entry) => entry.workspace.id), ['visited', 'idle-visited'])
  assert.equal(cards.some((entry) => entry.workspace.id === 'saved'), false)
})

test('recent output marks the workspace active', () => {
  const [card] = buildWorkspaceActivityCards({
    workspaces: [workspace('common')],
    sessionActiveIds: new Set(['common']),
    attentionCounts: {},
    terminalCounts: { common: 1 },
    activeWorkspaceId: null,
    recentOutputCounts: { common: 1 },
  })

  assert.equal(card.status, 'active')
  assert.equal(card.terminalCount, 1)
  assert.equal(card.attentionCount, 0)
  assert.equal(hasWorkspaceActivityAttention(card), false)
})

test('process working marks its workspace active and background does not', () => {
  const [working] = buildWorkspaceActivityCards({
    workspaces: [workspace('working')],
    sessionActiveIds: new Set(['working']),
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: null,
    processActivity: [{ workspaceId: 'working', tileId: 't1', state: 'working' }],
  })
  const [background] = buildWorkspaceActivityCards({
    workspaces: [workspace('background')],
    sessionActiveIds: new Set(['background']),
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: null,
    processActivity: [{ workspaceId: 'background', tileId: 't1', state: 'background' }],
  })

  assert.equal(working.status, 'active')
  assert.equal(background.status, 'idle')
})

test('active wins over unread', () => {
  const [card] = buildWorkspaceActivityCards({
    workspaces: [workspace('busy')],
    sessionActiveIds: new Set(['busy']),
    attentionCounts: { busy: 2 },
    terminalCounts: { busy: 1 },
    activeWorkspaceId: null,
    recentOutputCounts: { busy: 3 },
  })

  assert.equal(card.status, 'active')
  assert.equal(card.attentionCount, 2)
  assert.equal(hasWorkspaceActivityAttention(card), false)
})

test('unread without recent output requests attention', () => {
  const [card] = buildWorkspaceActivityCards({
    workspaces: [workspace('unread')],
    sessionActiveIds: new Set(['unread']),
    attentionCounts: { unread: 2 },
    terminalCounts: {},
    activeWorkspaceId: null,
  })

  assert.equal(card.status, 'unread')
  assert.equal(hasWorkspaceActivityAttention(card), true)
})

test('idle workspaces carry no attention', () => {
  const [card] = buildWorkspaceActivityCards({
    workspaces: [workspace('idle')],
    sessionActiveIds: new Set(['idle']),
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: null,
  })

  assert.equal(card.status, 'idle')
  assert.equal(card.terminalCount, 0)
  assert.equal(hasWorkspaceActivityAttention(card), false)
})

test('keeps the sidebar order even when activity states and counters differ', () => {
  const workspaces = [
    workspace('busy', { name: 'Busy', lastSelectedAt: 40 }),
    workspace('pinned-idle', { name: 'Pinned idle', pinned: true, lastSelectedAt: 10 }),
    workspace('pinned-blocked', { name: 'Pinned blocked', pinned: true, lastSelectedAt: 20 }),
    workspace('unread-old', { name: 'Unread old', lastSelectedAt: 5 }),
    workspace('no-stamp', { name: 'No stamp' }),
  ]

  const cards = buildWorkspaceActivityCards({
    workspaces,
    sessionActiveIds: new Set(workspaces.map((entry) => entry.id)),
    attentionCounts: { 'pinned-blocked': 1, 'unread-old': 3 },
    terminalCounts: { busy: 2, 'unread-old': 1 },
    activeWorkspaceId: 'busy',
    recentOutputCounts: { busy: 1 },
  })

  assert.deepEqual(
    cards.map((entry) => entry.workspace.id),
    ['busy', 'pinned-blocked', 'pinned-idle', 'unread-old', 'no-stamp'],
  )
  assert.deepEqual(
    cards.map((entry) => entry.status),
    ['active', 'unread', 'idle', 'unread', 'idle'],
  )

  const busy = cards.find((entry) => entry.workspace.id === 'busy')
  assert.equal(busy?.terminalCount, 2)
  assert.equal(busy?.isCurrent, true)
  assert.equal(cards.find((entry) => entry.workspace.id === 'unread-old')?.attentionCount, 3)
})

test('updates the activity order when a workspace is selected', () => {
  const buildCards = (firstSelectedAt: number) => buildWorkspaceActivityCards({
    workspaces: [
      workspace('a', { name: 'A', lastSelectedAt: firstSelectedAt }),
      workspace('b', { name: 'B', lastSelectedAt: 30 }),
      workspace('c', { name: 'C', lastSelectedAt: 20 }),
    ],
    sessionActiveIds: new Set(['a', 'b', 'c']),
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: 'a',
  })

  assert.deepEqual(buildCards(10).map((entry) => entry.workspace.id), ['b', 'c', 'a'])
  assert.deepEqual(buildCards(40).map((entry) => entry.workspace.id), ['a', 'b', 'c'])
})

test('resolves the attention tile from tile counters only', () => {
  assert.equal(resolveWorkspaceAttentionTileId({ t1: 2, t2: 5 }), 't2')
  assert.equal(resolveWorkspaceAttentionTileId({ t1: 0, t2: 0 }), null)
  assert.equal(resolveWorkspaceAttentionTileId({}), null)
  assert.equal(resolveWorkspaceAttentionTileId(), null)
  assert.equal(resolveWorkspaceAttentionTileId(undefined), null)
})

test('flags attention only for unreviewed output', () => {
  const [unread] = buildWorkspaceActivityCards({
    workspaces: [workspace('unread')],
    sessionActiveIds: new Set(['unread']),
    attentionCounts: { unread: 2 },
    terminalCounts: {},
    activeWorkspaceId: null,
  })
  assert.equal(hasWorkspaceActivityAttention(unread), true)

  const [active] = buildWorkspaceActivityCards({
    workspaces: [workspace('active')],
    sessionActiveIds: new Set(['active']),
    attentionCounts: {},
    terminalCounts: { active: 1 },
    activeWorkspaceId: null,
    recentOutputCounts: { active: 1 },
  })
  assert.equal(hasWorkspaceActivityAttention(active), false)

  const [idle] = buildWorkspaceActivityCards({
    workspaces: [workspace('idle')],
    sessionActiveIds: new Set(['idle']),
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: null,
  })
  assert.equal(hasWorkspaceActivityAttention(idle), false)
})

test('deleted workspaces disappear because they leave the metadata list', () => {
  const before = buildWorkspaceActivityCards({
    workspaces: [workspace('keep'), workspace('removed')],
    sessionActiveIds: new Set(['keep', 'removed']),
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: 'keep',
  })
  assert.equal(before.length, 2)

  const after = buildWorkspaceActivityCards({
    workspaces: [workspace('keep')],
    sessionActiveIds: new Set(['keep']),
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: 'keep',
  })
  assert.deepEqual(after.map((entry) => entry.workspace.id), ['keep'])
})

test('includes visited workspaces that are idle or have no terminals', () => {
  const cards = buildWorkspaceActivityCards({
    workspaces: [workspace('idle')],
    sessionActiveIds: new Set(['idle']),
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: null,
  })

  assert.equal(cards.length, 1)
  assert.equal(cards[0].status, 'idle')
  assert.equal(cards[0].terminalCount, 0)
})

test('rejects stale post-activation navigation targets', () => {
  const tiles = [{ id: 't1' }, { id: 't2' }]
  assert.equal(resolveActivationFocusTarget({
    tiles,
    requestedWorkspaceId: 'a',
    activeWorkspaceId: 'a',
    tileId: 't1',
  }), 't1')
  assert.equal(resolveActivationFocusTarget({
    tiles,
    requestedWorkspaceId: 'a',
    activeWorkspaceId: 'b',
    tileId: 't1',
  }), null)
  assert.equal(resolveActivationFocusTarget({
    tiles,
    requestedWorkspaceId: 'a',
    activeWorkspaceId: 'a',
    tileId: 'missing',
  }), null)
  assert.equal(resolveActivationFocusTarget({
    tiles,
    requestedWorkspaceId: 'a',
    activeWorkspaceId: 'a',
    tileId: null,
  }), null)
  assert.equal(resolveActivationFocusTarget({
    tiles: [],
    requestedWorkspaceId: 'a',
    activeWorkspaceId: null,
    tileId: 't1',
  }), null)
})
