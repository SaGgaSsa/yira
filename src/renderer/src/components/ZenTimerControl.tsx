import React, { useEffect, useRef, useState } from 'react'
import { Maximize, Minus, Moon, Pause, Play, Plus, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  formatZenTime,
  getZenRemainingMs,
  useZenStore,
  ZEN_MAX_DURATION_MS,
  ZEN_MIN_DURATION_MS,
} from '../store/zenStore'

interface ZenTimerControlProps {
  workspaceId: string | null
  onOpenWorkspace: (workspaceId: string) => void
}

const DURATION_PRESETS_MINUTES = [5, 15, 25, 45, 60]
const PROGRESS_DOT_COUNT = 24
const MINUTE_MS = 60_000

function formatEndsAt(endsAt: number): string {
  return new Date(endsAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function ZenTimerControl({
  workspaceId,
  onOpenWorkspace,
}: ZenTimerControlProps): React.ReactElement | null {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const durationMs = useZenStore((state) => state.durationMs)
  const menuOpen = useZenStore((state) => state.menuOpen)
  const session = useZenStore((state) => state.session)
  const fullScreen = useZenStore((state) => state.fullScreen)
  const queuedAlerts = useZenStore((state) => state.queuedAlerts)
  const [now, setNow] = useState(() => Date.now())
  const running = session?.status === 'running'

  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(interval)
  }, [running])

  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        useZenStore.getState().setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      useZenStore.getState().setMenuOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [menuOpen])

  if (!session && !menuOpen) return null

  const closeMenu = () => useZenStore.getState().setMenuOpen(false)
  const stopSession = () => {
    useZenStore.getState().finish('stopped')
    closeMenu()
  }

  const remainingMs = session ? getZenRemainingMs(session, now) : durationMs
  const progress = session && session.durationMs > 0
    ? Math.min(1, Math.max(0, 1 - remainingMs / session.durationMs))
    : 0
  const elapsedDots = Math.round(progress * PROGRESS_DOT_COUNT)

  return (
    <div ref={containerRef} className="relative inline-flex">
      {session && (
        <div className="inline-flex h-7 items-center rounded-md border border-border-visible bg-bg-secondary">
          <button
            type="button"
            className="inline-flex h-full items-center gap-1.5 rounded-l-md pl-2 pr-1.5 transition-colors hover:bg-hover-bg"
            title={t('zen.openTimer')}
            aria-label={t('zen.openTimer')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => useZenStore.getState().setMenuOpen(!menuOpen)}
          >
            <Moon size={13} className="shrink-0 text-text-secondary" aria-hidden="true" />
            <span
              className={`font-display text-xs tabular-nums ${
                session.status === 'running' ? 'text-text-display' : 'text-text-secondary'
              }`}
            >
              {formatZenTime(remainingMs)}
            </span>
            <span className="h-0.5 w-12 overflow-hidden rounded-full bg-bg-tertiary" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-text-display transition-[width] duration-500"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </span>
            {queuedAlerts.length > 0 && (
              <span className="font-mono text-[10px] text-warning">
                {t('zen.waiting', { count: queuedAlerts.length })}
              </span>
            )}
          </button>
          <button
            type="button"
            className="mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded bg-text-display text-text-inverse transition-opacity hover:opacity-90"
            aria-label={t('zen.stop')}
            title={t('zen.stop')}
            onClick={stopSession}
          >
            <Square size={12} fill="currentColor" aria-hidden="true" />
          </button>
        </div>
      )}

      {menuOpen && (
        <div className="window-titlebar-popup absolute right-0 top-full z-70 mt-1 w-72 rounded-lg border border-border-visible bg-bg-secondary p-4 shadow-2xl">
          {!session ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t('timer.subtractMinute')}
                  title={t('timer.subtractMinute')}
                  disabled={durationMs <= ZEN_MIN_DURATION_MS}
                  onClick={() => useZenStore.getState().setDuration(durationMs - MINUTE_MS)}
                >
                  <Minus size={14} aria-hidden="true" />
                </button>
                <div className="font-display text-5xl leading-none text-text-display">
                  {formatZenTime(durationMs)}
                </div>
                <button
                  type="button"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t('timer.addMinute')}
                  title={t('timer.addMinute')}
                  disabled={durationMs >= ZEN_MAX_DURATION_MS}
                  onClick={() => useZenStore.getState().setDuration(durationMs + MINUTE_MS)}
                >
                  <Plus size={14} aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-5 gap-1">
                {DURATION_PRESETS_MINUTES.map((minutes) => {
                  const presetDurationMs = minutes * MINUTE_MS
                  const active = durationMs === presetDurationMs
                  return (
                    <button
                      key={minutes}
                      type="button"
                      className={`inline-flex h-7 items-center justify-center rounded-full border font-mono text-[10px] transition-colors ${
                        active
                          ? 'border-text-display text-text-display'
                          : 'border-border-visible text-text-secondary hover:border-text-secondary hover:text-text-display'
                      }`}
                      aria-pressed={active}
                      onClick={() => useZenStore.getState().setDuration(presetDurationMs)}
                    >
                      {t('timer.durationMinutes', { count: minutes })}
                    </button>
                  )
                })}
              </div>

              <p className="nd-caption text-text-secondary">{t('zen.toggleDescription')}</p>

              <button
                type="button"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-text-display text-sm text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={workspaceId === null}
                onClick={() => {
                  if (workspaceId) useZenStore.getState().start(workspaceId)
                }}
              >
                <Play size={14} aria-hidden="true" />
                {t('zen.start')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="font-display text-5xl leading-none text-text-display">
                {formatZenTime(remainingMs)}
              </div>

              <div className="flex items-center gap-0.5" aria-hidden="true">
                {Array.from({ length: PROGRESS_DOT_COUNT }, (_, index) => (
                  <span
                    key={index}
                    className={`size-2 rounded-full ${index < elapsedDots ? 'bg-text-display' : 'bg-bg-tertiary'}`}
                  />
                ))}
              </div>

              <p className="nd-caption text-text-secondary">
                {session.status === 'running' && session.endsAt !== null
                  ? t('timer.endsAt', { time: formatEndsAt(session.endsAt) })
                  : t('timer.pausedRemaining', { count: Math.ceil(remainingMs / MINUTE_MS) })}
              </p>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-text-display px-2 text-xs text-text-inverse transition-opacity hover:opacity-90"
                  onClick={() => {
                    if (session.status === 'running') useZenStore.getState().pause()
                    else useZenStore.getState().resume()
                  }}
                >
                  {session.status === 'running'
                    ? <Pause size={13} aria-hidden="true" />
                    : <Play size={13} aria-hidden="true" />}
                  {t(session.status === 'running' ? 'timer.pause' : 'timer.resume')}
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-full border border-border-visible px-2 text-xs text-text-display transition-colors hover:bg-hover-bg"
                  onClick={() => useZenStore.getState().addExtraTime()}
                >
                  {t('timer.addFive')}
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border-visible px-2 text-xs text-text-display transition-colors hover:bg-hover-bg"
                  onClick={stopSession}
                >
                  <Square size={11} fill="currentColor" aria-hidden="true" />
                  {t('timer.stop')}
                </button>
              </div>

              {!fullScreen ? (
                <button
                  type="button"
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full border border-border-visible text-xs text-text-display transition-colors hover:bg-hover-bg"
                  onClick={() => useZenStore.getState().setFullScreen(true)}
                >
                  <Maximize size={13} aria-hidden="true" />
                  {t('zen.fullScreen')}
                </button>
              ) : (
                <p className="nd-caption text-text-secondary">{t('zen.fullScreenHint')}</p>
              )}

              {session.workspaceId !== workspaceId && (
                <button
                  type="button"
                  className="inline-flex h-9 w-full items-center justify-center rounded-full border border-border-visible text-xs text-text-display transition-colors hover:bg-hover-bg"
                  onClick={() => {
                    onOpenWorkspace(session.workspaceId)
                    closeMenu()
                  }}
                >
                  {t('zen.goToWorkspace')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
