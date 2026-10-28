import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentActiveSession } from '@shared/types'
import {
  formatActivityElapsed,
  getAgentSessionSurface,
  selectRestoredAgentSessions,
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

test('selects open agents that started before the window loaded in known workspaces', () => {
  const loadedAt = Date.parse('2026-01-01T01:00:00.000Z')
  const sessions = [
    session({ sessionId: 'restored', workspaceId: 'a', status: 'done' }),
    session({ sessionId: 'handled', workspaceId: 'a' }),
    session({ sessionId: 'exited', workspaceId: 'a', status: 'exited' }),
    session({ sessionId: 'unknown-workspace', workspaceId: 'gone' }),
    session({ sessionId: 'started-now', workspaceId: 'b', startedAt: '2026-01-01T01:00:00.000Z' }),
  ]

  const selected = selectRestoredAgentSessions(sessions, loadedAt, new Set(['a', 'b']), new Set(['handled']))

  assert.deepEqual(selected.map((entry) => entry.sessionId), ['restored'])
})
