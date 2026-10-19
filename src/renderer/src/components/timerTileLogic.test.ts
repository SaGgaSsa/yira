import assert from 'node:assert/strict'
import test from 'node:test'
import type { TileState } from '@shared/types'
import {
  TIMER_ADD_FIVE_MS,
  TIMER_DEFAULT_DURATION_MS,
  TIMER_MAX_DURATION_MS,
  TIMER_MIN_DURATION_MS,
  buildAddFivePatch,
  buildDurationPatch,
  buildPausePatch,
  buildResetPatch,
  buildResumePatch,
  buildStartPatch,
  clampTimerDurationMs,
  formatTimerTime,
  getTimerDurationMs,
  getTimerProgress,
  getTimerRemainingMs,
} from './timerTileLogic'

const NOW = 1_000_000
const MINUTE = 60_000

function timerTile(overrides: Partial<TileState> = {}): TileState {
  return {
    id: 'timer-1',
    type: 'timer',
    x: 0,
    y: 0,
    width: 900,
    height: 400,
    zIndex: 1,
    ...overrides,
  }
}

test('formatTimerTime renders minutes and seconds, with hours when needed', () => {
  assert.equal(formatTimerTime(0), '00:00')
  assert.equal(formatTimerTime(59_000), '00:59')
  assert.equal(formatTimerTime(59_500), '01:00')
  assert.equal(formatTimerTime(25 * MINUTE), '25:00')
  assert.equal(formatTimerTime(60 * MINUTE), '1:00:00')
  assert.equal(formatTimerTime((65 * MINUTE) + 5_000), '1:05:05')
  assert.equal(formatTimerTime(-5_000), '00:00')
})

test('clampTimerDurationMs keeps durations between one and 180 minutes', () => {
  assert.equal(clampTimerDurationMs(0), TIMER_MIN_DURATION_MS)
  assert.equal(clampTimerDurationMs(30_000), TIMER_MIN_DURATION_MS)
  assert.equal(clampTimerDurationMs(181 * MINUTE), TIMER_MAX_DURATION_MS)
  assert.equal(clampTimerDurationMs(45 * MINUTE), 45 * MINUTE)
  assert.equal(clampTimerDurationMs(Number.NaN), TIMER_DEFAULT_DURATION_MS)
})

test('getTimerDurationMs defaults to 25 minutes and clamps stored values', () => {
  assert.equal(getTimerDurationMs(timerTile()), TIMER_DEFAULT_DURATION_MS)
  assert.equal(getTimerDurationMs(timerTile({ timerDurationMs: 5 * MINUTE })), 5 * MINUTE)
  assert.equal(getTimerDurationMs(timerTile({ timerDurationMs: 10_000 })), TIMER_MIN_DURATION_MS)
})

test('remaining time follows endsAt while running and the stored value otherwise', () => {
  assert.equal(getTimerRemainingMs(timerTile({ timerStatus: 'running', timerEndsAt: NOW + 4 * MINUTE }), NOW), 4 * MINUTE)
  assert.equal(getTimerRemainingMs(timerTile({ timerStatus: 'running', timerEndsAt: NOW - 1 }), NOW), 0)
  assert.equal(getTimerRemainingMs(timerTile({ timerStatus: 'paused', timerRemainingMs: 3 * MINUTE }), NOW), 3 * MINUTE)
  assert.equal(getTimerRemainingMs(timerTile({ timerStatus: 'done', timerRemainingMs: 3 * MINUTE }), NOW), 0)
  assert.equal(getTimerRemainingMs(timerTile({ timerStatus: 'idle' }), NOW), TIMER_DEFAULT_DURATION_MS)
})

test('progress is clamped between zero and one', () => {
  const running = timerTile({ timerDurationMs: 10 * MINUTE, timerStatus: 'running', timerEndsAt: NOW + 5 * MINUTE })
  assert.equal(getTimerProgress(running, NOW), 0.5)
  assert.equal(getTimerProgress(timerTile({ timerStatus: 'idle' }), NOW), 0)
  assert.equal(getTimerProgress(timerTile({ timerStatus: 'done' }), NOW), 1)
  assert.equal(getTimerProgress(timerTile({
    timerDurationMs: 10 * MINUTE,
    timerStatus: 'running',
    timerEndsAt: NOW - MINUTE,
  }), NOW), 1)
})

test('starting from idle runs for the stored duration', () => {
  const patch = buildStartPatch(timerTile({ timerDurationMs: 15 * MINUTE }), NOW)

  assert.equal(patch.timerStatus, 'running')
  assert.equal(patch.timerDurationMs, 15 * MINUTE)
  assert.equal(patch.timerRemainingMs, 15 * MINUTE)
  assert.equal(patch.timerEndsAt, NOW + (15 * MINUTE))
})

test('starting from paused preserves the paused remaining time', () => {
  const patch = buildStartPatch(timerTile({ timerStatus: 'paused', timerRemainingMs: 4 * MINUTE }), NOW)

  assert.equal(patch.timerStatus, 'running')
  assert.equal(patch.timerRemainingMs, 4 * MINUTE)
  assert.equal(patch.timerEndsAt, NOW + (4 * MINUTE))
})

test('pausing stores the current remaining time and clears the end time', () => {
  const patch = buildPausePatch(timerTile({
    timerDurationMs: 10 * MINUTE,
    timerStatus: 'running',
    timerEndsAt: NOW + (6 * MINUTE),
  }), NOW)

  assert.equal(patch.timerStatus, 'paused')
  assert.equal(patch.timerRemainingMs, 6 * MINUTE)
  assert.equal(patch.timerEndsAt, undefined)
})

test('resuming continues from the stored remaining time', () => {
  const patch = buildResumePatch(timerTile({
    timerDurationMs: 10 * MINUTE,
    timerStatus: 'paused',
    timerRemainingMs: 2 * MINUTE,
  }), NOW)

  assert.equal(patch.timerStatus, 'running')
  assert.equal(patch.timerRemainingMs, 2 * MINUTE)
  assert.equal(patch.timerEndsAt, NOW + (2 * MINUTE))
})

test('adding five minutes while running extends the end time and duration', () => {
  const patch = buildAddFivePatch(timerTile({
    timerDurationMs: 10 * MINUTE,
    timerStatus: 'running',
    timerEndsAt: NOW + (5 * MINUTE),
  }), NOW)

  assert.equal(patch.timerStatus, 'running')
  assert.equal(patch.timerDurationMs, 15 * MINUTE)
  assert.equal(patch.timerRemainingMs, 10 * MINUTE)
  assert.equal(patch.timerEndsAt, NOW + (10 * MINUTE))
})

test('adding five minutes while running respects the maximum duration', () => {
  const patch = buildAddFivePatch(timerTile({
    timerDurationMs: 179 * MINUTE,
    timerStatus: 'running',
    timerEndsAt: NOW + (179 * MINUTE),
  }), NOW)

  assert.equal(patch.timerDurationMs, TIMER_MAX_DURATION_MS)
  assert.equal(patch.timerRemainingMs, 179 * MINUTE + TIMER_ADD_FIVE_MS)
})

test('adding five minutes while paused resumes with five extra minutes', () => {
  const patch = buildAddFivePatch(timerTile({
    timerDurationMs: 10 * MINUTE,
    timerStatus: 'paused',
    timerRemainingMs: 4 * MINUTE,
  }), NOW)

  assert.equal(patch.timerStatus, 'running')
  assert.equal(patch.timerDurationMs, 15 * MINUTE)
  assert.equal(patch.timerRemainingMs, 9 * MINUTE)
  assert.equal(patch.timerEndsAt, NOW + (9 * MINUTE))
})

test('adding five minutes after completion runs five minutes and keeps the duration', () => {
  const patch = buildAddFivePatch(timerTile({
    timerDurationMs: 45 * MINUTE,
    timerStatus: 'done',
    timerRemainingMs: 0,
  }), NOW)

  assert.equal(patch.timerStatus, 'running')
  assert.equal(patch.timerDurationMs, 45 * MINUTE)
  assert.equal(patch.timerRemainingMs, 5 * MINUTE)
  assert.equal(patch.timerEndsAt, NOW + (5 * MINUTE))
})

test('resetting returns to idle with the original duration', () => {
  const patch = buildResetPatch(timerTile({ timerDurationMs: 25 * MINUTE, timerStatus: 'done' }))

  assert.equal(patch.timerStatus, 'idle')
  assert.equal(patch.timerRemainingMs, 25 * MINUTE)
  assert.equal(patch.timerEndsAt, undefined)
  assert.equal(patch.timerCompletedAt, undefined)
  assert.equal(patch.timerNotifiedAt, undefined)
})

test('duration patches load a clamped idle timer', () => {
  const patch = buildDurationPatch(200 * MINUTE)

  assert.equal(patch.timerStatus, 'idle')
  assert.equal(patch.timerDurationMs, TIMER_MAX_DURATION_MS)
  assert.equal(patch.timerRemainingMs, TIMER_MAX_DURATION_MS)
  assert.equal(patch.timerEndsAt, undefined)
})
