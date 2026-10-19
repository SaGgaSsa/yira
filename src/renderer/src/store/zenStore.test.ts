import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentAlertEvent } from '@shared/types'
import {
  ZEN_DEFAULT_DURATION_MS,
  ZEN_MAX_DURATION_MS,
  ZEN_MIN_DURATION_MS,
  formatZenTime,
  getZenRemainingMs,
  shouldQueueAlertForZen,
  useZenStore,
} from './zenStore'

const MINUTE = 60_000

function reset(): void {
  useZenStore.setState({
    durationMs: ZEN_DEFAULT_DURATION_MS,
    menuOpen: false,
    session: null,
    fullScreen: false,
    queuedAlerts: [],
    summary: null,
  })
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

test('starting uses the picked duration, enters full screen and closes the menu', () => {
  reset()
  useZenStore.getState().setDuration(10 * MINUTE)
  useZenStore.getState().setMenuOpen(true)
  useZenStore.getState().start('workspace-a', 1_000)

  const state = useZenStore.getState()
  assert.equal(state.session?.workspaceId, 'workspace-a')
  assert.equal(state.session?.endsAt, 1_000 + (10 * MINUTE))
  assert.equal(state.fullScreen, true)
  assert.equal(state.menuOpen, false)
})

test('duration is clamped between one minute and three hours', () => {
  reset()
  useZenStore.getState().setDuration(5)
  assert.equal(useZenStore.getState().durationMs, ZEN_MIN_DURATION_MS)
  useZenStore.getState().setDuration(999 * MINUTE)
  assert.equal(useZenStore.getState().durationMs, ZEN_MAX_DURATION_MS)
})

test('pause, resume and extra time keep the remaining time', () => {
  reset()
  useZenStore.getState().setDuration(10 * MINUTE)
  useZenStore.getState().start('workspace-a', 0)
  useZenStore.getState().pause(4 * MINUTE)
  assert.equal(useZenStore.getState().session?.remainingMs, 6 * MINUTE)

  useZenStore.getState().addExtraTime(99 * MINUTE)
  assert.equal(useZenStore.getState().session?.remainingMs, 11 * MINUTE)
  assert.equal(useZenStore.getState().session?.endsAt, null)

  useZenStore.getState().resume(20 * MINUTE)
  const session = useZenStore.getState().session
  assert.equal(session?.endsAt, 31 * MINUTE)
  assert.equal(session?.durationMs, 15 * MINUTE)
})

test('leaving full screen keeps the session running', () => {
  reset()
  useZenStore.getState().start('workspace-a', 0)
  useZenStore.getState().setFullScreen(false)
  assert.equal(useZenStore.getState().fullScreen, false)
  assert.notEqual(useZenStore.getState().session, null)
  useZenStore.getState().setFullScreen(true)
  assert.equal(useZenStore.getState().fullScreen, true)
})

test('full screen cannot be requested without a session', () => {
  reset()
  useZenStore.getState().setFullScreen(true)
  assert.equal(useZenStore.getState().fullScreen, false)
})

test('alerts from other workspaces are queued only during a session', () => {
  reset()
  assert.equal(shouldQueueAlertForZen(null, 'workspace-b'), false)
  useZenStore.getState().queueAlert(alert(), 1)
  assert.equal(useZenStore.getState().queuedAlerts.length, 0)

  useZenStore.getState().start('workspace-a', 0)
  const session = useZenStore.getState().session
  assert.equal(shouldQueueAlertForZen(session, 'workspace-a'), false)
  assert.equal(shouldQueueAlertForZen(session, 'workspace-b'), true)
  assert.equal(shouldQueueAlertForZen(session, null), true)

  useZenStore.getState().queueAlert(alert({ event: 'input' }), 1)
  useZenStore.getState().queueAlert(alert({ tileId: 'agent-2' }), 2)
  useZenStore.getState().queueAlert(alert({ event: 'completed' }), 3)
  assert.deepEqual(
    useZenStore.getState().queuedAlerts.map((entry) => [entry.tileId, entry.event]),
    [['agent-2', 'completed'], ['agent-1', 'completed']],
  )
})

test('completing always opens the summary and leaves full screen', () => {
  reset()
  useZenStore.getState().start('workspace-a', 0)
  useZenStore.getState().queueAlert(alert(), 1)
  useZenStore.getState().finish('completed')

  const state = useZenStore.getState()
  assert.equal(state.session, null)
  assert.equal(state.fullScreen, false)
  assert.equal(state.queuedAlerts.length, 0)
  assert.equal(state.summary?.reason, 'completed')
  assert.equal(state.summary?.alerts.length, 1)
})

test('stopping with nothing queued skips the summary', () => {
  reset()
  useZenStore.getState().start('workspace-a', 0)
  useZenStore.getState().finish('stopped')
  assert.equal(useZenStore.getState().summary, null)
})

test('remaining time follows endsAt while running', () => {
  reset()
  useZenStore.getState().start('workspace-a', 0)
  const session = useZenStore.getState().session
  assert.ok(session)
  assert.equal(getZenRemainingMs(session, 5 * MINUTE), ZEN_DEFAULT_DURATION_MS - (5 * MINUTE))
  assert.equal(getZenRemainingMs(session, 999 * MINUTE), 0)
})

test('time is formatted as minutes or hours', () => {
  assert.equal(formatZenTime(25 * MINUTE), '25:00')
  assert.equal(formatZenTime(61_500), '01:02')
  assert.equal(formatZenTime(90 * MINUTE), '1:30:00')
})
