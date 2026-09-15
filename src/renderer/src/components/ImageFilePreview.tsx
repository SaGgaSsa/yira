import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ImageFilePreviewProps {
  rootPath: string
  relativePath: string
  filePreview?: boolean
  isVisible?: boolean
}

type ImagePreviewState =
  | { status: 'loading' }
  | { status: 'ready'; dataUrl: string; requestId: number }
  | { status: 'missing' }
  | { status: 'unsupported'; reason: string }
  | { status: 'error'; message: string }

const initialState: ImagePreviewState = { status: 'loading' }

export function ImageFilePreview({ rootPath, relativePath, filePreview = false, isVisible = true }: ImageFilePreviewProps): React.ReactElement {
  const { t } = useTranslation()
  const identity = `${rootPath}\u0000${relativePath}`
  const identityRef = useRef(identity)
  const requestIdRef = useRef(0)
  const stateRef = useRef<ImagePreviewState>(initialState)
  const previousVisibleRef = useRef(isVisible)
  const [state, setState] = useState<ImagePreviewState>(initialState)
  const [reloadKey, setReloadKey] = useState(0)

  identityRef.current = identity

  const updateState = useCallback((next: ImagePreviewState) => {
    stateRef.current = next
    setState(next)
  }, [])

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    let disposed = false
    const isCurrent = () => !disposed && requestIdRef.current === requestId && identityRef.current === identity

    updateState({ status: 'loading' })
    if (!rootPath || !relativePath) {
      updateState({ status: 'error', message: t('files.imageUnavailable') })
      return () => {
        disposed = true
        if (requestIdRef.current === requestId) requestIdRef.current += 1
      }
    }

    void window.electron.files.readPreviewAsset(rootPath, relativePath)
      .then((result) => {
        if (!isCurrent()) return
        if (result.status === 'missing') {
          updateState({ status: 'missing' })
        } else if (result.status === 'unsupported') {
          updateState({ status: 'unsupported', reason: result.reason })
        } else {
          updateState({
            status: 'ready',
            dataUrl: `data:${result.mimeType};base64,${result.dataBase64}`,
            requestId,
          })
        }
      })
      .catch(() => {
        if (isCurrent()) updateState({ status: 'error', message: t('files.imageUnavailable') })
      })

    return () => {
      disposed = true
      if (requestIdRef.current === requestId) requestIdRef.current += 1
    }
  }, [identity, relativePath, reloadKey, rootPath, t, updateState])

  useEffect(() => {
    const wasVisible = previousVisibleRef.current
    previousVisibleRef.current = isVisible
    if (isVisible && !wasVisible) setReloadKey((value) => value + 1)
  }, [isVisible])

  const reload = useCallback(() => {
    setReloadKey((value) => value + 1)
  }, [])

  const handleImageError = useCallback((requestId: number) => {
    const current = stateRef.current
    if (current.status !== 'ready' || current.requestId !== requestId) return
    updateState({ status: 'error', message: t('files.imageUnavailable') })
  }, [t, updateState])

  const message = state.status === 'loading'
    ? t('common.loading')
    : state.status === 'missing'
      ? t('files.missing')
      : state.status === 'unsupported'
        ? `${t('files.imageUnavailable')}${state.reason ? `: ${state.reason}` : ''}`
        : state.status === 'error'
          ? state.message
          : t('common.loading')

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-secondary">
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary" title={relativePath}>{relativePath}</span>
        {filePreview && (
          <span className="nd-caption rounded-full border border-border-visible px-2 py-1 text-text-secondary">{t('files.temporary')}</span>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-border-visible px-3 py-1.5 text-xs text-text-display hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-40"
          onClick={reload}
          disabled={state.status === 'loading'}
          title={state.status === 'ready' ? t('files.reload') : t('files.retry')}
          aria-label={state.status === 'ready' ? t('files.reload') : t('files.retry')}
        >
          <RefreshCw size={13} />
          {state.status === 'ready' ? t('files.reload') : t('files.retry')}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {state.status === 'ready' ? (
          <img
            className="max-h-full max-w-full object-contain"
            src={state.dataUrl}
            alt={relativePath}
            draggable={false}
            onError={() => handleImageError(state.requestId)}
          />
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-4 px-8 text-center text-sm text-text-secondary"
            role={state.status === 'loading' ? 'status' : 'alert'}
            aria-live="polite"
          >
            <span>{message}</span>
            {state.status !== 'loading' && (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-border-visible px-4 py-2 text-sm text-text-display hover:bg-hover-bg"
                onClick={reload}
              >
                <RefreshCw size={14} />
                {t('files.retry')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
