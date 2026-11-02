import assert from 'node:assert/strict'
import test from 'node:test'
import type { Routine } from '@shared/routines'
import { formatLastRun, formatNextRun, formatSchedule, isIntervalValid } from './routineSchedule'

function t(key: string, options: Record<string, unknown> = {}): string {
  const values = Object.entries(options).map(([name, value]) => `${name}=${String(value)}`)
  const short = key.replace('bots.routines.', '')
  return values.length > 0 ? `${short}(${values.join(',')})` : short
}

function localIso(year: number, month: number, day: number, hours: number, minutes: number): string {
  return new Date(year, month - 1, day, hours, minutes).toISOString()
}

// 2026-11-04 is a Wednesday.
const NOW = new Date(2026, 10, 4, 8, 0)

function routine(overrides: Partial<Routine>): Routine {
  return {
    id: 'routine-1',
    botId: 'bot-1',
    workspaceId: 'ws-1',
    name: 'Daily',
    instruction: 'Do it',
    schedule: { kind: 'daily', time: '09:00', days: [] },
    enabled: true,
    anchorAt: localIso(2026, 11, 4, 7, 0),
    consecutiveFailures: 0,
    createdAt: localIso(2026, 11, 4, 7, 0),
    updatedAt: localIso(2026, 11, 4, 7, 0),
    ...overrides,
  }
}

test('formatSchedule describes every schedule kind', () => {
  assert.equal(formatSchedule({ kind: 'manual' }, t), 'scheduleManual')
  assert.equal(formatSchedule({ kind: 'daily', time: '09:00', days: [] }, t), 'scheduleEveryDay(time=09:00)')
  assert.equal(
    formatSchedule({ kind: 'daily', time: '09:00', days: [0, 1, 2, 3, 4, 5, 6] }, t),
    'scheduleEveryDay(time=09:00)',
  )
  assert.equal(
    formatSchedule({ kind: 'daily', time: '09:00', days: [5, 4, 3, 2, 1] }, t),
    'scheduleWeekdays(time=09:00)',
  )
  assert.equal(
    formatSchedule({ kind: 'daily', time: '18:30', days: [0, 3, 1] }, t),
    'scheduleDays(days=weekdays.mon, weekdays.wed, weekdays.sun,time=18:30)',
  )
  assert.equal(
    formatSchedule({ kind: 'interval', every: 2, unit: 'hours' }, t),
    'scheduleEveryHours(count=2)',
  )
  assert.equal(
    formatSchedule({ kind: 'interval', every: 30, unit: 'minutes' }, t),
    'scheduleEveryMinutes(count=30)',
  )
})

test('formatLastRun reports age and outcome', () => {
  assert.equal(formatLastRun({}, NOW, t), 'neverRun')
  const fiveMinutesAgo = new Date(NOW.getTime() - 5 * 60_000).toISOString()
  assert.equal(
    formatLastRun({ lastRunAt: fiveMinutesAgo, lastResult: 'no-update' }, NOW, t),
    'lastRunWithOutcome(ago=agoMinutes(count=5),outcome=outcomeNoUpdate)',
  )
  assert.equal(
    formatLastRun({ lastRunAt: fiveMinutesAgo, lastResult: 'reported' }, NOW, t),
    'lastRunWithOutcome(ago=agoMinutes(count=5),outcome=outcomeReported)',
  )
  assert.equal(
    formatLastRun({ lastRunAt: fiveMinutesAgo, lastResult: 'started' }, NOW, t),
    'lastRunWithOutcome(ago=agoMinutes(count=5),outcome=outcomeStarted)',
  )
  assert.equal(
    formatLastRun({ lastRunAt: fiveMinutesAgo, lastResult: 'skipped-busy' }, NOW, t),
    'lastRunWithOutcome(ago=agoMinutes(count=5),outcome=outcomeSkipped)',
  )
  assert.equal(
    formatLastRun({ lastRunAt: fiveMinutesAgo, lastResult: 'failed', lastError: 'boom' }, NOW, t),
    'lastRunWithOutcome(ago=agoMinutes(count=5),outcome=outcomeFailed(error=boom))',
  )
  assert.equal(formatLastRun({ lastRunAt: fiveMinutesAgo }, NOW, t), 'lastRun(ago=agoMinutes(count=5))')

  const threeHoursAgo = new Date(NOW.getTime() - 3 * 3_600_000).toISOString()
  assert.equal(formatLastRun({ lastRunAt: threeHoursAgo }, NOW, t), 'lastRun(ago=agoHours(count=3))')
  const twoDaysAgo = new Date(NOW.getTime() - 50 * 3_600_000).toISOString()
  assert.equal(formatLastRun({ lastRunAt: twoDaysAgo }, NOW, t), 'lastRun(ago=agoDays(count=2))')
  assert.equal(formatLastRun({ lastRunAt: NOW.toISOString() }, NOW, t), 'lastRun(ago=agoNow)')
})

test('formatNextRun is empty for manual, disabled or paused routines', () => {
  assert.equal(formatNextRun(routine({ schedule: { kind: 'manual' } }), NOW, t), '')
  assert.equal(formatNextRun(routine({ enabled: false }), NOW, t), '')
  assert.equal(formatNextRun(routine({ pausedAt: NOW.toISOString() }), NOW, t), '')
})

test('formatNextRun names today, tomorrow, weekday and minutes', () => {
  assert.equal(
    formatNextRun(routine({ schedule: { kind: 'daily', time: '09:00', days: [] } }), new Date(2026, 10, 4, 7, 30), t),
    'nextToday(time=09:00)',
  )
  assert.equal(
    formatNextRun(routine({ schedule: { kind: 'daily', time: '09:00', days: [] } }), new Date(2026, 10, 4, 8, 20), t),
    'nextInMinutes(count=40)',
  )
  assert.equal(
    formatNextRun(
      routine({
        schedule: { kind: 'daily', time: '09:00', days: [] },
        anchorAt: localIso(2026, 11, 4, 10, 0),
      }),
      new Date(2026, 10, 4, 10, 30),
      t,
    ),
    'nextTomorrow(time=09:00)',
  )
  assert.equal(
    formatNextRun(
      routine({
        schedule: { kind: 'daily', time: '09:00', days: [1] },
        anchorAt: localIso(2026, 11, 4, 10, 0),
      }),
      new Date(2026, 10, 4, 10, 30),
      t,
    ),
    'nextDay(day=weekdays.mon,time=09:00)',
  )
})

test('formatNextRun says soon when the routine is already due', () => {
  assert.equal(
    formatNextRun(routine({ schedule: { kind: 'interval', every: 30, unit: 'minutes' }, anchorAt: localIso(2026, 11, 4, 6, 0) }), NOW, t),
    'nextSoon',
  )
})

test('isIntervalValid enforces the minimum and whole numbers', () => {
  assert.equal(isIntervalValid(15, 'minutes'), true)
  assert.equal(isIntervalValid(14, 'minutes'), false)
  assert.equal(isIntervalValid(1, 'hours'), true)
  assert.equal(isIntervalValid(1.5, 'hours'), false)
  assert.equal(isIntervalValid(0, 'hours'), false)
  assert.equal(isIntervalValid(Number.NaN, 'minutes'), false)
})
