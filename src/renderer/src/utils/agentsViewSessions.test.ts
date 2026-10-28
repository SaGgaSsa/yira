import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentActiveSession } from '@shared/types'
import {
  agentSessionNeedsAttention,
  countAgentsViewAttention,
  pickNextAgentSession,
  selectAgentsViewSessions,
} from './agentsViewSessions'

function session(overrides: Partial<AgentActiveSession> = {}): AgentActiveSession {
  return {
    sessionId: 'session-a',
    tileId: 'agent-a',
    workspaceId: 'workspace-a',
    provider: 'claude',
    status: 'working',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    surface: 'agents-view',
    ...overrides,
  }
}

test('selects only Agents View sessions in the workspace and sorts by start time then tile id', () => {
  const snapshot = {
    sessions: [
      session({ tileId: 'agent-z', startedAt: '2026-01-02T00:00:00.000Z' }),
      session({ tileId: 'agent-b' }),
      session({ tileId: 'agent-a' }),
      session({ tileId: 'agent-other-workspace', workspaceId: 'workspace-b' }),
      session({ tileId: 'tile-session', surface: 'tile' }),
    ],
  }

  assert.deepEqual(
    selectAgentsViewSessions(snapshot, 'workspace-a').map((item) => item.tileId),
    ['agent-a', 'agent-b', 'agent-z'],
  )
})

test('counts needs-input and done sessions as requiring attention', () => {
  const sessions = [
    session({ status: 'working' }),
    session({ tileId: 'agent-b', status: 'needs-input' }),
    session({ tileId: 'agent-c', status: 'done' }),
    session({ tileId: 'agent-d', status: 'exited' }),
  ]

  assert.equal(agentSessionNeedsAttention(sessions[0]), false)
  assert.equal(agentSessionNeedsAttention(sessions[1]), true)
  assert.equal(agentSessionNeedsAttention(sessions[2]), true)
  assert.equal(agentSessionNeedsAttention(sessions[3]), false)
  assert.equal(countAgentsViewAttention(sessions), 2)
})

test('picks no session when there are none', () => {
  assert.equal(pickNextAgentSession([], null), null)
  assert.equal(pickNextAgentSession([], 'agent-a'), null)
})

test('picks a session waiting for input before a finished one', () => {
  const sessions = [
    session({ tileId: 'agent-done', status: 'done' }),
    session({ tileId: 'agent-input', status: 'needs-input' }),
  ]

  assert.equal(pickNextAgentSession(sessions, null)?.tileId, 'agent-input')
  assert.equal(pickNextAgentSession(sessions, 'agent-unknown')?.tileId, 'agent-input')
})

test('cycles through the sessions waiting for input', () => {
  const sessions = [
    session({ tileId: 'agent-input-a', status: 'needs-input' }),
    session({ tileId: 'agent-input-b', status: 'needs-input' }),
  ]

  assert.equal(pickNextAgentSession(sessions, 'agent-input-a')?.tileId, 'agent-input-b')
  assert.equal(pickNextAgentSession(sessions, 'agent-input-b')?.tileId, 'agent-input-a')
})

test('cycles through every session when none waits for input', () => {
  const sessions = [
    session({ tileId: 'agent-a', status: 'working' }),
    session({ tileId: 'agent-b', status: 'working' }),
  ]

  assert.equal(pickNextAgentSession(sessions, null)?.tileId, 'agent-a')
  assert.equal(pickNextAgentSession(sessions, 'agent-a')?.tileId, 'agent-b')
  assert.equal(pickNextAgentSession(sessions, 'agent-b')?.tileId, 'agent-a')
})
