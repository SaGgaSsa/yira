import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentActiveSession, AgentSessionStatus } from '@shared/types'
import { summarizeTerminalActivity } from './terminalActivity'

function session(tileId: string, status: AgentSessionStatus, workspaceId = 'a'): AgentActiveSession {
  return { tileId, workspaceId, status, sessionId: tileId, provider: 'codex', startedAt: '', lastActivityAt: '' }
}

test('aggregates every terminal in a workspace and prioritizes intervention over work and completion', () => {
  const sessions = [session('1', 'done'), session('2', 'working'), session('3', 'needs-input'), session('4', 'working')]
  assert.deepEqual(summarizeTerminalActivity(sessions, 'a', 3), {
    status: 'needs-input', working: 2, needsInput: 1, done: 1, unread: 3, recentOutput: 0,
  })
  assert.equal(summarizeTerminalActivity([...sessions].reverse(), 'a').status, 'needs-input')
  assert.equal(summarizeTerminalActivity(sessions.filter((s) => s.tileId !== '3'), 'a', 3).status, 'working')
})

test('isolates workspaces and tile identities, including repeated tile IDs', () => {
  const sessions = [session('1', 'done'), session('1', 'needs-input', 'b'), session('2', 'working')]
  assert.equal(summarizeTerminalActivity(sessions, 'a', 0, '1').status, 'done')
  assert.equal(summarizeTerminalActivity(sessions, 'b', 0, '1').status, 'needs-input')
  assert.equal(summarizeTerminalActivity(sessions, 'c').status, 'idle')
})

test('unreviewed output precedes completion and works for terminals without agent sessions', () => {
  assert.equal(summarizeTerminalActivity([], 'a', 4).status, 'unread')
  assert.equal(summarizeTerminalActivity([session('1', 'done')], 'a', 4).status, 'unread')
  assert.equal(summarizeTerminalActivity([session('1', 'done')], 'a', 0).status, 'done')
})

test('empty, removed and exited sessions do not imply successful completion', () => {
  assert.equal(summarizeTerminalActivity([], 'a').status, 'idle')
  assert.equal(summarizeTerminalActivity([session('1', 'exited')], 'a').status, 'idle')
  assert.equal(summarizeTerminalActivity([session('1', 'done'), session('2', 'exited')], 'a').done, 1)
  for (const count of [-1, NaN, Infinity]) assert.equal(summarizeTerminalActivity([], 'a', count).unread, 0)
})

test('normalizes recent output counts like unread without inflating other counters', () => {
  for (const count of [-1, NaN, Infinity]) {
    const summary = summarizeTerminalActivity([], 'a', 0, undefined, count)
    assert.equal(summary.recentOutput, 0)
    assert.equal(summary.status, 'idle')
  }
  assert.equal(summarizeTerminalActivity([], 'a', 0, undefined, 3.9).recentOutput, 3)
  assert.equal(summarizeTerminalActivity([], 'a', 0, undefined, 2).recentOutput, 2)

  const mixed = summarizeTerminalActivity([session('1', 'working')], 'a', 0, undefined, 4)
  assert.equal(mixed.working, 1)
  assert.equal(mixed.recentOutput, 4)
  assert.equal(mixed.unread, 0)
})

test('a common terminal with recent output and no agent session reports output', () => {
  const summary = summarizeTerminalActivity([], 'a', 0, undefined, 2)
  assert.equal(summary.status, 'output')
  assert.equal(summary.working, 0)
  assert.equal(summary.needsInput, 0)
  assert.equal(summary.recentOutput, 2)
})

test('recent output ranks above unread and done but below work and intervention', () => {
  assert.equal(summarizeTerminalActivity([], 'a', 0, undefined, 1).status, 'output')
  assert.equal(summarizeTerminalActivity([], 'a', 1, undefined, 1).status, 'output')
  assert.equal(summarizeTerminalActivity([session('1', 'working')], 'a', 0, undefined, 1).status, 'working')
  assert.equal(summarizeTerminalActivity([session('1', 'needs-input')], 'a', 0, undefined, 1).status, 'needs-input')
  assert.equal(summarizeTerminalActivity([session('1', 'done')], 'a', 0, undefined, 1).status, 'output')
  assert.equal(summarizeTerminalActivity([session('1', 'done')], 'a', 1, undefined, 0).status, 'unread')
  assert.equal(summarizeTerminalActivity([session('1', 'done')], 'a', 0, undefined, 0).status, 'done')
})
