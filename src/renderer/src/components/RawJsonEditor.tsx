import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Save, X } from 'lucide-react'
import type { CanvasState } from '@shared/types'

interface RawJsonEditorProps {
  open: boolean
  workspaceId: string
  onClose: () => void
  onApply: (state: CanvasState) => void
}

function normalizeCanvasState(state: CanvasState): CanvasState {
  return {
    ...state,
    viewMode: state.viewMode ?? 'canvas',
    fullviewActiveTileId: state.fullviewActiveTileId ?? state.focusedTileId ?? state.tiles[0]?.id ?? null,
  }
}

export function RawJsonEditor({ open, workspaceId, onClose, onApply }: RawJsonEditorProps): React.ReactElement | null {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !workspaceId) return
    window.electron.canvas.load(workspaceId).then((state) => {
      const nextState = normalizeCanvasState(state ?? {
        tiles: [],
        viewport: { tx: 0, ty: 0, zoom: 1 },
        nextZIndex: 1,
        focusedTileId: null,
        viewMode: 'canvas',
        fullviewActiveTileId: null,
      })
      setValue(JSON.stringify(nextState, null, 2))
      setError(null)
    }).catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
    })
  }, [open, workspaceId])

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
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/60">
      <div
        className="flex h-[80vh] w-[760px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-border shadow-2xl"
        style={{ background: 'var(--bg-tertiary)' }}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Raw Canvas JSON</h2>
            <p className="text-xs text-text-muted">{workspaceId}</p>
          </div>
          <button
            className="rounded p-1 text-text-muted transition-colors hover:bg-hover-bg hover:text-text-primary"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 p-4">
          <textarea
            className="h-full w-full resize-none rounded-lg border border-border bg-bg-primary p-3 font-mono text-xs leading-5 text-text-primary outline-none"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-danger">
            {error && (
              <>
                <AlertCircle size={14} />
                <span>{error}</span>
              </>
            )}
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm text-white transition-colors hover:opacity-90"
            onClick={() => {
              try {
                const parsed = JSON.parse(value) as CanvasState
                const nextState = normalizeCanvasState(parsed)
                onApply(nextState)
                setError(null)
                onClose()
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
          >
            <Save size={14} />
            <span>Apply JSON</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
