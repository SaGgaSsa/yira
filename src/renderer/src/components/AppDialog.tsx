import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CornerDownLeft, X } from 'lucide-react'

export interface PromptDialogOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  defaultValue?: string
  placeholder?: string
  danger?: boolean
}

export interface ConfirmDialogOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export type AppDialogRequest =
  | ({ mode: 'prompt' } & PromptDialogOptions)
  | ({ mode: 'confirm' } & ConfirmDialogOptions)

interface AppDialogProps {
  request: AppDialogRequest | null
  onCancel: () => void
  onConfirm: (value?: string) => void
}

export function AppDialog({ request, onCancel, onConfirm }: AppDialogProps): React.ReactElement | null {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!request) return
    if (request.mode === 'prompt') {
      setValue(request.defaultValue ?? '')
      window.requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
      return
    }

    setValue('')
    window.requestAnimationFrame(() => {
      confirmButtonRef.current?.focus()
    })
  }, [request])

  const canSubmitPrompt = useMemo(() => {
    if (request?.mode !== 'prompt') return true
    return value.trim().length > 0
  }, [request, value])

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target !== event.currentTarget) return
      if (request?.mode !== 'prompt') return
      onCancel()
    },
    [onCancel, request],
  )

  useEffect(() => {
    if (!request) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }

      if (event.key === 'Enter') {
        if (request.mode === 'prompt') {
          if (!canSubmitPrompt) return
          event.preventDefault()
          onConfirm(value)
          return
        }

        event.preventDefault()
        onConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canSubmitPrompt, onCancel, onConfirm, request, value])

  if (!request) return null

  return createPortal(
    <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/80" onClick={handleBackdropClick}>
      <div className="w-[480px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[24px] border border-border-visible bg-bg-secondary shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <div className="nd-label text-text-secondary">
              {request.mode === 'prompt' ? 'Input Required' : 'Confirmation Required'}
            </div>
            <h2 className="mt-2 text-xl text-text-display">{request.title}</h2>
          </div>
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display"
            onClick={onCancel}
            title="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          {request.mode === 'confirm' && request.danger && (
            <div className="flex items-center gap-3 rounded-[20px] border border-danger/40 bg-danger/10 px-4 py-3 text-danger">
              <AlertTriangle size={16} className="shrink-0" />
              <span className="text-sm">This action changes persisted workspace state.</span>
            </div>
          )}

          <p className="text-sm leading-6 text-text-secondary">{request.message}</p>

          {request.mode === 'prompt' && (
            <div className="space-y-2">
              <label className="nd-label block text-text-secondary">Value</label>
              <div className="flex items-center gap-3 rounded-full border border-border-visible bg-bg-primary px-4 py-3">
                <CornerDownLeft size={14} className="shrink-0 text-text-secondary" />
                <input
                  ref={inputRef}
                  className="w-full bg-transparent font-mono text-sm text-text-display outline-none"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={request.placeholder}
                  spellCheck={false}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-5">
          <button
            className="rounded-full border border-border-visible px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
            onClick={onCancel}
          >
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmButtonRef}
            className="rounded-full border px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              borderColor: request.danger ? 'var(--danger)' : 'var(--text-display)',
              color: request.danger ? 'var(--danger)' : 'var(--text-display)',
            }}
            onClick={() => onConfirm(request.mode === 'prompt' ? value : undefined)}
            disabled={request.mode === 'prompt' ? !canSubmitPrompt : false}
          >
            {request.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
