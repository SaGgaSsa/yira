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
    viewMode: state.viewMode ?? 'fullview',
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
        viewMode: 'fullview',
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
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/80">
      <div className="flex h-[84vh] w-[860px] max-w-[94vw] flex-col overflow-hidden rounded-[24px] border border-border-visible bg-bg-secondary">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <div className="nd-label text-text-secondary">Raw State</div>
            <h2 className="mt-2 text-xl text-text-display">Canvas JSON</h2>
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
            <span className="nd-label">Apply JSON</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
