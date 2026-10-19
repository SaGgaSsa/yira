import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Minus, Moon, Pause, Play, Plus, Square } from 'lucide-react'
import type { TileState, TimerStatus } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useZenStore, type ZenTimerSnapshot } from '@/store/zenStore'
import { createNativeAttentionDelayScheduler } from '@/utils/nativeAttentionDelay'
import {
  TIMER_ADD_FIVE_MS,
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

interface TimerTileProps {
  tile: TileState
  isFocused: boolean
  onUpdate: (patch: Partial<TileState>) => void
}

const MINUTE_MS = 60_000
const TIMER_PRESET_MINUTES = [5, 15, 25, 45, 60] as const
const PROGRESS_DOT_COUNT = 24

const primaryButtonClass = 'flex h-12 min-w-0 items-center justify-center gap-2 rounded-full bg-text-display px-4 text-text-inverse transition-opacity hover:opacity-90'
const secondaryButtonClass = 'flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-border-visible px-4 text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display'
const iconButtonClass = 'flex size-11 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40'

function formatClockTime(endsAt: number): string {
  const date = new Date(endsAt)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

function getStatusLabel(status: TimerStatus): string {
  if (status === 'running') return 'timer.statusRunning'
  if (status === 'paused') return 'timer.statusPaused'
  if (status === 'done') return 'timer.statusDone'
  return 'timer.statusReady'
}

function getStatusDotClass(status: TimerStatus): string {
  if (status === 'running') return 'bg-accent animate-pulse'
  if (status === 'paused') return 'bg-warning'
  if (status === 'done') return 'bg-accent'
  return 'bg-text-muted'
}

function getDisplayClass(status: TimerStatus): string {
  if (status === 'done') return 'text-accent animate-pulse'
  if (status === 'paused') return 'text-text-secondary'
  return 'text-text-display'
}

function toZenSnapshot(patch: Partial<TileState>, now: number): ZenTimerSnapshot {
  const status = patch.timerStatus === 'paused' ? 'paused' : 'running'
  const endsAt = status === 'running' ? patch.timerEndsAt ?? null : null
  const durationMs = patch.timerDurationMs ?? 0
  const remainingMs = status === 'running' && endsAt !== null
    ? Math.max(0, endsAt - now)
    : patch.timerRemainingMs ?? 0

  return { status, endsAt, remainingMs, durationMs }
}

export function TimerTile({ tile, isFocused, onUpdate }: TimerTileProps): React.ReactElement {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  const workspaceId = useCanvasStore((s) => s.activeWorkspaceId)
  const stoppedTileIds = useZenStore((s) => s.stoppedTileIds)
  const attentionDelayEnabled = useSettingsStore((s) => s.notifications.attentionDelayEnabled)
  const completionHandledRef = useRef<string | null>(null)
  const pendingNotificationKeyRef = useRef<string | null>(null)
  const notificationsMutedRef = useRef(tile.notificationsMuted === true)
  const isFocusedRef = useRef(isFocused)
  const nativeAttentionSchedulerRef = useRef(createNativeAttentionDelayScheduler())
  const mountedRef = useRef(false)

  const status: TimerStatus = tile.timerStatus ?? 'idle'
  const durationMs = getTimerDurationMs(tile)
  const remainingMs = getTimerRemainingMs(tile, now)
  const progress = getTimerProgress(tile, now)
  const durationMinutes = Math.round(durationMs / MINUTE_MS)
  const zenEnabled = tile.timerZen === true
  const stoppedByZen = stoppedTileIds.includes(tile.id)

  const cancelNativeAttention = useCallback(() => {
    pendingNotificationKeyRef.current = null
    nativeAttentionSchedulerRef.current.cancel(tile.id)
  }, [tile.id])

  const finishZenSession = useCallback((reason: 'completed' | 'stopped') => {
    const zen = useZenStore.getState()
    if (zen.session?.tileId === tile.id) zen.finish(reason)
  }, [tile.id])

  const startZenSession = useCallback((patch: Partial<TileState>, atTime: number) => {
    if (!zenEnabled || !workspaceId) return

    const zen = useZenStore.getState()
    const snapshot = toZenSnapshot(patch, atTime)
    if (zen.session?.tileId === tile.id) {
      zen.sync(tile.id, snapshot)
      return
    }

    zen.start({ workspaceId, tileId: tile.id, ...snapshot }, atTime)
  }, [tile.id, workspaceId, zenEnabled])

  useEffect(() => {
    if (status !== 'running') return

    const interval = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(interval)
  }, [status])

  useEffect(() => {
    notificationsMutedRef.current = tile.notificationsMuted === true
    if (tile.notificationsMuted !== true) return
    nativeAttentionSchedulerRef.current.cancel(tile.id)
  }, [tile.id, tile.notificationsMuted])

  useEffect(() => {
    isFocusedRef.current = isFocused
    if (isFocused) nativeAttentionSchedulerRef.current.cancel(tile.id)
  }, [isFocused, tile.id])

  useEffect(() => {
    return () => nativeAttentionSchedulerRef.current.cancel(tile.id)
  }, [tile.id])

  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true
    if (status !== 'running' || !zenEnabled || tile.timerEndsAt === undefined) return

    const atTime = Date.now()
    if (tile.timerEndsAt <= atTime || !workspaceId) return

    const zen = useZenStore.getState()
    if (zen.session || zen.stoppedTileIds.includes(tile.id)) return

    zen.start({
      workspaceId,
      tileId: tile.id,
      status: 'running',
      endsAt: tile.timerEndsAt,
      remainingMs: Math.max(0, tile.timerEndsAt - atTime),
      durationMs,
    }, atTime)
    setNow(atTime)
  }, [durationMs, status, tile.id, tile.timerEndsAt, workspaceId, zenEnabled])

  useEffect(() => {
    if (!stoppedByZen) return

    cancelNativeAttention()
    completionHandledRef.current = null
    onUpdate(buildResetPatch(tile))
    useZenStore.getState().acknowledgeStop(tile.id)
  }, [cancelNativeAttention, onUpdate, stoppedByZen, tile])

  useEffect(() => {
    if (status !== 'running' || tile.timerEndsAt === undefined || remainingMs > 0) return

    const completionKey = `${tile.id}:${tile.timerEndsAt}`
    if (completionHandledRef.current === completionKey) return
    completionHandledRef.current = completionKey
    pendingNotificationKeyRef.current = completionKey

    const completedAt = Date.now()
    // App may have finished the zen session already; it owns the zen completion alert.
    if (zenEnabled) {
      finishZenSession('completed')
    } else {
      nativeAttentionSchedulerRef.current.schedule({
        tileId: tile.id,
        delayEnabled: attentionDelayEnabled,
        muted: tile.notificationsMuted === true,
        shouldRequestAttention: () => (
          pendingNotificationKeyRef.current === completionKey &&
          !notificationsMutedRef.current &&
          !isFocusedRef.current
        ),
        requestAttention: () => {
          void window.electron.notifications.requestAttention().catch((error: unknown) => {
            console.error('[TimerTile] Failed to request attention:', error)
          })
        },
      })
    }

    onUpdate({
      timerStatus: 'done',
      timerRemainingMs: 0,
      timerEndsAt: undefined,
      timerCompletedAt: completedAt,
      timerNotifiedAt: completedAt,
    })
  }, [
    attentionDelayEnabled,
    finishZenSession,
    onUpdate,
    remainingMs,
    status,
    tile.id,
    tile.notificationsMuted,
    tile.timerEndsAt,
    zenEnabled,
  ])

  const applyDuration = useCallback((nextDurationMs: number) => {
    const atTime = Date.now()
    setNow(atTime)
    completionHandledRef.current = null
    cancelNativeAttention()
    onUpdate(buildDurationPatch(nextDurationMs))
    finishZenSession('stopped')
  }, [cancelNativeAttention, finishZenSession, onUpdate])

  const handleStart = useCallback(() => {
    const atTime = Date.now()
    setNow(atTime)
    cancelNativeAttention()
    const patch = status === 'paused'
      ? buildResumePatch(tile, atTime)
      : buildStartPatch(tile, atTime)
    onUpdate(patch)
    startZenSession(patch, atTime)
  }, [cancelNativeAttention, onUpdate, startZenSession, status, tile])

  const handlePause = useCallback(() => {
    if (status !== 'running') return

    const atTime = Date.now()
    setNow(atTime)
    const patch = buildPausePatch(tile, atTime)
    onUpdate(patch)

    const zen = useZenStore.getState()
    if (zen.session?.tileId === tile.id) {
      zen.sync(tile.id, {
        status: 'paused',
        endsAt: null,
        remainingMs: patch.timerRemainingMs ?? 0,
        durationMs,
      })
    }
  }, [durationMs, onUpdate, status, tile])

  const handleAddFive = useCallback(() => {
    const atTime = Date.now()
    setNow(atTime)
    cancelNativeAttention()
    const patch = buildAddFivePatch(tile, atTime)
    onUpdate(patch)
    startZenSession(patch, atTime)
  }, [cancelNativeAttention, onUpdate, startZenSession, tile])

  const handleStop = useCallback(() => {
    const atTime = Date.now()
    setNow(atTime)
    cancelNativeAttention()
    completionHandledRef.current = null
    onUpdate(buildResetPatch(tile))
    finishZenSession('stopped')
  }, [cancelNativeAttention, finishZenSession, onUpdate, tile])

  const handleToggleZen = useCallback(() => {
    onUpdate({ timerZen: !zenEnabled })
  }, [onUpdate, zenEnabled])

  const adjustDuration = useCallback((deltaMs: number) => {
    applyDuration(clampTimerDurationMs(durationMs + deltaMs))
  }, [applyDuration, durationMs])

  const statusLabel = t(getStatusLabel(status))
  const displayClass = getDisplayClass(status)
  const dotClass = getStatusDotClass(status)

  let legend = t('timer.durationMinutes', { count: durationMinutes })
  if (status === 'running') {
    legend = t('timer.endsAt', { time: formatClockTime(tile.timerEndsAt ?? now + remainingMs) })
  } else if (status === 'paused') {
    legend = t('timer.pausedRemaining', { count: Math.ceil(remainingMs / MINUTE_MS) })
  } else if (status === 'done') {
    legend = t('timer.finished', { count: durationMinutes })
  }

  const filledDots = status === 'done' ? PROGRESS_DOT_COUNT : Math.round(progress * PROGRESS_DOT_COUNT)

  return (
    <div
      className="@container flex h-full min-h-0 w-full flex-col overflow-hidden bg-bg-primary px-3 py-3 text-text-primary @md:px-4 @md:py-4 @2xl:px-5 @2xl:py-5"
      style={{ containerType: 'size' }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 [@container_(max-height:14rem)]:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dotClass}`} />
          <span className="nd-label truncate text-text-secondary">{statusLabel}</span>
        </div>
        {zenEnabled && status !== 'idle' ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent-subtle px-2 py-1 text-accent">
            <Moon size={12} strokeWidth={2} />
            <span className="nd-label">{t('zen.label')}</span>
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 @3xl:mt-4 @3xl:flex-row @3xl:items-stretch @3xl:gap-6 [@container_(max-height:14rem)]:hidden">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 @3xl:gap-4">
          <div className="flex min-w-0 items-center justify-center gap-2 @md:gap-4">
            {status === 'idle' ? (
              <button
                type="button"
                className={iconButtonClass}
                aria-label={t('timer.subtractMinute')}
                onClick={() => adjustDuration(-MINUTE_MS)}
                disabled={durationMs <= TIMER_MIN_DURATION_MS}
              >
                <Minus size={18} />
              </button>
            ) : null}

            <div className={`min-w-0 whitespace-nowrap text-center font-display text-[clamp(2rem,min(15cqw,40cqh),9rem)] font-black leading-none tracking-tight tabular-nums ${displayClass}`}>
              {formatTimerTime(remainingMs)}
            </div>

            {status === 'idle' ? (
              <button
                type="button"
                className={iconButtonClass}
                aria-label={t('timer.addMinute')}
                onClick={() => adjustDuration(MINUTE_MS)}
                disabled={durationMs >= TIMER_MAX_DURATION_MS}
              >
                <Plus size={18} />
              </button>
            ) : null}
          </div>

          <div
            className="flex items-center justify-center gap-[2px] @md:gap-1.5"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={PROGRESS_DOT_COUNT}
            aria-valuenow={filledDots}
          >
            {Array.from({ length: PROGRESS_DOT_COUNT }, (_, index) => {
              const dotClass = status === 'done'
                ? 'bg-accent'
                : index < filledDots
                  ? 'bg-text-display'
                  : 'bg-bg-tertiary'
              return (
                <span
                  key={index}
                  className={`size-[9px] shrink-0 rounded-full ${dotClass}`}
                />
              )
            })}
          </div>

          <div className="nd-caption text-center text-text-muted">{legend}</div>
        </div>

        <div className="flex shrink-0 flex-col justify-end gap-2 @3xl:w-80 @3xl:justify-center @3xl:gap-3">
          {status === 'idle' ? (
            <>
              <div className="flex flex-col gap-2 [@container_(max-height:20rem)]:hidden @3xl:gap-3">
                <div className="flex flex-wrap justify-center gap-1.5 @3xl:justify-start">
                  {TIMER_PRESET_MINUTES.map((minutes) => {
                    const presetMs = minutes * MINUTE_MS
                    const active = Math.abs(durationMs - presetMs) < 1000
                    return (
                      <button
                        key={minutes}
                        type="button"
                        aria-pressed={active}
                        className={`nd-label rounded-full border px-3 py-1.5 transition-colors ${active
                          ? 'border-text-display text-text-display'
                          : 'border-border-visible text-text-secondary hover:bg-hover-bg hover:text-text-display'
                        }`}
                        onClick={() => applyDuration(presetMs)}
                      >
                        {t('timer.durationMinutes', { count: minutes })}
                      </button>
                    )
                  })}
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-border-visible bg-bg-secondary p-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Moon size={16} className="shrink-0 text-text-secondary" />
                    <div className="min-w-0">
                      <div className="nd-label text-text-primary">{t('zen.toggle')}</div>
                      <div className="nd-caption mt-1 leading-tight text-text-muted">{t('zen.toggleDescription')}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={zenEnabled}
                    aria-label={t('zen.toggle')}
                    className={`relative h-6 w-10 shrink-0 rounded-full border transition-colors ${zenEnabled
                      ? 'border-accent bg-accent'
                      : 'border-border-visible bg-bg-tertiary'
                    }`}
                    onClick={handleToggleZen}
                  >
                    <span
                      className={`absolute left-1 top-1 size-4 rounded-full transition-transform ${zenEnabled
                        ? 'translate-x-4 bg-text-inverse'
                        : 'translate-x-0 bg-text-muted'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <button type="button" className={primaryButtonClass} onClick={handleStart}>
                <Play size={17} fill="currentColor" />
                <span className="nd-label">{zenEnabled ? t('zen.start') : t('timer.start')}</span>
              </button>
            </>
          ) : null}

          {status === 'running' || status === 'paused' ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
              <button
                type="button"
                className={`${primaryButtonClass} px-3`}
                onClick={status === 'running' ? handlePause : handleStart}
              >
                {status === 'running' ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                <span className="nd-label truncate">
                  {status === 'running' ? t('timer.pause') : t('timer.resume')}
                </span>
              </button>
              <button type="button" className={`${secondaryButtonClass} px-3`} onClick={handleAddFive}>
                <span className="nd-label">{t('timer.addFive')}</span>
              </button>
              <button
                type="button"
                className={`${secondaryButtonClass} w-12 px-0`}
                aria-label={t('timer.stop')}
                title={t('timer.stop')}
                onClick={handleStop}
              >
                <Square size={15} />
              </button>
            </div>
          ) : null}

          {status === 'done' ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <button type="button" className={`${primaryButtonClass} px-3`} onClick={handleAddFive}>
                <Plus size={17} />
                <span className="nd-label">{t('timer.addFive')}</span>
              </button>
              <button type="button" className={`${secondaryButtonClass} px-3`} onClick={handleStop}>
                <Check size={16} />
                <span className="nd-label">{t('timer.done')}</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="hidden h-full min-h-0 items-center gap-2 [@container_(max-height:14rem)]:flex @md:gap-3">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dotClass}`} />
        <span className={`shrink-0 whitespace-nowrap font-display text-[clamp(1.75rem,9cqw,3rem)] font-black leading-none tabular-nums ${displayClass}`}>
          {formatTimerTime(remainingMs)}
        </span>
        <div className="h-1.5 min-w-6 flex-1 overflow-hidden rounded-full bg-bg-tertiary">
          <div
            className={`h-full rounded-full transition-[width] ${status === 'done' ? 'bg-accent' : 'bg-text-display'}`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-text-display text-text-inverse transition-opacity hover:opacity-90"
          aria-label={status === 'running'
            ? t('timer.pause')
            : status === 'paused'
              ? t('timer.resume')
              : t('timer.start')}
          onClick={status === 'running' ? handlePause : handleStart}
        >
          {status === 'running' ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
      </div>
    </div>
  )
}
