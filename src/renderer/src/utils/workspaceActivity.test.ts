import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentActiveSession, AgentSessionStatus, WorkspaceMetadata } from '@shared/types'
import {
  buildWorkspaceActivityCards,
  getWorkspaceActivityRank,
  getWorkspaceAgentDetails,
  hasWorkspaceActivityAttention,
  resolveActivationFocusTarget,
  resolveWorkspaceAttentionTileId,
  sortWorkspaceActivityCards,
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

  assert.deepEqual(cards.map((entry) => entry.workspace.id), ['idle-visited', 'visited'])
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

test('orders attention first, then working, then the rest with a stable tiebreak', () => {
  const attention = card('attention', ['needs-input'], 'Zulu')
  const working = card('working', ['working'], 'Alpha')
  const unread = card('unread', [], 'Unread', 2)
  const done = card('done', ['done'])
  const idleB = card('idle-b', [], 'Beta')
  const idleA = card('idle-a', [], 'Alpha')

  assert.equal(unread.activity.status, 'unread')

  assert.deepEqual(
    sortWorkspaceActivityCards([idleB, done, unread, idleA, working, attention]).map((entry) => entry.workspace.id),
    ['attention', 'working', 'unread', 'done', 'idle-a', 'idle-b'],
  )
  assert.deepEqual(
    [getWorkspaceActivityRank('needs-input'), getWorkspaceActivityRank('working'), getWorkspaceActivityRank('unread'), getWorkspaceActivityRank('done'), getWorkspaceActivityRank('idle')],
    [0, 1, 2, 3, 4],
  )
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
