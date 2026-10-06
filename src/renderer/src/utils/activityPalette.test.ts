import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentActiveSession, WorkspaceMetadata } from '@shared/types'
import {
  buildActivityPaletteGroups,
  formatActivityElapsed,
  getActivityPaletteCardSpans,
  getActivityPaletteRowSizes,
  getAgentSessionSurface,
  moveActivityPaletteSelection,
  summarizeActivityPalette,
} from './activityPalette'

function session(overrides: Partial<AgentActiveSession> = {}): AgentActiveSession {
  return {
    sessionId: 'session-a',
    tileId: 'agent-a',
    workspaceId: 'workspace-a',
    provider: 'claude',
    status: 'working',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function workspace(id: string): WorkspaceMetadata {
  return {
    id,
    name: id,
    path: `/workspaces/${id}`,
    config: {
      type: 'canvas',
      sourceControlRepositoryPaths: [],
      workspacePanelOpen: false,
      sourceControlViewMode: 'list',
      agentProviders: { claude: { enabled: true, args: [] }, codex: { enabled: true, args: [] } },
    },
  }
}

test('splits cards into even rows of at most three for 1 to 8 workspaces', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8].map(getActivityPaletteRowSizes),
    [[1], [2], [3], [2, 2], [3, 2], [3, 3], [3, 2, 2], [3, 3, 2]],
  )
  assert.deepEqual(getActivityPaletteRowSizes(0), [])
})

test('spans every row across the six grid tracks', () => {
  assert.deepEqual(getActivityPaletteCardSpans(1), [6])
  assert.deepEqual(getActivityPaletteCardSpans(4), [3, 3, 3, 3])
  assert.deepEqual(getActivityPaletteCardSpans(5), [2, 2, 2, 3, 3])
  assert.deepEqual(getActivityPaletteCardSpans(7), [2, 2, 2, 3, 3, 3, 3])
  for (let count = 1; count <= 8; count += 1) {
    const spans = getActivityPaletteCardSpans(count)
    assert.equal(spans.length, count)
    assert.equal(spans.reduce((total, span) => total + span, 0) % 6, 0)
  }
})

test('keeps every open agent and drops workspaces without one', () => {
  const groups = buildActivityPaletteGroups(
    [workspace('a'), workspace('b'), workspace('c')],
    [
      session({ sessionId: 'a-working', workspaceId: 'a', status: 'working' }),
      session({ sessionId: 'a-done', workspaceId: 'a', status: 'done' }),
      session({ sessionId: 'b-exited', workspaceId: 'b', status: 'exited' }),
      session({ sessionId: 'b-done', workspaceId: 'b', status: 'done' }),
      session({ sessionId: 'c-input', workspaceId: 'c', status: 'needs-input', surface: 'agents-view' }),
      session({ sessionId: 'unknown', workspaceId: 'missing', status: 'working' }),
    ],
  )

  assert.deepEqual(groups.map((group) => group.workspace.id), ['c', 'a', 'b'])
  assert.deepEqual(groups.map((group) => group.sessions.map((entry) => entry.sessionId)), [
    ['c-input'],
    ['a-working', 'a-done'],
    ['b-done'],
  ])
})

test('orders workspaces with waiting agents first, keeping sidebar order within each group', () => {
  const groups = buildActivityPaletteGroups(
    [workspace('first'), workspace('second'), workspace('third'), workspace('fourth')],
    [
      session({ sessionId: 'first', workspaceId: 'first' }),
      session({ sessionId: 'second', workspaceId: 'second', status: 'needs-input' }),
      session({ sessionId: 'third', workspaceId: 'third' }),
      session({ sessionId: 'fourth', workspaceId: 'fourth', status: 'needs-input' }),
    ],
  )

  assert.deepEqual(groups.map((group) => group.workspace.id), ['second', 'fourth', 'first', 'third'])
})

test('orders agents waiting, working, then done, each by start time, and counts them', () => {
  const [group] = buildActivityPaletteGroups([workspace('a')], [
    session({ sessionId: 'done', workspaceId: 'a', status: 'done', startedAt: '2026-01-01T00:00:00.000Z' }),
    session({ sessionId: 'late', workspaceId: 'a', startedAt: '2026-01-01T00:03:00.000Z' }),
    session({ sessionId: 'early', workspaceId: 'a', startedAt: '2026-01-01T00:01:00.000Z' }),
    session({ sessionId: 'input', workspaceId: 'a', status: 'needs-input', startedAt: '2026-01-01T00:05:00.000Z' }),
  ])

  assert.deepEqual(group.sessions.map((entry) => entry.sessionId), ['input', 'early', 'late', 'done'])
  assert.equal(group.needsInputCount, 1)
  assert.equal(group.workingCount, 2)
  assert.equal(group.doneCount, 1)
  assert.deepEqual(summarizeActivityPalette([group]), { agentCount: 4, workspaceCount: 1, needsInputCount: 1 })
})

test('treats a missing surface as a permanent tile', () => {
  assert.equal(getAgentSessionSurface(session()), 'tile')
  assert.equal(getAgentSessionSurface(session({ surface: 'agents-view' })), 'agents-view')
})

test('formats elapsed time in seconds, minutes, and hours', () => {
  const startedAt = '2026-01-01T00:00:00.000Z'
  const start = Date.parse(startedAt)
  assert.equal(formatActivityElapsed(startedAt, start + 30_000), '30 s')
  assert.equal(formatActivityElapsed(startedAt, start + 4 * 60_000 + 10_000), '4 min')
  assert.equal(formatActivityElapsed(startedAt, start + 2 * 3_600_000 + 60_000), '2 h')
  assert.equal(formatActivityElapsed(startedAt, start - 5_000), '0 s')
})

test('moves selection through agents and jumps between cards', () => {
  const groups = buildActivityPaletteGroups([workspace('a'), workspace('b')], [
    session({ sessionId: 'a1', workspaceId: 'a', startedAt: '2026-01-01T00:01:00.000Z' }),
    session({ sessionId: 'a2', workspaceId: 'a', startedAt: '2026-01-01T00:02:00.000Z' }),
    session({ sessionId: 'b1', workspaceId: 'b' }),
  ])

  assert.equal(moveActivityPaletteSelection(groups, 'a1', 'ArrowDown'), 'a2')
  assert.equal(moveActivityPaletteSelection(groups, 'a2', 'ArrowDown'), 'b1')
  assert.equal(moveActivityPaletteSelection(groups, 'b1', 'ArrowDown'), 'b1')
  assert.equal(moveActivityPaletteSelection(groups, 'b1', 'ArrowUp'), 'a2')
  assert.equal(moveActivityPaletteSelection(groups, 'a1', 'ArrowUp'), 'a1')
  assert.equal(moveActivityPaletteSelection(groups, 'a2', 'ArrowRight'), 'b1')
  assert.equal(moveActivityPaletteSelection(groups, 'b1', 'ArrowLeft'), 'a1')
  assert.equal(moveActivityPaletteSelection(groups, 'a1', 'ArrowLeft'), 'a1')
  assert.equal(moveActivityPaletteSelection(groups, 'missing', 'ArrowDown'), 'a1')
  assert.equal(moveActivityPaletteSelection([], null, 'ArrowDown'), null)
})
