import React, { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { ZenQueuedAlert, ZenSummary } from '@/store/zenStore'

interface ZenSummaryDialogProps {
  summary: ZenSummary
  workspaceName: (workspaceId: string | null) => string | null
  onOpenAlert: (alert: ZenQueuedAlert) => void
  onClose: () => void
}

const EVENT_LABEL_KEYS = {
  completed: 'agentAlert.completed',
  input: 'agentAlert.input',
  permission: 'agentAlert.permission',
} as const

function isWaitingForResponse(event: ZenQueuedAlert['event']): boolean {
  return event === 'input' || event === 'permission'
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const secondsLabel = String(seconds).padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${secondsLabel}`
  }

  return `${String(minutes).padStart(2, '0')}:${secondsLabel}`
}

export function ZenSummaryDialog({
  summary,
  workspaceName,
  onOpenAlert,
  onClose,
}: ZenSummaryDialogProps): React.ReactElement {
  const { t } = useTranslation()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const alerts = useMemo(() => [...summary.alerts].sort((a, b) => {
    const aWaiting = isWaitingForResponse(a.event)
    const bWaiting = isWaitingForResponse(b.event)
    if (aWaiting !== bWaiting) return aWaiting ? -1 : 1
    return b.receivedAt - a.receivedAt
  }), [summary.alerts])

  return createPortal(
    <div
      className="fixed inset-0 z-10030 flex items-center justify-center bg-black/80 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="w-[460px] max-w-[calc(100vw-32px)] rounded-2xl border border-border-visible bg-bg-secondary p-7 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="nd-label text-text-secondary">
          {t(summary.reason === 'completed' ? 'zen.summaryCompleted' : 'zen.summaryStopped')}
        </div>
        <div className="mt-2 font-display text-5xl leading-none text-text-display">
          {formatDuration(summary.durationMs)}
        </div>

        <div className="mt-7">
          <div className="nd-label text-text-secondary">{t('zen.whileAway')}</div>
          {alerts.length === 0 ? (
            <p className="mt-3 rounded-xl border border-border px-4 py-6 text-center text-sm text-text-secondary">
              {t('zen.summaryEmpty')}
            </p>
          ) : (
            <div className="mt-3 max-h-[40vh] space-y-2 overflow-y-auto pr-1">
              {alerts.map((alert) => {
                const providerLabel = t(alert.provider === 'claude' ? 'agentsView.claude' : 'agentsView.codex')
                const eventLabel = t(EVENT_LABEL_KEYS[alert.event])
                const name = workspaceName(alert.workspaceId)
                const minutesAgo = Math.floor((Date.now() - alert.receivedAt) / 60000)
                const timeLabel = minutesAgo < 1 ? t('zen.justNow') : t('zen.ago', { count: minutesAgo })

                return (
                  <button
                    key={alert.tileId}
                    type="button"
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left transition-colors hover:bg-hover-bg"
                    onClick={() => onOpenAlert(alert)}
                  >
                    <span
                      className={`size-2.5 shrink-0 rounded-full ${
                        isWaitingForResponse(alert.event) ? 'bg-warning' : 'bg-success'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-display">
                        {`${providerLabel} · ${eventLabel}`}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-text-secondary">
                        {name ? `${name} · ${timeLabel}` : timeLabel}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-text-secondary">{`→ ${t('zen.goTo')}`}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-text-display text-sm text-text-inverse transition-opacity hover:opacity-90"
          onClick={onClose}
        >
          {t('zen.back')}
        </button>
      </div>
    </div>,
    document.body,
  )
}
