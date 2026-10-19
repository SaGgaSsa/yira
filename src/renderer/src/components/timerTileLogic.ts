import type { TileState } from '@shared/types'

export const TIMER_MIN_DURATION_MS = 60_000
export const TIMER_MAX_DURATION_MS = 180 * 60_000
export const TIMER_DEFAULT_DURATION_MS = 25 * 60_000
export const TIMER_ADD_FIVE_MS = 5 * 60_000

function padTimePart(value: number): string {
  return value.toString().padStart(2, '0')
}

export function formatTimerTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${padTimePart(minutes)}:${padTimePart(seconds)}`
  }

  return `${padTimePart(minutes)}:${padTimePart(seconds)}`
}

export function clampTimerDurationMs(ms: number): number {
  if (!Number.isFinite(ms)) return TIMER_DEFAULT_DURATION_MS
  return Math.min(TIMER_MAX_DURATION_MS, Math.max(TIMER_MIN_DURATION_MS, Math.round(ms)))
}

export function getTimerDurationMs(tile: TileState): number {
  return clampTimerDurationMs(tile.timerDurationMs ?? TIMER_DEFAULT_DURATION_MS)
}

export function getTimerRemainingMs(tile: TileState, now: number): number {
  if (tile.timerStatus === 'done') return 0

  if (tile.timerStatus === 'running' && tile.timerEndsAt !== undefined) {
    return Math.max(0, tile.timerEndsAt - now)
  }

  return Math.max(0, tile.timerRemainingMs ?? getTimerDurationMs(tile))
}

export function getTimerProgress(tile: TileState, now: number): number {
  if (tile.timerStatus === 'done') return 1

  const durationMs = getTimerDurationMs(tile)
  if (durationMs <= 0) return 0

  const progress = 1 - (getTimerRemainingMs(tile, now) / durationMs)
  return Math.min(1, Math.max(0, progress))
}

function buildRunningPatch(durationMs: number, remainingMs: number, now: number): Partial<TileState> {
  return {
    timerDurationMs: durationMs,
    timerRemainingMs: remainingMs,
    timerStatus: 'running',
    timerEndsAt: now + remainingMs,
    timerCompletedAt: undefined,
    timerNotifiedAt: undefined,
  }
}

export function buildStartPatch(tile: TileState, now: number): Partial<TileState> {
  const durationMs = getTimerDurationMs(tile)
  const remainingMs = tile.timerStatus === 'paused'
    ? Math.max(1000, getTimerRemainingMs(tile, now))
    : durationMs

  return buildRunningPatch(durationMs, remainingMs, now)
}

export function buildPausePatch(tile: TileState, now: number): Partial<TileState> {
  return {
    timerRemainingMs: getTimerRemainingMs(tile, now),
    timerStatus: 'paused',
    timerEndsAt: undefined,
    timerCompletedAt: undefined,
    timerNotifiedAt: undefined,
  }
}

export function buildResumePatch(tile: TileState, now: number): Partial<TileState> {
  const durationMs = getTimerDurationMs(tile)
  const remainingMs = Math.max(1000, getTimerRemainingMs(tile, now))
  return buildRunningPatch(durationMs, remainingMs, now)
}

export function buildAddFivePatch(tile: TileState, now: number): Partial<TileState> {
  const currentDurationMs = getTimerDurationMs(tile)

  if (tile.timerStatus === 'running') {
    const remainingMs = getTimerRemainingMs(tile, now) + TIMER_ADD_FIVE_MS
    return buildRunningPatch(clampTimerDurationMs(currentDurationMs + TIMER_ADD_FIVE_MS), remainingMs, now)
  }

  if (tile.timerStatus === 'paused') {
    const remainingMs = getTimerRemainingMs(tile, now) + TIMER_ADD_FIVE_MS
    return buildRunningPatch(clampTimerDurationMs(currentDurationMs + TIMER_ADD_FIVE_MS), remainingMs, now)
  }

  // Extra time after completion keeps the configured duration so Done restores it.
  return buildRunningPatch(currentDurationMs, TIMER_ADD_FIVE_MS, now)
}

export function buildResetPatch(tile: TileState): Partial<TileState> {
  const durationMs = getTimerDurationMs(tile)

  return {
    timerRemainingMs: durationMs,
    timerStatus: 'idle',
    timerEndsAt: undefined,
    timerCompletedAt: undefined,
    timerNotifiedAt: undefined,
  }
}

export function buildDurationPatch(ms: number): Partial<TileState> {
  const durationMs = clampTimerDurationMs(ms)

  return {
    timerDurationMs: durationMs,
    timerRemainingMs: durationMs,
    timerStatus: 'idle',
    timerEndsAt: undefined,
    timerCompletedAt: undefined,
    timerNotifiedAt: undefined,
  }
}
