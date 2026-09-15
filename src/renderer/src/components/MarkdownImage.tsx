import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Components } from 'react-markdown'
import { MARKDOWN_NOTE_SOURCE_PATH, resolveMarkdownImageSource } from '@/utils/markdownImage'

export interface MarkdownImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  sourcePath: string
  rootPath?: string
  node?: unknown
}

export interface MarkdownImageComponentsOptions {
  sourcePath: string
  rootPath?: string
}

type MarkdownImageState = {
  key: string
  status: 'loading' | 'ready' | 'error'
  dataUrl?: string
}

type MarkdownImageElementProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  node?: unknown
}

function imageFallback(
  status: 'loading' | 'error',
  alt: string,
  t: (key: string) => string,
): React.ReactElement {
  const message = status === 'loading' ? t('common.loading') : alt || t('files.imageUnavailable')
  return (
    <span
      className="inline-flex rounded border border-border-visible px-2 py-1 text-xs text-text-secondary"
      role={status === 'loading' ? 'status' : 'img'}
      aria-label={message}
    >
      {message}
    </span>
  )
}

export function MarkdownImage({
  sourcePath,
  rootPath,
  src,
  alt = '',
  node: _node,
  onLoad,
  onError,
  ...props
}: MarkdownImageProps): React.ReactElement {
  const { t } = useTranslation()
  const rawSrc = typeof src === 'string' ? src : ''
  const source = useMemo(
    () => resolveMarkdownImageSource(sourcePath, rawSrc),
    [rawSrc, sourcePath],
  )
  const requestKey = `${sourcePath}\u0000${rootPath ?? ''}\u0000${rawSrc}`
  const requestIdRef = useRef(0)
  const [state, setState] = useState<MarkdownImageState>({ key: requestKey, status: 'loading' })
  const currentState: MarkdownImageState = state.key === requestKey
    ? state
    : { key: requestKey, status: source.kind === 'blocked' ? 'error' : 'loading' }

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (source.kind === 'blocked') {
      setState({ key: requestKey, status: 'error' })
      return () => {
        if (requestIdRef.current === requestId) requestIdRef.current += 1
      }
    }

    if (source.kind === 'remote') {
      setState({ key: requestKey, status: 'loading' })
      return () => {
        if (requestIdRef.current === requestId) requestIdRef.current += 1
      }
    }

    if (!rootPath) {
      setState({ key: requestKey, status: 'error' })
      return () => {
        if (requestIdRef.current === requestId) requestIdRef.current += 1
      }
    }

    setState({ key: requestKey, status: 'loading' })
    void window.electron.files.readPreviewAsset(rootPath, source.relativePath)
      .then((result) => {
        if (requestIdRef.current !== requestId) return
        if (result.status !== 'ready') {
          setState({ key: requestKey, status: 'error' })
          return
        }
        setState({
          key: requestKey,
          status: 'ready',
          dataUrl: `data:${result.mimeType};base64,${result.dataBase64}`,
        })
      })
      .catch(() => {
        if (requestIdRef.current === requestId) setState({ key: requestKey, status: 'error' })
      })

    return () => {
      if (requestIdRef.current === requestId) requestIdRef.current += 1
    }
  }, [requestKey, rootPath, source])

  const handleLoad: React.ReactEventHandler<HTMLImageElement> = (event) => {
    setState((current) => current.key === requestKey ? { ...current, status: 'ready' } : current)
    onLoad?.(event)
  }

  const handleError: React.ReactEventHandler<HTMLImageElement> = (event) => {
    setState((current) => current.key === requestKey ? { ...current, status: 'error' } : current)
    onError?.(event)
  }

  if (source.kind === 'remote') {
    if (currentState.status === 'error') return imageFallback('error', alt, t)
    return <img {...props} src={source.url} alt={alt} onLoad={handleLoad} onError={handleError} />
  }

  if (source.kind === 'blocked' || currentState.status !== 'ready' || !currentState.dataUrl) {
    return imageFallback(source.kind === 'blocked' || currentState.status === 'error' ? 'error' : 'loading', alt, t)
  }

  return <img {...props} src={currentState.dataUrl} alt={alt} onLoad={handleLoad} onError={handleError} />
}

export function createMarkdownComponents({
  sourcePath = MARKDOWN_NOTE_SOURCE_PATH,
  rootPath,
}: MarkdownImageComponentsOptions): Components {
  return {
    img: (props: MarkdownImageElementProps) => (
      <MarkdownImage {...props} sourcePath={sourcePath} rootPath={rootPath} />
    ),
  }
}
