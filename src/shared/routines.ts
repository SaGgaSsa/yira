import { isValidBotId } from './bots'

export const ROUTINE_MIN_INTERVAL_MINUTES = 15
export const ROUTINE_MAX_INTERVAL_MINUTES = 7 * 24 * 60
export const ROUTINE_FAILURE_PAUSE_LIMIT = 5
export const MAX_ROUTINES = 100

export const ROUTINE_NAME_MAX_LENGTH = 60
export const ROUTINE_INSTRUCTION_MAX_LENGTH = 8000
export const ROUTINE_ERROR_MAX_LENGTH = 500

export type RoutineSchedule =
  | { kind: 'manual' }                                              // only "Run now"
  | { kind: 'daily'; time: string; days: number[] }                 // 'HH:MM' local time; days 0=Sunday..6, [] = every day
  | { kind: 'interval'; every: number; unit: 'minutes' | 'hours' }  // >= 15 minutes total

export type RoutineRunResult = 'started' | 'no-update' | 'reported' | 'skipped-busy' | 'failed'

export interface Routine {
  id: string                // `routine-<uuid>`
  botId: string
  workspaceId: string
  name: string              // 1..60
  instruction: string       // 1..8000; describes ONE run, not the schedule
  schedule: RoutineSchedule
  enabled: boolean
  /** Schedule reference: set when created, when the schedule changes and when re-enabled. Runs are due only after it. */
  anchorAt: string          // ISO
  lastRunAt?: string        // ISO, when the last run started (or was skipped/failed)
  lastResult?: RoutineRunResult
  lastError?: string        // <= 500 chars
  lastTileId?: string       // tile of the last started run
  consecutiveFailures: number
  /** Set when the scheduler paused the routine after too many failures. */
  pausedAt?: string
  createdAt: string
  updatedAt: string
}

/** What the renderer sends. Run state fields are owned by main and ignored here. */
export interface RoutineInput {
  id?: string
  botId: string
  workspaceId: string
  name: string
  instruction: string
  schedule: RoutineSchedule
  enabled: boolean
}

const ROUTINE_ID_PATTERN = /^routine-[A-Za-z0-9-]{1,64}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_WORKSPACE_ID_LENGTH = 128
const MAX_SEARCH_DAYS = 8
const MINUTE_MS = 60_000
const ROUTINE_RUN_RESULTS: readonly RoutineRunResult[] = ['started', 'no-update', 'reported', 'skipped-busy', 'failed']

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

export function isValidRoutineId(value: unknown): value is string {
  return typeof value === 'string' && ROUTINE_ID_PATTERN.test(value)
}

function isRoutineRunResult(value: unknown): value is RoutineRunResult {
  return typeof value === 'string' && (ROUTINE_RUN_RESULTS as readonly string[]).includes(value)
}

function normalizeBotId(value: unknown): string {
  if (!isValidBotId(value)) throw new Error('Routine bot id is invalid')
  return value
}

function normalizeWorkspaceId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Routine workspace id must be a string')
  const workspaceId = value.trim()
  if (workspaceId.length === 0) throw new Error('Routine workspace id must not be empty')
  if (workspaceId.length > MAX_WORKSPACE_ID_LENGTH) {
    throw new Error(`Routine workspace id must be ${MAX_WORKSPACE_ID_LENGTH} characters or fewer`)
  }
  return workspaceId
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Routine name must be a string')
  const name = value.trim()
  if (name.length === 0) throw new Error('Routine name is required')
  if (name.length > ROUTINE_NAME_MAX_LENGTH) {
    throw new Error(`Routine name must be ${ROUTINE_NAME_MAX_LENGTH} characters or fewer`)
  }
  return name
}

function normalizeInstruction(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Routine instruction must be a string')
  const instruction = value.replace(/\r\n?/g, '\n').trim()
  if (instruction.length === 0) throw new Error('Routine instruction is required')
  if (instruction.length > ROUTINE_INSTRUCTION_MAX_LENGTH) {
    throw new Error(`Routine instruction must be ${ROUTINE_INSTRUCTION_MAX_LENGTH} characters or fewer`)
  }
  return instruction
}

function normalizeTime(value: unknown): string {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
    throw new Error('Routine time must be HH:MM in 24-hour format')
  }
  return value
}

function normalizeDays(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error('Routine days must be an array')
  for (const day of value) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error('Routine days must be integers from 0 (Sunday) to 6 (Saturday)')
    }
  }
  return [...new Set(value as number[])].sort((a, b) => a - b)
}

function normalizeInterval(every: unknown, unit: unknown): { every: number; unit: 'minutes' | 'hours' } {
  if (unit !== 'minutes' && unit !== 'hours') throw new Error('Routine interval unit must be "minutes" or "hours"')
  if (typeof every !== 'number' || !Number.isInteger(every) || every <= 0) {
    throw new Error('Routine interval must be a positive whole number')
  }
  const totalMinutes = unit === 'hours' ? every * 60 : every
  if (totalMinutes < ROUTINE_MIN_INTERVAL_MINUTES) {
    throw new Error(`Routine interval must be at least ${ROUTINE_MIN_INTERVAL_MINUTES} minutes`)
  }
  if (totalMinutes > ROUTINE_MAX_INTERVAL_MINUTES) {
    throw new Error(`Routine interval must be at most ${ROUTINE_MAX_INTERVAL_MINUTES} minutes`)
  }
  return { every, unit }
}

function normalizeSchedule(value: unknown): RoutineSchedule {
  if (!isPlainRecord(value)) throw new Error('Routine schedule must be an object')
  if (value.kind === 'manual') return { kind: 'manual' }
  if (value.kind === 'daily') return { kind: 'daily', time: normalizeTime(value.time), days: normalizeDays(value.days) }
  if (value.kind === 'interval') return { kind: 'interval', ...normalizeInterval(value.every, value.unit) }
  throw new Error('Routine schedule kind must be "manual", "daily" or "interval"')
}

function normalizeEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Routine enabled must be a boolean')
  return value
}

export function normalizeRoutineInput(raw: unknown): RoutineInput {
  if (!isPlainRecord(raw)) throw new Error('Routine input must be an object')

  const id = raw.id
  if (id !== undefined && !isValidRoutineId(id)) throw new Error('Routine id is invalid')

  return {
    ...(id !== undefined ? { id } : {}),
    botId: normalizeBotId(raw.botId),
    workspaceId: normalizeWorkspaceId(raw.workspaceId),
    name: normalizeName(raw.name),
    instruction: normalizeInstruction(raw.instruction),
    schedule: normalizeSchedule(raw.schedule),
    enabled: normalizeEnabled(raw.enabled),
  }
}

function readOptionalString(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, maxLength) : undefined
}

function readFailureCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
}

/** Tolerant reader for disk data: returns null when the entry is broken. */
export function normalizeStoredRoutine(raw: unknown): Routine | null {
  if (!isPlainRecord(raw)) return null
  let input: RoutineInput
  try {
    input = normalizeRoutineInput(raw)
  } catch {
    return null
  }

  const { id } = input
  if (!isValidRoutineId(id)) return null
  if (typeof raw.anchorAt !== 'string' || typeof raw.createdAt !== 'string' || typeof raw.updatedAt !== 'string') {
    return null
  }

  const lastRunAt = readOptionalString(raw.lastRunAt, 64)
  const lastError = readOptionalString(raw.lastError, ROUTINE_ERROR_MAX_LENGTH)
  const lastTileId = readOptionalString(raw.lastTileId, 128)
  const pausedAt = readOptionalString(raw.pausedAt, 64)

  return {
    ...input,
    id,
    anchorAt: raw.anchorAt,
    ...(lastRunAt !== undefined ? { lastRunAt } : {}),
    ...(isRoutineRunResult(raw.lastResult) ? { lastResult: raw.lastResult } : {}),
    ...(lastError !== undefined ? { lastError } : {}),
    ...(lastTileId !== undefined ? { lastTileId } : {}),
    consecutiveFailures: readFailureCount(raw.consecutiveFailures),
    ...(pausedAt !== undefined ? { pausedAt } : {}),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':').map(Number)
  return { hours, minutes }
}

function getReference(routine: Pick<Routine, 'anchorAt' | 'lastRunAt'>): Date | null {
  const anchor = new Date(routine.anchorAt).getTime()
  const lastRun = routine.lastRunAt === undefined ? Number.NaN : new Date(routine.lastRunAt).getTime()
  const reference = Math.max(anchor, lastRun)
  if (Number.isFinite(reference)) return new Date(reference)
  return Number.isFinite(anchor) ? new Date(anchor) : null
}

function getNextDailyRunAt(schedule: { time: string; days: number[] }, reference: Date): Date | null {
  const { hours, minutes } = parseTime(schedule.time)
  for (let offset = 0; offset < MAX_SEARCH_DAYS; offset += 1) {
    const candidate = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + offset, hours, minutes)
    const dayAllowed = schedule.days.length === 0 || schedule.days.includes(candidate.getDay())
    if (dayAllowed && candidate.getTime() > reference.getTime()) return candidate
  }
  return null
}

/**
 * Next time the routine is due, based on the later of its anchor and last run.
 * A result in the past means the routine is due now; callers run it once, never once per missed slot.
 */
export function getNextRunAt(
  routine: Pick<Routine, 'schedule' | 'anchorAt' | 'lastRunAt'>,
  _now: Date,
): Date | null {
  const { schedule } = routine
  if (schedule.kind === 'manual') return null

  const reference = getReference(routine)
  if (!reference) return null

  if (schedule.kind === 'interval') {
    const periodMinutes = schedule.unit === 'hours' ? schedule.every * 60 : schedule.every
    return new Date(reference.getTime() + periodMinutes * MINUTE_MS)
  }
  return getNextDailyRunAt(schedule, reference)
}

export function isRoutineDue(
  routine: Pick<Routine, 'schedule' | 'anchorAt' | 'lastRunAt' | 'enabled' | 'pausedAt'>,
  now: Date,
): boolean {
  if (!routine.enabled || routine.pausedAt) return false
  const next = getNextRunAt(routine, now)
  return next !== null && next.getTime() <= now.getTime()
}
