import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentAlertEvent } from '@shared/types'
import { getZenRemainingMs, shouldQueueAlertForZen, useZenStore } from './zenStore'

function reset(): void {
  useZenStore.setState({ session: null, queuedAlerts: [], summary: null, stoppedTileIds: [] })
}

function startSession(): void {
  useZenStore.getState().start({
    workspaceId: 'workspace-a',
    tileId: 'timer-1',
    status: 'running',
    endsAt: 2_000,
    remainingMs: 1_000,
    durationMs: 1_000,
  }, 1_000)
}

function alert(overrides: Partial<AgentAlertEvent> = {}): AgentAlertEvent {
  return {
    tileId: 'agent-1',
    workspaceId: 'workspace-b',
    provider: 'claude',
    event: 'completed',
    priority: 'normal',
    sessionTitle: null,
    surface: 'tile',
    ...overrides,
  }
}

test('alerts from other workspaces are queued only during a zen session', () => {
  reset()
  assert.equal(shouldQueueAlertForZen(null, 'workspace-b'), false)
  startSession()
  const session = useZenStore.getState().session
  assert.equal(shouldQueueAlertForZen(session, 'workspace-a'), false)
  assert.equal(shouldQueueAlertForZen(session, 'workspace-b'), true)
  assert.equal(shouldQueueAlertForZen(session, null), true)
})

test('queued alerts keep the latest event per agent tile', () => {
  reset()
  useZenStore.getState().queueAlert(alert(), 1)
  assert.equal(useZenStore.getState().queuedAlerts.length, 0)

  startSession()
  useZenStore.getState().queueAlert(alert({ event: 'input' }), 1)
  useZenStore.getState().queueAlert(alert({ tileId: 'agent-2' }), 2)
  useZenStore.getState().queueAlert(alert({ event: 'completed' }), 3)

  const queued = useZenStore.getState().queuedAlerts
  assert.deepEqual(queued.map((entry) => [entry.tileId, entry.event]), [['agent-2', 'completed'], ['agent-1', 'completed']])
})

test('completing a session always opens the summary with the queued alerts', () => {
  reset()
  startSession()
  useZenStore.getState().queueAlert(alert(), 1)
  useZenStore.getState().finish('completed')

  const state = useZenStore.getState()
  assert.equal(state.session, null)
  assert.equal(state.queuedAlerts.length, 0)
  assert.equal(state.summary?.reason, 'completed')
  assert.equal(state.summary?.alerts.length, 1)
  assert.deepEqual(state.stoppedTileIds, [])
})

test('stopping marks the timer tile and skips an empty summary', () => {
  reset()
  startSession()
  useZenStore.getState().finish('stopped')

  assert.equal(useZenStore.getState().summary, null)
  assert.deepEqual(useZenStore.getState().stoppedTileIds, ['timer-1'])
  useZenStore.getState().acknowledgeStop('timer-1')
  assert.deepEqual(useZenStore.getState().stoppedTileIds, [])
})

test('sync only updates the session of the same tile', () => {
  reset()
  startSession()
  useZenStore.getState().sync('other', { status: 'paused', endsAt: null, remainingMs: 5, durationMs: 5 })
  assert.equal(useZenStore.getState().session?.status, 'running')
  useZenStore.getState().sync('timer-1', { status: 'paused', endsAt: null, remainingMs: 400, durationMs: 1_000 })
  const session = useZenStore.getState().session
  assert.equal(session?.status, 'paused')
  assert.equal(session && getZenRemainingMs(session, 99_999), 400)
})

test('remaining time follows endsAt while running', () => {
  assert.equal(getZenRemainingMs({ status: 'running', endsAt: 5_000, remainingMs: 0, durationMs: 0 }, 3_000), 2_000)
  assert.equal(getZenRemainingMs({ status: 'running', endsAt: 5_000, remainingMs: 0, durationMs: 0 }, 9_000), 0)
})
