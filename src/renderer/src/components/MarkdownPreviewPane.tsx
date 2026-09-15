import React, { useCallback, useMemo, useRef } from 'react'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-markdown-preview/markdown.css'
import type { Components } from 'react-markdown'
import { MARKDOWN_NOTE_SOURCE_PATH } from '@/utils/markdownImage'
import { createMarkdownComponents } from './MarkdownImage'
import { resolveMarkdownNavigation } from '@/utils/markdownNavigation'
import { safeMarkdownPreviewOptions } from '@/utils/markdownPlugins'
import { safeMarkdownUrl } from '@/utils/markdownPreview'

interface MarkdownPreviewPaneProps {
  source: string
  colorMode: 'light' | 'dark'
  rootPath?: string
  filePath?: string
  imageSourcePath?: string
  onOpenFile?: (relativePath: string) => void | Promise<void>
  onOpenBrowser?: (url: string) => void
}

export function MarkdownPreviewPane({ source, colorMode, rootPath, filePath, imageSourcePath, onOpenFile, onOpenBrowser }: MarkdownPreviewPaneProps): React.ReactElement {
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

  const components = useMemo<Components>(() => {
    const markdownComponents = createMarkdownComponents({
      rootPath,
      sourcePath: imageSourcePath ?? filePath ?? MARKDOWN_NOTE_SOURCE_PATH,
    })
    if (!filePath) return markdownComponents

    return {
      ...markdownComponents,
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
    }
  }, [activateLink, filePath, imageSourcePath, rootPath])

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
