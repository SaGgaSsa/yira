import {
  ROUTINE_MAX_INTERVAL_MINUTES,
  ROUTINE_MIN_INTERVAL_MINUTES,
  getNextRunAt,
} from '@shared/routines'
import type { Routine, RoutineSchedule } from '@shared/routines'

export type Translate = (key: string, options?: Record<string, unknown>) => string

/** Day values (0 = Sunday) in the order the editor shows them. */
export const ROUTINE_WEEK_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0]
export const ROUTINE_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5]

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export function weekdayKey(day: number): string {
  return WEEKDAY_KEYS[day] ?? WEEKDAY_KEYS[0]
}

export function getIntervalMinutes(every: number, unit: 'minutes' | 'hours'): number {
  return unit === 'hours' ? every * 60 : every
}

export function isIntervalValid(every: number, unit: 'minutes' | 'hours'): boolean {
  if (!Number.isInteger(every) || every <= 0) return false
  const minutes = getIntervalMinutes(every, unit)
  return minutes >= ROUTINE_MIN_INTERVAL_MINUTES && minutes <= ROUTINE_MAX_INTERVAL_MINUTES
}

function sameDays(days: number[], expected: readonly number[]): boolean {
  return days.length === expected.length && expected.every((day) => days.includes(day))
}

function formatDays(days: number[], t: Translate): string {
  return ROUTINE_WEEK_ORDER
    .filter((day) => days.includes(day))
    .map((day) => t(`bots.routines.weekdays.${weekdayKey(day)}`))
    .join(', ')
}

export function formatSchedule(schedule: RoutineSchedule, t: Translate): string {
  if (schedule.kind === 'manual') return t('bots.routines.scheduleManual')
  if (schedule.kind === 'interval') {
    const key = schedule.unit === 'hours' ? 'bots.routines.scheduleEveryHours' : 'bots.routines.scheduleEveryMinutes'
    return t(key, { count: schedule.every })
  }

  const { time, days } = schedule
  const distinctDays = [...new Set(days)]
  if (distinctDays.length === 0 || distinctDays.length === 7) return t('bots.routines.scheduleEveryDay', { time })
  if (sameDays(distinctDays, ROUTINE_WEEKDAYS)) return t('bots.routines.scheduleWeekdays', { time })
  return t('bots.routines.scheduleDays', { days: formatDays(distinctDays, t), time })
}

function formatAgo(elapsedMs: number, t: Translate): string {
  if (elapsedMs < MINUTE_MS) return t('bots.routines.agoNow')
  if (elapsedMs < HOUR_MS) return t('bots.routines.agoMinutes', { count: Math.floor(elapsedMs / MINUTE_MS) })
  if (elapsedMs < DAY_MS) return t('bots.routines.agoHours', { count: Math.floor(elapsedMs / HOUR_MS) })
  return t('bots.routines.agoDays', { count: Math.floor(elapsedMs / DAY_MS) })
}

function formatOutcome(routine: Pick<Routine, 'lastResult' | 'lastError'>, t: Translate): string {
  switch (routine.lastResult) {
    case 'started':
      return t('bots.routines.outcomeStarted')
    case 'no-update':
      return t('bots.routines.outcomeNoUpdate')
    case 'reported':
      return t('bots.routines.outcomeReported')
    case 'skipped-busy':
      return t('bots.routines.outcomeSkipped')
    case 'failed':
      return t('bots.routines.outcomeFailed', { error: routine.lastError ?? '' })
    default:
      return ''
  }
}

export function formatLastRun(
  routine: Pick<Routine, 'lastRunAt' | 'lastResult' | 'lastError'>,
  now: Date,
  t: Translate,
): string {
  const lastRun = routine.lastRunAt === undefined ? Number.NaN : new Date(routine.lastRunAt).getTime()
  if (!Number.isFinite(lastRun)) return t('bots.routines.neverRun')

  const ago = formatAgo(Math.max(0, now.getTime() - lastRun), t)
  const outcome = formatOutcome(routine, t)
  return outcome
    ? t('bots.routines.lastRunWithOutcome', { ago, outcome })
    : t('bots.routines.lastRun', { ago })
}

function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function formatNextRun(
  routine: Pick<Routine, 'schedule' | 'anchorAt' | 'lastRunAt' | 'enabled' | 'pausedAt'>,
  now: Date,
  t: Translate,
): string {
  if (!routine.enabled || routine.pausedAt || routine.schedule.kind === 'manual') return ''
  const next = getNextRunAt(routine, now)
  if (!next) return ''

  const untilMs = next.getTime() - now.getTime()
  if (untilMs <= 0) return t('bots.routines.nextSoon')
  if (untilMs < HOUR_MS) return t('bots.routines.nextInMinutes', { count: Math.max(1, Math.ceil(untilMs / MINUTE_MS)) })

  const time = formatClock(next)
  const dayOffset = Math.round((startOfDay(next) - startOfDay(now)) / DAY_MS)
  if (dayOffset <= 0) return t('bots.routines.nextToday', { time })
  if (dayOffset === 1) return t('bots.routines.nextTomorrow', { time })
  return t('bots.routines.nextDay', { day: t(`bots.routines.weekdays.${weekdayKey(next.getDay())}`), time })
}
