import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderOpen, TerminalSquare, X } from 'lucide-react'

export interface WorkspaceDialogValue {
  name: string
  rootFolderPath: string
  initialCommand: string
}

export interface WorkspaceDialogRequest {
  title: string
  eyebrow?: string
  confirmLabel?: string
  cancelLabel?: string
  canCancel?: boolean
  value: WorkspaceDialogValue
}

interface WorkspaceDialogProps {
  request: WorkspaceDialogRequest | null
  onCancel: () => void
  onConfirm: (value: WorkspaceDialogValue) => void
}

function normalizeValue(value: WorkspaceDialogValue): WorkspaceDialogValue {
  return {
    name: value.name.trim(),
    rootFolderPath: value.rootFolderPath.trim(),
    initialCommand: value.initialCommand.trim(),
  }
}

export function WorkspaceDialog({ request, onCancel, onConfirm }: WorkspaceDialogProps): React.ReactElement | null {
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState<WorkspaceDialogValue | null>(request?.value ?? null)

  useEffect(() => {
    setValue(request?.value ?? null)

    if (!request) return

    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    })
  }, [request])

  useEffect(() => {
    if (!request || !value) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && request.canCancel !== false) {
        event.preventDefault()
        onCancel()
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        const target = event.target as HTMLElement | null
        if (target?.tagName === 'TEXTAREA') return
        if (!value.name.trim()) return
        event.preventDefault()
        onConfirm(normalizeValue(value))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, onConfirm, request, value])

  if (!request || !value) return null

  const canCancel = request.canCancel !== false
  const canSubmit = Boolean(value.name.trim())

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/80">
      <div className="w-[640px] max-h-[86vh] max-w-[calc(100vw-32px)] overflow-hidden rounded-[24px] border border-border-visible bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <div className="nd-label text-text-secondary">{request.eyebrow ?? 'Workspace Settings'}</div>
            <h2 className="mt-2 text-xl text-text-display">{request.title}</h2>
          </div>
          {canCancel && (
            <button
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display"
              onClick={onCancel}
              title="Close dialog"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="max-h-[calc(86vh-88px)] space-y-6 overflow-y-auto px-6 py-6">
          <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
            <label className="block">
              <span className="nd-label mb-2 block text-text-secondary">Workspace name</span>
              <input
                ref={nameInputRef}
                className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
                value={value.name}
                onChange={(event) => setValue((current) => current ? { ...current, name: event.target.value } : current)}
                placeholder="Workspace name"
                spellCheck={false}
              />
            </label>
          </section>

          <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
            <div className="mb-4 flex items-center gap-2">
              <FolderOpen size={14} className="text-text-secondary" />
              <span className="nd-label text-text-secondary">Root folder</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="min-w-0 flex-1 truncate rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display"
                title={value.rootFolderPath || 'No folder selected'}
              >
                {value.rootFolderPath || 'No folder selected'}
              </div>
              <button
                className="shrink-0 rounded-full border border-border-visible px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                onClick={() => {
                  void window.electron.files.selectFolder(value.rootFolderPath || undefined).then((folder) => {
                    if (!folder) return
                    setValue((current) => current ? { ...current, rootFolderPath: folder.path } : current)
                  })
                }}
              >
                Select
              </button>
              <button
                className="shrink-0 rounded-full border border-border-visible px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setValue((current) => current ? { ...current, rootFolderPath: '' } : current)}
                disabled={!value.rootFolderPath}
              >
                Clear
              </button>
            </div>
          </section>

          <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
            <div className="mb-4 flex items-center gap-2">
              <TerminalSquare size={14} className="text-text-secondary" />
              <span className="nd-label text-text-secondary">Initial command</span>
            </div>
            <input
              className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
              value={value.initialCommand}
              onChange={(event) => setValue((current) => current ? { ...current, initialCommand: event.target.value } : current)}
              placeholder="Optional command for new terminals"
              spellCheck={false}
            />
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-5">
          {canCancel && (
            <button
              className="rounded-full border border-border-visible px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
              onClick={onCancel}
            >
              {request.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button
            className="rounded-full border border-text-display px-4 py-2 text-sm text-text-display transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onConfirm(normalizeValue(value))}
            disabled={!canSubmit}
          >
            {request.confirmLabel ?? 'Save Workspace'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
