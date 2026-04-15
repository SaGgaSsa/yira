import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CornerDownLeft, TerminalSquare, X } from 'lucide-react'
import type { TileState } from '@shared/types'

export interface TileEditorValue {
  label: string
  startupCommand: string
}

export interface TileEditorRequest {
  title: string
  confirmLabel?: string
  tileType: TileState['type']
  shellProfileId?: TileState['shellProfileId']
  value: TileEditorValue
}

interface TileEditorDialogProps {
  request: TileEditorRequest | null
  onCancel: () => void
  onConfirm: (value: TileEditorValue) => void
}

export function TileEditorDialog({ request, onCancel, onConfirm }: TileEditorDialogProps): React.ReactElement | null {
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState<TileEditorValue | null>(request?.value ?? null)

  useEffect(() => {
    setValue(request?.value ?? null)

    if (!request) return

    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    })
  }, [request])

  const showCommandField = request?.tileType === 'terminal'

  const handleBackdropClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) onCancel()
  }, [onCancel])

  useEffect(() => {
    if (!request || !value) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        const target = event.target as HTMLElement | null
        if (target?.tagName === 'TEXTAREA') return
        event.preventDefault()
        onConfirm({
          label: value.label.trim(),
          startupCommand: value.startupCommand.trim(),
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, onConfirm, request, value])

  if (!request || !value) return null

  return createPortal(
    <div className="fixed inset-0 z-[10035] flex items-center justify-center bg-black/80" onClick={handleBackdropClick}>
      <div className="w-[620px] max-h-[86vh] max-w-[calc(100vw-32px)] overflow-hidden rounded-[24px] border border-border-visible bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <div className="nd-label text-text-secondary">Tile Settings</div>
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

        <div className="max-h-[calc(86vh-88px)] space-y-6 overflow-y-auto px-6 py-6">
          <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
            <label className="block">
              <span className="nd-label mb-2 block text-text-secondary">Name</span>
              <div className="flex items-center gap-3 rounded-full border border-border-visible bg-bg-primary px-4 py-3">
                <CornerDownLeft size={14} className="shrink-0 text-text-secondary" />
                <input
                  ref={nameInputRef}
                  className="w-full bg-transparent font-mono text-sm text-text-display outline-none"
                  value={value.label}
                  onChange={(event) => setValue((current) => current ? { ...current, label: event.target.value } : current)}
                  placeholder="Untitled"
                  spellCheck={false}
                />
              </div>
            </label>
          </section>

          {showCommandField && (
            <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
              <div className="mb-4 flex items-center gap-2">
                <TerminalSquare size={14} className="text-text-secondary" />
                <span className="nd-label text-text-secondary">
                  Startup command{request.shellProfileId ? ` · ${request.shellProfileId}` : ''}
                </span>
              </div>
              <label className="block">
                <span className="nd-label mb-2 block text-text-secondary">Command</span>
                <input
                  className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
                  value={value.startupCommand}
                  onChange={(event) => setValue((current) => current ? { ...current, startupCommand: event.target.value } : current)}
                  placeholder="Optional startup command"
                  spellCheck={false}
                />
              </label>
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                Runs on the next real terminal start. In WSL groups, the group command runs first and this one runs after it.
              </p>
            </section>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-5">
          <button
            className="rounded-full border border-border-visible px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded-full border border-text-display px-4 py-2 text-sm text-text-display transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onConfirm({
              label: value.label.trim(),
              startupCommand: value.startupCommand.trim(),
            })}
          >
            {request.confirmLabel ?? 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
