import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, RotateCcw, Square, TimerReset } from 'lucide-react'
import type { TileState, TimerStatus } from '@shared/types'

interface TimerTileProps {
  tile: TileState
  onUpdate: (patch: Partial<TileState>) => void
}

const DEFAULT_DURATION_MS = 25 * 60 * 1000
const TIMER_PRESETS = [
  { label: '5m', ms: 5 * 60 * 1000 },
  { label: '10m', ms: 10 * 60 * 1000 },
  { label: '25m', ms: 25 * 60 * 1000 },
  { label: '45m', ms: 45 * 60 * 1000 },
]

function clampTimePart(value: number, max: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(max, Math.floor(value)))
}

function getDurationMs(tile: TileState): number {
  return Math.max(1000, tile.timerDurationMs ?? DEFAULT_DURATION_MS)
}

function getStoredRemainingMs(tile: TileState): number {
  return Math.max(0, tile.timerRemainingMs ?? getDurationMs(tile))
}

function getRemainingMs(tile: TileState, now: number): number {
  if (tile.timerStatus === 'running' && tile.timerEndsAt) {
    return Math.max(0, tile.timerEndsAt - now)
  }

  if (tile.timerStatus === 'done') return 0

  return getStoredRemainingMs(tile)
}

function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function splitMs(ms: number): { hours: number; minutes: number; seconds: number } {
  const totalSeconds = Math.floor(ms / 1000)
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}

function buildDurationMs(hours: number, minutes: number, seconds: number): number {
  return ((hours * 3600) + (minutes * 60) + seconds) * 1000
}

export function TimerTile({ tile, onUpdate }: TimerTileProps): React.ReactElement {
  const [now, setNow] = useState(() => Date.now())
  const [customTime, setCustomTime] = useState(() => splitMs(getDurationMs(tile)))
  const completionHandledRef = useRef<string | null>(null)

  const status: TimerStatus = tile.timerStatus ?? 'idle'
  const durationMs = getDurationMs(tile)
  const remainingMs = getRemainingMs(tile, now)
  const progress = durationMs > 0 ? 1 - (remainingMs / durationMs) : 0
  const customDurationMs = useMemo(
    () => buildDurationMs(customTime.hours, customTime.minutes, customTime.seconds),
    [customTime],
  )

  useEffect(() => {
    setCustomTime(splitMs(getDurationMs(tile)))
  }, [tile.id, tile.timerDurationMs])

  useEffect(() => {
    if (status !== 'running') return

    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 500)

    return () => window.clearInterval(interval)
  }, [status])

  useEffect(() => {
    if (status !== 'running' || !tile.timerEndsAt || remainingMs > 0) return

    const completionKey = `${tile.id}:${tile.timerEndsAt}`
    if (completionHandledRef.current === completionKey) return
    completionHandledRef.current = completionKey

    const completedAt = Date.now()
    void window.electron.notifications.requestAttention().catch((error: unknown) => {
      console.error('[TimerTile] Failed to request attention:', error)
    })
    onUpdate({
      timerStatus: 'done',
      timerRemainingMs: 0,
      timerEndsAt: undefined,
      timerCompletedAt: completedAt,
      timerNotifiedAt: completedAt,
    })
  }, [onUpdate, remainingMs, status, tile.id, tile.timerEndsAt])

  const loadDuration = useCallback(
    (nextDurationMs: number) => {
      if (nextDurationMs <= 0) return
      setNow(Date.now())
      onUpdate({
        timerDurationMs: nextDurationMs,
        timerRemainingMs: nextDurationMs,
        timerStatus: 'idle',
        timerEndsAt: undefined,
        timerCompletedAt: undefined,
        timerNotifiedAt: undefined,
      })
    },
    [onUpdate],
  )

  const startTimer = useCallback(() => {
    if (status === 'running') return

    const nextRemainingMs = status === 'done'
      ? durationMs
      : Math.max(1000, getStoredRemainingMs(tile))

    setNow(Date.now())
    onUpdate({
      timerDurationMs: durationMs,
      timerRemainingMs: nextRemainingMs,
      timerStatus: 'running',
      timerEndsAt: Date.now() + nextRemainingMs,
      timerCompletedAt: undefined,
      timerNotifiedAt: undefined,
    })
  }, [durationMs, onUpdate, status, tile])

  const stopTimer = useCallback(() => {
    if (status !== 'running') return

    const nextRemainingMs = getRemainingMs(tile, Date.now())
    setNow(Date.now())
    onUpdate({
      timerRemainingMs: nextRemainingMs,
      timerStatus: nextRemainingMs > 0 ? 'paused' : 'done',
      timerEndsAt: undefined,
    })
  }, [onUpdate, status, tile])

  const resetTimer = useCallback(() => {
    setNow(Date.now())
    completionHandledRef.current = null
    onUpdate({
      timerRemainingMs: durationMs,
      timerStatus: 'idle',
      timerEndsAt: undefined,
      timerCompletedAt: undefined,
      timerNotifiedAt: undefined,
    })
  }, [durationMs, onUpdate])

  const setPart = useCallback((part: keyof typeof customTime, value: number) => {
    setCustomTime((current) => ({
      ...current,
      [part]: clampTimePart(value, part === 'hours' ? 23 : 59),
    }))
  }, [])

  const statusLabel = status === 'running'
    ? 'Running'
    : status === 'paused'
      ? 'Stopped'
      : status === 'done'
        ? 'Done'
        : 'Ready'

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-bg-primary p-4 text-text-primary">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TimerReset size={16} className="text-text-secondary" />
          <span className="nd-label text-text-secondary">{statusLabel}</span>
        </div>
        <span className="nd-caption text-text-disabled">{Math.round(Math.min(1, Math.max(0, progress)) * 100)}%</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-3">
        <div className="font-mono text-5xl leading-none text-text-display">{formatTime(remainingMs)}</div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
          <div
            className="h-full rounded-full bg-text-display transition-[width]"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-4 gap-2">
        {TIMER_PRESETS.map((preset) => (
          <button
            key={preset.label}
            className="rounded-full border border-border-visible px-2 py-2 text-xs text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
            onClick={() => loadDuration(preset.ms)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-[1fr_1fr_1fr_auto] gap-2">
        <input
          className="min-w-0 rounded-full border border-border-visible bg-bg-tertiary px-3 py-2 text-center font-mono text-sm text-text-display outline-none"
          type="number"
          min={0}
          max={23}
          value={customTime.hours}
          onChange={(event) => setPart('hours', Number(event.target.value))}
          title="Hours"
        />
        <input
          className="min-w-0 rounded-full border border-border-visible bg-bg-tertiary px-3 py-2 text-center font-mono text-sm text-text-display outline-none"
          type="number"
          min={0}
          max={59}
          value={customTime.minutes}
          onChange={(event) => setPart('minutes', Number(event.target.value))}
          title="Minutes"
        />
        <input
          className="min-w-0 rounded-full border border-border-visible bg-bg-tertiary px-3 py-2 text-center font-mono text-sm text-text-display outline-none"
          type="number"
          min={0}
          max={59}
          value={customTime.seconds}
          onChange={(event) => setPart('seconds', Number(event.target.value))}
          title="Seconds"
        />
        <button
          className="rounded-full border border-border-visible px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => loadDuration(customDurationMs)}
          disabled={customDurationMs <= 0}
          title="Load duration"
        >
          Load
        </button>
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-3 gap-2">
        <button
          className="flex items-center justify-center gap-2 rounded-full border border-text-display px-3 py-2 text-sm text-text-display transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50"
          onClick={startTimer}
          disabled={status === 'running'}
          title="Start timer"
        >
          <Play size={14} />
          Start
        </button>
        <button
          className="flex items-center justify-center gap-2 rounded-full border border-border-visible px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50"
          onClick={stopTimer}
          disabled={status !== 'running'}
          title="Stop timer"
        >
          <Square size={13} />
          Stop
        </button>
        <button
          className="flex items-center justify-center gap-2 rounded-full border border-border-visible px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
          onClick={resetTimer}
          title="Reset timer"
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>
    </div>
  )
}
