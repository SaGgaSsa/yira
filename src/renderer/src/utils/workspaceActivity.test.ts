import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentActiveSession, AgentSessionStatus, WorkspaceMetadata } from '@shared/types'
import {
  buildWorkspaceActivityCards,
  getWorkspaceAgentDetails,
  hasWorkspaceActivityAttention,
  resolveActivationFocusTarget,
  resolveWorkspaceAttentionTileId,
  type WorkspaceActivityCardData,
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

function session(
  workspaceId: string,
  tileId: string,
  status: AgentSessionStatus,
  sessionId = `${workspaceId}/${tileId}/${status}`,
): AgentActiveSession {
  return { sessionId, tileId, workspaceId, status, provider: 'codex', startedAt: '', lastActivityAt: '' }
}

function card(
  id: string,
  status: AgentActiveSession['status'][] = [],
  name = id,
  attention = 0,
): WorkspaceActivityCardData {
  const sessions = status.map((entry, index) => session(id, `tile-${index}`, entry, `${id}-s${index}`))
  const [built] = buildWorkspaceActivityCards({
    workspaces: [workspace(id, { name })],
    sessionActiveIds: new Set([id]),
    sessions,
    attentionCounts: attention > 0 ? { [id]: attention } : {},
    terminalCounts: {},
    activeWorkspaceId: null,
  })
  return built
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
    sessions: [],
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: 'visited',
  })

  assert.deepEqual(cards.map((entry) => entry.workspace.id), ['visited', 'idle-visited'])
  assert.equal(cards.some((entry) => entry.workspace.id === 'saved'), false)
})

test('includes visited workspaces that are idle or have no terminals', () => {
  const cards = buildWorkspaceActivityCards({
    workspaces: [workspace('idle')],
    sessionActiveIds: new Set(['idle']),
    sessions: [],
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: null,
  })

  assert.equal(cards.length, 1)
  assert.equal(cards[0].activity.status, 'idle')
  assert.equal(cards[0].terminalCount, 0)
  assert.equal(cards[0].activeAgents, 0)
})

test('resolves working, needs-input and exited statuses without duplicating agents', () => {
  const sessions = [
    session('a', 't1', 'working'),
    session('a', 't1', 'working', 'same-tile-second-session'),
    session('a', 't2', 'needs-input'),
    session('a', 't3', 'exited'),
    session('a', 't4', 'done'),
    session('a', 't1', 'working', 'duplicate-session-id'),
    { ...session('a', 't5', 'working'), sessionId: 'duplicate-session-id' },
  ]
  const cards = buildWorkspaceActivityCards({
    workspaces: [workspace('a')],
    sessionActiveIds: new Set(['a']),
    sessions,
    attentionCounts: {},
    terminalCounts: { a: 4 },
    activeWorkspaceId: 'a',
  })

  assert.equal(cards[0].activity.status, 'needs-input')
  assert.equal(cards[0].activity.working, 4)
  assert.equal(cards[0].activity.needsInput, 1)
  assert.equal(cards[0].activeAgents, 4)
  assert.equal(cards[0].terminalCount, 4)
  assert.equal(cards[0].isCurrent, true)
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
    sessions: [
      session('busy', 't1', 'working'),
      session('pinned-blocked', 't1', 'needs-input'),
      session('unread-old', 't1', 'done'),
    ],
    attentionCounts: { 'unread-old': 3 },
    terminalCounts: { busy: 2, 'unread-old': 1 },
    activeWorkspaceId: 'busy',
  })

  assert.deepEqual(
    cards.map((entry) => entry.workspace.id),
    ['pinned-blocked', 'pinned-idle', 'busy', 'unread-old', 'no-stamp'],
  )
  assert.deepEqual(
    cards.map((entry) => entry.activity.status),
    ['needs-input', 'idle', 'working', 'unread', 'idle'],
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
    sessions: [session('b', 't1', 'working')],
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: 'a',
  })

  assert.deepEqual(buildCards(10).map((entry) => entry.workspace.id), ['b', 'c', 'a'])
  assert.deepEqual(buildCards(40).map((entry) => entry.workspace.id), ['a', 'b', 'c'])
})

test('resolves the attention tile from real sessions before tile counters', () => {
  const sessions = [session('a', 'working-tile', 'working'), session('a', 'input-tile', 'needs-input')]
  assert.equal(resolveWorkspaceAttentionTileId(sessions, 'a'), 'input-tile')
  assert.equal(
    resolveWorkspaceAttentionTileId(sessions.filter((entry) => entry.status !== 'needs-input'), 'a'),
    'working-tile',
  )
  assert.equal(resolveWorkspaceAttentionTileId([], 'a', { t1: 2, t2: 5 }), 't2')
  assert.equal(resolveWorkspaceAttentionTileId([], 'a'), null)
  assert.equal(resolveWorkspaceAttentionTileId([], 'a', {}), null)
})

test('flags attention only for intervention or unreviewed output', () => {
  assert.equal(hasWorkspaceActivityAttention(card('attention', ['needs-input'])), true)
  const [unread] = buildWorkspaceActivityCards({
    workspaces: [workspace('unread')],
    sessionActiveIds: new Set(['unread']),
    sessions: [],
    attentionCounts: { unread: 2 },
    terminalCounts: {},
    activeWorkspaceId: null,
  })
  assert.equal(unread.activity.status, 'unread')
  assert.equal(hasWorkspaceActivityAttention(unread), true)
  assert.equal(hasWorkspaceActivityAttention(card('working', ['working'])), false)
  assert.equal(hasWorkspaceActivityAttention(card('idle')), false)
})

test('deleted workspaces disappear because they leave the metadata list', () => {
  const before = buildWorkspaceActivityCards({
    workspaces: [workspace('keep'), workspace('removed')],
    sessionActiveIds: new Set(['keep', 'removed']),
    sessions: [],
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: 'keep',
  })
  assert.equal(before.length, 2)

  const after = buildWorkspaceActivityCards({
    workspaces: [workspace('keep')],
    sessionActiveIds: new Set(['keep']),
    sessions: [],
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: 'keep',
  })
  assert.deepEqual(after.map((entry) => entry.workspace.id), ['keep'])
})

test('exposes real agent sessions ordered by status with provider and tile', () => {
  const sessions = [
    session('a', 't-exit', 'exited'),
    session('a', 't-done', 'done'),
    session('a', 't-work', 'working'),
    session('a', 't-input', 'needs-input'),
    session('b', 't-other', 'working'),
  ]
  const details = getWorkspaceAgentDetails(sessions, 'a')

  assert.deepEqual(details.map((detail) => detail.status), ['needs-input', 'working', 'done', 'exited'])
  assert.deepEqual(details.map((detail) => detail.tileId), ['t-input', 't-work', 't-done', 't-exit'])
  assert.ok(details.every((detail) => detail.provider === 'codex'))
  assert.ok(details.every((detail) => typeof detail.sessionId === 'string' && detail.sessionId.length > 0))
  assert.deepEqual(getWorkspaceAgentDetails(sessions, 'unknown'), [])

  const [built] = buildWorkspaceActivityCards({
    workspaces: [workspace('a')],
    sessionActiveIds: new Set(['a']),
    sessions,
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: null,
  })
  assert.equal(built.agentDetails.length, 4)
  assert.equal(built.agentDetails[0].status, 'needs-input')
})

test('keeps two distinct sessions on the same tile and drops exact duplicates', () => {
  const first = session('a', 'shared-tile', 'working', 'session-one')
  const second = session('a', 'shared-tile', 'needs-input', 'session-two')
  const duplicate = { ...first }
  const sessions = [first, second, duplicate]

  const details = getWorkspaceAgentDetails(sessions, 'a')

  assert.deepEqual(details.map((detail) => detail.sessionId), ['session-two', 'session-one'])
  assert.deepEqual(details.map((detail) => detail.status), ['needs-input', 'working'])
  assert.ok(details.every((detail) => detail.tileId === 'shared-tile'))
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

test('recent output counts surface as output without adding agents or terminals', () => {
  const [common] = buildWorkspaceActivityCards({
    workspaces: [workspace('common')],
    sessionActiveIds: new Set(['common']),
    sessions: [],
    attentionCounts: {},
    terminalCounts: { common: 1 },
    activeWorkspaceId: null,
    recentOutputCounts: { common: 1 },
  })
  assert.equal(common.activity.status, 'output')
  assert.equal(common.activity.recentOutput, 1)
  assert.equal(common.activity.working, 0)
  assert.equal(common.activity.unread, 0)
  assert.equal(common.activeAgents, 0)
  assert.equal(common.terminalCount, 1)
  assert.equal(hasWorkspaceActivityAttention(common), false)

  const [withoutOption] = buildWorkspaceActivityCards({
    workspaces: [workspace('common')],
    sessionActiveIds: new Set(['common']),
    sessions: [],
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: null,
  })
  assert.equal(withoutOption.activity.recentOutput, 0)
  assert.equal(withoutOption.activity.status, 'idle')
})

test('recent output ranks under real work and unread while keeping their counters', () => {
  const [working] = buildWorkspaceActivityCards({
    workspaces: [workspace('working-ws')],
    sessionActiveIds: new Set(['working-ws']),
    sessions: [session('working-ws', 't1', 'working')],
    attentionCounts: {},
    terminalCounts: {},
    activeWorkspaceId: null,
    recentOutputCounts: { 'working-ws': 5 },
  })
  assert.equal(working.activity.status, 'working')
  assert.equal(working.activity.working, 1)
  assert.equal(working.activity.recentOutput, 5)
  assert.equal(working.activeAgents, 1)

  const [unreadCard] = buildWorkspaceActivityCards({
    workspaces: [workspace('unread-ws')],
    sessionActiveIds: new Set(['unread-ws']),
    sessions: [session('unread-ws', 't1', 'done')],
    attentionCounts: { 'unread-ws': 2 },
    terminalCounts: {},
    activeWorkspaceId: null,
    recentOutputCounts: { 'unread-ws': 3 },
  })
  assert.equal(unreadCard.activity.status, 'unread')
  assert.equal(unreadCard.activity.unread, 2)
  assert.equal(unreadCard.activity.recentOutput, 3)
  assert.equal(unreadCard.activity.done, 1)
  assert.equal(hasWorkspaceActivityAttention(unreadCard), true)
})
