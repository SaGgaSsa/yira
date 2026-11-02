import React, { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { BotCallConfirmRequest } from '@shared/bots'

interface BotCallConfirmDialogProps {
  request: BotCallConfirmRequest | null
  onRespond: (allowed: boolean) => void
}

const FOCUS_CLASS = 'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--interactive)'

/** Asks the user to approve a bot session that another bot wants to start. */
export function BotCallConfirmDialog({ request, onRespond }: BotCallConfirmDialogProps): React.ReactElement | null {
  const { t } = useTranslation()
  const titleId = useId()
  const allowRef = useRef<HTMLButtonElement | null>(null)
  const onRespondRef = useRef(onRespond)
  onRespondRef.current = onRespond
  const requestId = request?.requestId ?? null

  useEffect(() => {
    if (requestId === null) return
    allowRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      onRespondRef.current(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [requestId])

  if (!request) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100vh-2rem)] w-[min(520px,calc(100vw-2rem))] flex-col gap-4 overflow-hidden rounded-[20px] border border-border-visible bg-bg-secondary px-6 py-5 shadow-2xl"
      >
        <h2 id={titleId} className="text-lg text-text-display">
          {t('bots.callConfirmTitle', { caller: request.callerName, target: request.targetName })}
        </h2>
        <div className="min-h-0">
          <div className="nd-label text-text-secondary">{t('bots.callConfirmPrompt')}</div>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border-visible bg-bg-primary px-3 py-2 font-mono text-xs leading-6 text-text-primary">
            {request.prompt}
          </pre>
        </div>
        <p className="text-sm text-text-secondary">
          {t('bots.callConfirmNotice', { target: request.targetName })}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            className={`rounded-full border border-border-visible px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg ${FOCUS_CLASS}`}
            onClick={() => onRespond(false)}
          >
            {t('bots.callConfirmDecline')}
          </button>
          <button
            ref={allowRef}
            type="button"
            className={`rounded-full bg-accent px-4 py-2 text-sm text-(--accent-text) transition-colors hover:bg-(--accent-hover) ${FOCUS_CLASS}`}
            onClick={() => onRespond(true)}
          >
            {t('bots.callConfirmAllow')}
          </button>
        </div>
      </div>
    </div>
  )
}
