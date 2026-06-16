import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Save, X } from 'lucide-react'
import type { CanvasState, GridWorkspaceState, WorkspaceType } from '@shared/types'
import { createEmptyCanvasState, normalizeCanvasStateForJson } from '@/utils/canvasStateNormalization'
import { createEmptyGridWorkspaceState, normalizeGridWorkspaceState } from '@shared/gridWorkspaceState'

interface RawJsonEditorProps {
  open: boolean
  workspaceId: string
  workspaceType: WorkspaceType
  state: CanvasState | GridWorkspaceState | null
  onClose: () => void
  onApply: (state: CanvasState | GridWorkspaceState) => void
}

export function RawJsonEditor({ open, workspaceId, workspaceType, state, onClose, onApply }: RawJsonEditorProps): React.ReactElement | null {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !workspaceId) return
    const nextState = workspaceType === 'grid'
      ? normalizeGridWorkspaceState((state as GridWorkspaceState | null) ?? createEmptyGridWorkspaceState())
      : normalizeCanvasStateForJson((state as CanvasState | null) ?? createEmptyCanvasState())
    setValue(JSON.stringify(nextState, null, 2))
    setError(null)
  }, [open, state, workspaceId, workspaceType])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/80">
      <div className="flex h-[84vh] w-[860px] max-w-[94vw] flex-col overflow-hidden rounded-[24px] border border-border-visible bg-bg-secondary">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <div className="nd-label text-text-secondary">Raw State</div>
            <h2 className="mt-2 text-xl text-text-display">{workspaceType === 'grid' ? 'Grid JSON' : 'Canvas JSON'}</h2>
            <p className="nd-caption mt-2 text-text-secondary">{workspaceId}</p>
          </div>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 p-5">
          <textarea
            className="h-full w-full resize-none rounded-[20px] border border-border-visible bg-bg-primary p-4 font-mono text-xs leading-6 text-text-primary outline-none"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <div className="flex items-center gap-2 text-xs text-danger">
            {error && (
              <>
                <AlertCircle size={14} />
                <span className="nd-caption">[ ERROR ] {error}</span>
              </>
            )}
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-text-display bg-text-display px-5 py-3 text-sm text-bg-primary transition-colors hover:opacity-90"
            onClick={() => {
              try {
                const parsed = JSON.parse(value)
                const nextState = workspaceType === 'grid'
                  ? normalizeGridWorkspaceState(parsed as GridWorkspaceState)
                  : normalizeCanvasStateForJson(parsed as CanvasState)
                onApply(nextState)
                setError(null)
                onClose()
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
          >
            <Save size={14} />
            <span className="nd-label">Apply JSON</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
