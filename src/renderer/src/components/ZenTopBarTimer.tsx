import React, { useEffect, useState } from 'react'
import { Moon, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getZenRemainingMs, useZenStore } from '@/store/zenStore'

interface ZenTopBarTimerProps {
  onOpenWorkspace?: (workspaceId: string) => void
}

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const secondsLabel = String(seconds).padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${secondsLabel}`
  }

  return `${String(minutes).padStart(2, '0')}:${secondsLabel}`
}

export function ZenTopBarTimer({ onOpenWorkspace }: ZenTopBarTimerProps): React.ReactElement | null {
  const { t } = useTranslation()
  const session = useZenStore((state) => state.session)
  const queuedAlerts = useZenStore((state) => state.queuedAlerts)
  const finish = useZenStore((state) => state.finish)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (session?.status !== 'running') return

    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(interval)
  }, [session?.status])

  if (!session) return null

  const remainingMs = getZenRemainingMs(session, now)
  const progress = session.durationMs > 0 ? Math.min(1, remainingMs / session.durationMs) : 0
  const paused = session.status === 'paused'

  return (
    <div className="flex h-7 shrink-0 items-center gap-2 rounded-md border border-border-visible bg-bg-secondary pl-2 pr-1">
      <Moon size={13} className="shrink-0 text-text-secondary" aria-hidden="true" />
      <button
        type="button"
        className={`font-display text-xs tabular-nums transition-colors hover:text-text-display ${
          paused ? 'text-text-secondary' : 'text-text-display'
        }`}
        onClick={() => onOpenWorkspace?.(session.workspaceId)}
        aria-label={t('zen.label')}
      >
        {formatRemaining(remainingMs)}
      </button>
      <div className="h-1 w-12 overflow-hidden rounded-full bg-bg-tertiary" aria-hidden="true">
        <div
          className="h-full rounded-full bg-text-display transition-[width]"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      {queuedAlerts.length > 0 && (
        <span className="font-mono text-[10px] text-warning">
          {t('zen.waiting', { count: queuedAlerts.length })}
        </span>
      )}
      <button
        type="button"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
        onClick={() => finish('stopped')}
        aria-label={t('zen.stop')}
        title={t('zen.stop')}
      >
        <Square size={10} fill="currentColor" aria-hidden="true" />
      </button>
    </div>
  )
}
