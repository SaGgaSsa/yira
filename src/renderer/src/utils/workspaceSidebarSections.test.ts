import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentActiveSession, WorkspaceMetadata } from '@shared/types'
import {
  getActiveSidebarWorkspaces,
  getInactiveSidebarWorkspaces,
  getWorkspaceAgentEntries,
  getWorkspaceLastUsedParts,
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

test('sorts inactive workspaces by last use after removing active workspaces', () => {
  const workspaces = [workspace('first', 100), workspace('no-date'), workspace('recent', 300), workspace('tie', 100)]

  assert.deepEqual(
    getInactiveSidebarWorkspaces(workspaces, new Set(['first'])).map(({ id }) => id),
    ['recent', 'tie', 'no-date'],
  )
})

test('orders open sessions by waiting, done, working, then start time and tile id', () => {
  const sessions = [
    session({ sessionId: 'working-late', tileId: 'z', startedAt: '2026-01-01T00:02:00.000Z' }),
    session({ sessionId: 'done-late', status: 'done', startedAt: '2026-01-01T00:02:00.000Z' }),
    session({ sessionId: 'waiting-tile-z', status: 'needs-input', tileId: 'z' }),
    session({ sessionId: 'waiting-tile-a', status: 'needs-input', tileId: 'a' }),
    session({ sessionId: 'done-early', status: 'done', startedAt: '2026-01-01T00:01:00.000Z' }),
    session({ sessionId: 'working-early', startedAt: '2026-01-01T00:01:00.000Z', tileId: 'b' }),
    session({ sessionId: 'other-workspace', workspaceId: 'workspace-b' }),
    session({ sessionId: 'exited', status: 'exited' }),
  ]

  assert.deepEqual(
    getWorkspaceAgentEntries('workspace-a', sessions).map(({ sessionId }) => sessionId),
    ['waiting-tile-a', 'waiting-tile-z', 'done-early', 'done-late', 'working-early', 'working-late'],
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
