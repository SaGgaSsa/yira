import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getNextRunAt,
  isRoutineDue,
  normalizeRoutineInput,
  normalizeStoredRoutine,
  type RoutineSchedule,
} from './routines'

const validInput = {
  botId: 'bot-abc',
  workspaceId: 'workspace-1',
  name: 'Morning check',
  instruction: 'Look for new failures.',
  schedule: { kind: 'manual' },
  enabled: true,
}

function iso(date: Date): string {
  return date.toISOString()
}

// January 2026: the 1st is a Thursday, the 2nd a Friday, the 5th a Monday.
function routineAt(schedule: RoutineSchedule, anchorAt: Date, lastRunAt?: Date) {
  return {
    schedule,
    anchorAt: iso(anchorAt),
    ...(lastRunAt ? { lastRunAt: iso(lastRunAt) } : {}),
  }
}

test('normalizes a valid input', () => {
  const input = normalizeRoutineInput({ ...validInput, name: '  Morning check ', instruction: ' a\r\nb ' })
  assert.equal(input.name, 'Morning check')
  assert.equal(input.instruction, 'a\nb')
  assert.equal(input.id, undefined)
})

test('rejects invalid routine inputs', () => {
  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    ['bad bot id', { botId: 'nope' }, /bot id/],
    ['empty workspace', { workspaceId: ' ' }, /workspace/],
    ['empty name', { name: '  ' }, /name/],
    ['long name', { name: 'x'.repeat(61) }, /name/],
    ['empty instruction', { instruction: ' \n ' }, /instruction/],
    ['long instruction', { instruction: 'x'.repeat(8001) }, /instruction/],
    ['bad time', { schedule: { kind: 'daily', time: '24:00', days: [] } }, /HH:MM/],
    ['bad day', { schedule: { kind: 'daily', time: '09:00', days: [7] } }, /days/],
    ['interval under 15 minutes', { schedule: { kind: 'interval', every: 10, unit: 'minutes' } }, /at least/],
    ['interval over a week', { schedule: { kind: 'interval', every: 169, unit: 'hours' } }, /at most/],
    ['fractional interval', { schedule: { kind: 'interval', every: 1.5, unit: 'hours' } }, /whole number/],
    ['unknown schedule', { schedule: { kind: 'cron' } }, /schedule kind/],
    ['enabled not boolean', { enabled: 'yes' }, /enabled/],
    ['bad routine id', { id: 'bot-1' }, /id/],
  ]
  for (const [label, override, message] of cases) {
    assert.throws(() => normalizeRoutineInput({ ...validInput, ...override }), message, label)
  }
  assert.throws(() => normalizeRoutineInput(null), /object/)
})

test('sorts and de-duplicates daily days', () => {
  const input = normalizeRoutineInput({
    ...validInput,
    schedule: { kind: 'daily', time: '08:30', days: [5, 1, 5, 3] },
  })
  assert.deepEqual(input.schedule, { kind: 'daily', time: '08:30', days: [1, 3, 5] })
})

test('stored routines need run-state anchors and drop broken entries', () => {
  const stored = {
    ...validInput,
    id: 'routine-1',
    anchorAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    consecutiveFailures: 'many',
    lastResult: 'bogus',
  }
  const routine = normalizeStoredRoutine(stored)
  assert.equal(routine?.consecutiveFailures, 0)
  assert.equal(routine?.lastResult, undefined)
  assert.equal(normalizeStoredRoutine({ ...stored, anchorAt: undefined }), null)
  assert.equal(normalizeStoredRoutine({ ...stored, id: undefined }), null)
  assert.equal(normalizeStoredRoutine('text'), null)
})

test('daily next run is later the same day', () => {
  const routine = routineAt({ kind: 'daily', time: '18:00', days: [] }, new Date(2026, 0, 2, 9, 0))
  assert.deepEqual(getNextRunAt(routine, new Date(2026, 0, 2, 9, 5)), new Date(2026, 0, 2, 18, 0))
})

test('daily next run moves to the next day when the time has passed', () => {
  const routine = routineAt({ kind: 'daily', time: '08:00', days: [] }, new Date(2026, 0, 2, 9, 0))
  assert.deepEqual(getNextRunAt(routine, new Date(2026, 0, 2, 9, 5)), new Date(2026, 0, 3, 8, 0))
})

test('daily next run is strictly after the reference', () => {
  const routine = routineAt({ kind: 'daily', time: '09:00', days: [] }, new Date(2026, 0, 2, 9, 0))
  assert.deepEqual(getNextRunAt(routine, new Date(2026, 0, 2, 9, 5)), new Date(2026, 0, 3, 9, 0))
})

test('daily next run skips disallowed weekdays', () => {
  // Anchor on Thursday; only Saturday (6) is allowed.
  const routine = routineAt({ kind: 'daily', time: '10:00', days: [6] }, new Date(2026, 0, 1, 12, 0))
  assert.deepEqual(getNextRunAt(routine, new Date(2026, 0, 1, 12, 5)), new Date(2026, 0, 3, 10, 0))
})

test('weekday preset from a Friday evening runs on Monday', () => {
  const routine = routineAt({ kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] }, new Date(2026, 0, 2, 20, 0))
  assert.deepEqual(getNextRunAt(routine, new Date(2026, 0, 2, 20, 5)), new Date(2026, 0, 5, 9, 0))
})

test('interval next run is the reference plus the period', () => {
  const anchor = new Date(2026, 0, 2, 9, 0)
  const minutes = routineAt({ kind: 'interval', every: 30, unit: 'minutes' }, anchor)
  const hours = routineAt({ kind: 'interval', every: 2, unit: 'hours' }, anchor)
  assert.deepEqual(getNextRunAt(minutes, anchor), new Date(2026, 0, 2, 9, 30))
  assert.deepEqual(getNextRunAt(hours, anchor), new Date(2026, 0, 2, 11, 0))
})

test('the reference is the later of anchor and last run', () => {
  const schedule: RoutineSchedule = { kind: 'interval', every: 1, unit: 'hours' }
  const later = routineAt(schedule, new Date(2026, 0, 2, 9, 0), new Date(2026, 0, 2, 10, 0))
  const earlier = routineAt(schedule, new Date(2026, 0, 2, 11, 0), new Date(2026, 0, 2, 10, 0))
  assert.deepEqual(getNextRunAt(later, new Date(2026, 0, 2, 12, 0)), new Date(2026, 0, 2, 11, 0))
  assert.deepEqual(getNextRunAt(earlier, new Date(2026, 0, 2, 12, 0)), new Date(2026, 0, 2, 12, 0))
})

test('a long gap is due once and the next run follows the last run', () => {
  const schedule: RoutineSchedule = { kind: 'daily', time: '09:00', days: [] }
  const missed = routineAt(schedule, new Date(2026, 0, 1, 8, 0))
  const now = new Date(2026, 0, 20, 12, 0)
  assert.equal(isRoutineDue({ ...missed, enabled: true }, now), true)

  const afterRun = routineAt(schedule, new Date(2026, 0, 1, 8, 0), now)
  assert.equal(isRoutineDue({ ...afterRun, enabled: true }, now), false)
  assert.deepEqual(getNextRunAt(afterRun, now), new Date(2026, 0, 21, 9, 0))
})

test('manual routines are never due', () => {
  const routine = { ...routineAt({ kind: 'manual' }, new Date(2020, 0, 1)), enabled: true }
  assert.equal(getNextRunAt(routine, new Date(2026, 0, 1)), null)
  assert.equal(isRoutineDue(routine, new Date(2026, 0, 1)), false)
})

test('paused or disabled routines are never due', () => {
  const base = routineAt({ kind: 'interval', every: 15, unit: 'minutes' }, new Date(2026, 0, 1, 9, 0))
  const now = new Date(2026, 0, 2, 9, 0)
  assert.equal(isRoutineDue({ ...base, enabled: true }, now), true)
  assert.equal(isRoutineDue({ ...base, enabled: false }, now), false)
  assert.equal(isRoutineDue({ ...base, enabled: true, pausedAt: iso(now) }, now), false)
})

test('a routine is not due before its next run', () => {
  const routine = {
    ...routineAt({ kind: 'interval', every: 1, unit: 'hours' }, new Date(2026, 0, 2, 9, 0)),
    enabled: true,
  }
  assert.equal(isRoutineDue(routine, new Date(2026, 0, 2, 9, 59)), false)
  assert.equal(isRoutineDue(routine, new Date(2026, 0, 2, 10, 0)), true)
})
