import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderOpen, Grid3X3, History, LayoutGrid, TerminalSquare, X } from 'lucide-react'
import type { WorkspaceType } from '@shared/types'

export interface WorkspaceDialogValue {
  type: WorkspaceType
  name: string
  rootFolderPath: string
  initialCommand: string
  terminalHistoryEnabled: boolean
}

export interface WorkspaceDialogRequest {
  title: string
  eyebrow?: string
  confirmLabel?: string
  cancelLabel?: string
  canCancel?: boolean
  typeEditable?: boolean
  value: WorkspaceDialogValue
}

interface WorkspaceDialogProps {
  request: WorkspaceDialogRequest | null
  onCancel: () => void
  onConfirm: (value: WorkspaceDialogValue) => void
}

function normalizeValue(value: WorkspaceDialogValue): WorkspaceDialogValue {
  return {
    type: value.type === 'grid' ? 'grid' : 'canvas',
    name: value.name.trim(),
    rootFolderPath: value.rootFolderPath.trim(),
    initialCommand: value.initialCommand.trim(),
    terminalHistoryEnabled: value.terminalHistoryEnabled,
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
  const typeEditable = request.typeEditable === true

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
            <div className="mb-4 flex items-center gap-2">
              {value.type === 'grid' ? <Grid3X3 size={14} className="text-text-secondary" /> : <LayoutGrid size={14} className="text-text-secondary" />}
              <span className="nd-label text-text-secondary">Workspace type</span>
            </div>
            {typeEditable ? (
              <div className="grid grid-cols-2 gap-3">
                {([
                  { type: 'canvas' as const, label: 'Canvas', icon: LayoutGrid },
                  { type: 'grid' as const, label: 'Grid', icon: Grid3X3 },
                ]).map((option) => {
                  const Icon = option.icon
                  const active = value.type === option.type
                  return (
                    <button
                      key={option.type}
                      className={`flex items-center gap-3 rounded-[18px] border px-4 py-4 text-left transition-colors ${
                        active ? 'border-text-display bg-bg-primary text-text-display' : 'border-border-visible text-text-secondary hover:bg-hover-bg hover:text-text-display'
                      }`}
                      onClick={() => setValue((current) => current ? { ...current, type: option.type } : current)}
                    >
                      <Icon size={16} />
                      <span className="nd-label">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-full border border-border-visible bg-bg-primary px-4 py-3 text-sm text-text-display">
                {value.type === 'grid' ? 'Grid' : 'Canvas'}
              </div>
            )}
          </section>

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

          <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
            <label className="flex items-center justify-between gap-4">
              <span className="flex min-w-0 items-center gap-2">
                <History size={14} className="shrink-0 text-text-secondary" />
                <span className="nd-label truncate text-text-secondary">Workspace terminal history</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[var(--text-primary)]"
                checked={value.terminalHistoryEnabled}
                onChange={(event) => setValue((current) => current ? { ...current, terminalHistoryEnabled: event.target.checked } : current)}
              />
            </label>
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
