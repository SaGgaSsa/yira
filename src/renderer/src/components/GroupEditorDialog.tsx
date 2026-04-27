import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderOpen, Lock, TerminalSquare, X } from 'lucide-react'
import { GROUP_COLORS, GROUP_COLOR_ORDER, type GroupColorId } from '@shared/types'

export interface GroupEditorValue {
  name: string
  colorId: GroupColorId
  locked: boolean
  wslStartupCommand: string
  filesRootPath: string
}

export interface GroupEditorRequest {
  title: string
  confirmLabel?: string
  value: GroupEditorValue
}

interface GroupEditorDialogProps {
  request: GroupEditorRequest | null
  onCancel: () => void
  onConfirm: (value: GroupEditorValue) => void
}

export function GroupEditorDialog({ request, onCancel, onConfirm }: GroupEditorDialogProps): React.ReactElement | null {
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState<GroupEditorValue | null>(request?.value ?? null)

  useEffect(() => {
    setValue(request?.value ?? null)

    if (!request) return

    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    })
  }, [request])

  const canSubmit = Boolean(value?.name.trim())

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
        if (!value.name.trim()) return
        event.preventDefault()
        onConfirm({
          ...value,
          name: value.name.trim(),
          wslStartupCommand: value.wslStartupCommand.trim(),
          filesRootPath: value.filesRootPath.trim(),
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, onConfirm, request, value])

  if (!request || !value) return null

  return createPortal(
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/80">
      <div className="w-[620px] max-h-[86vh] max-w-[calc(100vw-32px)] overflow-hidden rounded-[24px] border border-border-visible bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <div className="nd-label text-text-secondary">Group Settings</div>
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
              <span className="nd-label mb-2 block text-text-secondary">Group name</span>
              <input
                ref={nameInputRef}
                className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
                value={value.name}
                onChange={(event) => setValue((current) => current ? { ...current, name: event.target.value } : current)}
                placeholder="Untitled Group"
                spellCheck={false}
              />
            </label>
          </section>

          <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="nd-label text-text-secondary">Color</span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {GROUP_COLOR_ORDER.map((colorId) => {
                const color = GROUP_COLORS[colorId]
                const isActive = value.colorId === colorId

                return (
                  <button
                    key={colorId}
                    className={`rounded-[18px] border px-3 py-4 text-left transition-colors ${
                      isActive ? 'border-text-display bg-bg-primary' : 'border-border-visible bg-bg-secondary'
                    }`}
                    onClick={() => setValue((current) => current ? { ...current, colorId } : current)}
                  >
                    <div
                      className="h-4 w-4 rounded-full border"
                      style={{
                        background: color.swatch,
                        borderColor: 'rgba(255,255,255,0.25)',
                      }}
                    />
                    <div className="nd-caption mt-4 text-text-secondary">{colorId.toUpperCase()}</div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
            <button
              className={`flex w-full items-center justify-between rounded-[18px] border px-4 py-4 text-left transition-colors ${
                value.locked ? 'border-text-display bg-bg-primary' : 'border-border-visible bg-bg-secondary'
              }`}
              onClick={() => setValue((current) => current ? { ...current, locked: !current.locked } : current)}
            >
              <div className="flex items-center gap-3">
                <Lock size={15} className={value.locked ? 'text-text-display' : 'text-text-secondary'} />
                <div>
                  <div className="nd-label text-text-display">Lock group</div>
                  <div className="mt-1 text-sm text-text-secondary">Prevent moving or resizing the group and its tiles.</div>
                </div>
              </div>
              <span className="nd-caption text-text-secondary">{value.locked ? '[ LOCKED ]' : '[ UNLOCKED ]'}</span>
            </button>
          </section>

          <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
            <div className="mb-4 flex items-center gap-2">
              <TerminalSquare size={14} className="text-text-secondary" />
              <span className="nd-label text-text-secondary">WSL terminal</span>
            </div>
            <label className="block">
              <span className="nd-label mb-2 block text-text-secondary">Startup command</span>
              <input
                className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
                value={value.wslStartupCommand}
                onChange={(event) => setValue((current) => current ? { ...current, wslStartupCommand: event.target.value } : current)}
                placeholder="Optional command for new WSL terminals"
                spellCheck={false}
              />
            </label>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              Runs once when a new WSL terminal is created inside this group. Leave it empty to do nothing.
            </p>
          </section>

          <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
            <div className="mb-4 flex items-center gap-2">
              <FolderOpen size={14} className="text-text-secondary" />
              <span className="nd-label text-text-secondary">Files folder</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="min-w-0 flex-1 truncate rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display"
                title={value.filesRootPath || 'No folder selected'}
              >
                {value.filesRootPath || 'No folder selected'}
              </div>
              <button
                className="shrink-0 rounded-full border border-border-visible px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                onClick={() => {
                  void window.electron.files.selectFolder(value.filesRootPath || undefined).then((folder) => {
                    if (!folder) return
                    setValue((current) => current ? { ...current, filesRootPath: folder.path } : current)
                  })
                }}
              >
                Select
              </button>
              <button
                className="shrink-0 rounded-full border border-border-visible px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setValue((current) => current ? { ...current, filesRootPath: '' } : current)}
                disabled={!value.filesRootPath}
              >
                Clear
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              Files tiles inside this group browse this folder. It can be outside the active workspace.
            </p>
          </section>
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
              ...value,
              name: value.name.trim(),
              wslStartupCommand: value.wslStartupCommand.trim(),
              filesRootPath: value.filesRootPath.trim(),
            })}
            disabled={!canSubmit}
          >
            {request.confirmLabel ?? 'Save Group'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
