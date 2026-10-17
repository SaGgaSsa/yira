import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentActiveSession, WorkspaceMetadata } from '@shared/types'
import {
  filterWorkspacesByQuery,
  getActiveSidebarWorkspaces,
  getWorkspaceAgentEntries,
  getWorkspaceLastUsedParts,
  keepAgentSessionOrder,
  summarizeWorkspaceAgents,
} from './workspaceSidebarSections'

function workspace(id: string, lastSelectedAt?: number): WorkspaceMetadata {
  return {
    id,
    name: id,
    path: `/workspaces/${id}`,
    lastSelectedAt,
    config: {
      type: 'canvas',
      sourceControlRepositoryPaths: [],
      workspacePanelOpen: false,
      sourceControlViewMode: 'list',
      agentProviders: { claude: { enabled: true, args: [] }, codex: { enabled: true, args: [] } },
    },
  }
}

function session(overrides: Partial<AgentActiveSession> = {}): AgentActiveSession {
  return {
    sessionId: 'session-a',
    tileId: 'tile-a',
    workspaceId: 'workspace-a',
    provider: 'claude',
    status: 'working',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

test('keeps active workspaces in set order and ignores unknown ids', () => {
  const workspaces = [workspace('first'), workspace('second'), workspace('third')]

  assert.deepEqual(
    getActiveSidebarWorkspaces(workspaces, new Set(['third', 'missing', 'first'])).map(({ id }) => id),
    ['third', 'first'],
  )
})

test('filters workspaces by every query word in the name or root folder', () => {
  const api = { ...workspace('Api Server'), config: { ...workspace('x').config, rootFolderPath: 'C:/code/backend' } }
  const workspaces = [workspace('Yira Desktop'), api, workspace('Docs')]

  assert.deepEqual(filterWorkspacesByQuery(workspaces, '  ').map(({ id }) => id), ['Yira Desktop', 'Api Server', 'Docs'])
  assert.deepEqual(filterWorkspacesByQuery(workspaces, 'desk YIRA').map(({ id }) => id), ['Yira Desktop'])
  assert.deepEqual(filterWorkspacesByQuery(workspaces, 'backend').map(({ id }) => id), ['Api Server'])
  assert.deepEqual(filterWorkspacesByQuery(workspaces, 'missing'), [])
})

test('orders open sessions with waiting first, then by most recent activity and tile id', () => {
  const sessions = [
    session({ sessionId: 'working-old', tileId: 'z', lastActivityAt: '2026-01-01T00:01:00.000Z' }),
    session({ sessionId: 'done-new', status: 'done', lastActivityAt: '2026-01-01T00:05:00.000Z' }),
    session({ sessionId: 'waiting-old', status: 'needs-input', lastActivityAt: '2026-01-01T00:01:00.000Z' }),
    session({ sessionId: 'waiting-new', status: 'needs-input', lastActivityAt: '2026-01-01T00:03:00.000Z' }),
    session({ sessionId: 'working-new', tileId: 'b', lastActivityAt: '2026-01-01T00:04:00.000Z' }),
    session({ sessionId: 'done-old-tile-a', status: 'done', tileId: 'a', lastActivityAt: '2026-01-01T00:01:00.000Z' }),
    session({ sessionId: 'other-workspace', workspaceId: 'workspace-b' }),
    session({ sessionId: 'exited', status: 'exited' }),
  ]

  assert.deepEqual(
    getWorkspaceAgentEntries('workspace-a', sessions).map(({ sessionId }) => sessionId),
    ['waiting-new', 'waiting-old', 'done-new', 'working-new', 'done-old-tile-a', 'working-old'],
  )
})

test('keeps the previous session order and appends new sessions', () => {
  const sessions = [session({ sessionId: 'c' }), session({ sessionId: 'new' }), session({ sessionId: 'a' }), session({ sessionId: 'b' })]

  assert.deepEqual(
    keepAgentSessionOrder(sessions, ['a', 'gone', 'b', 'c']).map(({ sessionId }) => sessionId),
    ['a', 'b', 'c', 'new'],
  )
})

test('summarizes the waiting, done, and working sessions', () => {
  assert.deepEqual(summarizeWorkspaceAgents([
    session({ status: 'needs-input' }),
    session({ status: 'needs-input', tileId: 'tile-b' }),
    session({ status: 'done' }),
    session({ status: 'working' }),
    session({ status: 'exited' }),
  ]), { needsInputCount: 2, doneCount: 1, workingCount: 1 })

  assert.deepEqual(summarizeWorkspaceAgents([]), { needsInputCount: 0, doneCount: 0, workingCount: 0 })
})

test('formats last use in minutes, hours, days, and weeks at unit boundaries', () => {
  const now = 2_000_000_000_000
  const minute = 60_000
  const day = 24 * 60 * minute

  assert.deepEqual(getWorkspaceLastUsedParts(now, now), { value: 1, unit: 'minute' })
  assert.deepEqual(getWorkspaceLastUsedParts(now - 59 * minute, now), { value: 59, unit: 'minute' })
  assert.deepEqual(getWorkspaceLastUsedParts(now - 60 * minute, now), { value: 1, unit: 'hour' })
  assert.deepEqual(getWorkspaceLastUsedParts(now - 23 * 60 * minute, now), { value: 23, unit: 'hour' })
  assert.deepEqual(getWorkspaceLastUsedParts(now - day, now), { value: 1, unit: 'day' })
  assert.deepEqual(getWorkspaceLastUsedParts(now - 13 * day, now), { value: 13, unit: 'day' })
  assert.deepEqual(getWorkspaceLastUsedParts(now - 14 * day, now), { value: 2, unit: 'week' })
})

test('returns null for missing, invalid, or future timestamps', () => {
  const now = 2_000_000_000_000

  assert.equal(getWorkspaceLastUsedParts(undefined, now), null)
  assert.equal(getWorkspaceLastUsedParts(Number.NaN, now), null)
  assert.equal(getWorkspaceLastUsedParts(Number.POSITIVE_INFINITY, now), null)
  assert.equal(getWorkspaceLastUsedParts(-1, now), null)
  assert.equal(getWorkspaceLastUsedParts(1.5, now), null)
  assert.equal(getWorkspaceLastUsedParts(Number.MAX_SAFE_INTEGER + 1, now), null)
  assert.equal(getWorkspaceLastUsedParts(now, Number.NaN), null)
  assert.equal(getWorkspaceLastUsedParts(now + 1, now), null)
})
