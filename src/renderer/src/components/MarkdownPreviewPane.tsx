import React, { useCallback, useEffect, useRef, useState } from 'react'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-markdown-preview/markdown.css'
import { useTranslation } from 'react-i18next'
import { resolveMarkdownAssetPath, resolveMarkdownNavigation } from '@/utils/markdownNavigation'
import { safeMarkdownPreviewOptions } from '@/utils/markdownPlugins'
import { safeMarkdownUrl } from '@/utils/markdownPreview'

interface MarkdownPreviewPaneProps {
  source: string
  colorMode: 'light' | 'dark'
  rootPath?: string
  filePath?: string
  onOpenFile?: (relativePath: string) => void | Promise<void>
  onOpenBrowser?: (url: string) => void
}

interface LocalMarkdownImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  rootPath: string
  filePath: string
  node?: unknown
}

function LocalMarkdownImage({ rootPath, filePath, src = '', alt = '', node: _node, ...props }: LocalMarkdownImageProps): React.ReactElement {
  const { t } = useTranslation()
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const relativePath = resolveMarkdownAssetPath(filePath, src)
    setDataUrl(null)
    setFailed(!relativePath)
    if (!relativePath) return () => { cancelled = true }

    void window.electron.files.readPreviewAsset(rootPath, relativePath)
      .then((result) => {
        if (cancelled) return
        if (result.status !== 'ready') {
          setFailed(true)
          return
        }
        setDataUrl(`data:${result.mimeType};base64,${result.dataBase64}`)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => { cancelled = true }
  }, [filePath, rootPath, src])

  if (failed) {
    return <span className="inline-flex rounded border border-border-visible px-2 py-1 text-xs text-text-secondary">{alt || t('files.imageUnavailable')}</span>
  }
  if (!dataUrl) {
    return <span className="inline-flex animate-pulse rounded bg-hover-bg px-3 py-2 text-xs text-text-disabled">{alt || t('common.loading')}</span>
  }
  return <img {...props} src={dataUrl} alt={alt} />
}

export function MarkdownPreviewPane({ source, colorMode, rootPath, filePath, onOpenFile, onOpenBrowser }: MarkdownPreviewPaneProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  const activateLink = useCallback((href: string) => {
    if (!filePath) return
    const target = resolveMarkdownNavigation(filePath, href)
    if (target.kind === 'top') {
      containerRef.current?.scrollTo({ top: 0 })
    } else if (target.kind === 'anchor') {
      const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(target.anchor) : target.anchor.replace(/[^a-zA-Z0-9_-]/g, '')
      containerRef.current?.querySelector<HTMLElement>(`#${escaped}`)?.scrollIntoView({ block: 'start' })
    } else if (target.kind === 'workspace-file') {
      void Promise.resolve(onOpenFile?.(target.relativePath)).catch(() => undefined)
    } else if (target.kind === 'browser') {
      onOpenBrowser?.(target.url)
    } else if (target.kind === 'external') {
      void window.electron.shell.openExternal(target.url)
    }
  }, [filePath, onOpenBrowser, onOpenFile])

  const components = filePath && rootPath
    ? {
        a: ({ href = '', children, node: _node, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => (
          <a
            {...props}
            href={safeMarkdownUrl(href)}
            onClick={(event) => {
              event.preventDefault()
              activateLink(href)
            }}
          >
            {children}
          </a>
        ),
        img: ({ src = '', alt = '', ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
          <LocalMarkdownImage {...props} rootPath={rootPath} filePath={filePath} src={src} alt={alt} />
        ),
      }
    : undefined

  return (
    <div ref={containerRef} className="h-full min-h-0 overflow-auto bg-bg-secondary">
      <MDEditor.Markdown
        {...safeMarkdownPreviewOptions}
        source={source}
        className="min-h-full bg-transparent p-6 text-text-primary"
        wrapperElement={{ 'data-color-mode': colorMode }}
        urlTransform={safeMarkdownUrl}
        components={components}
      />
    </div>
  )
}
