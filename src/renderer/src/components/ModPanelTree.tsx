import React from 'react'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-markdown-preview/markdown.css'
import type { Components } from 'react-markdown'
import type { ModPanelColor, ModPanelNode } from '@shared/modPanels'
import { safeMarkdownPreviewOptions } from '@/utils/markdownPlugins'
import { safeMarkdownUrl } from '@/utils/markdownPreview'

interface ModPanelTreeProps {
  node: ModPanelNode
  onPress: (key: string) => void
}

const TEXT_COLOR_CLASSES: Record<ModPanelColor, string> = {
  default: 'text-text-primary',
  muted: 'text-text-secondary',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

function currentColorMode(): 'light' | 'dark' {
  return document.documentElement?.classList?.contains('light') ? 'light' : 'dark'
}

function isExternalHttpUrl(url: string): boolean {
  const protocol = url.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase()
  return protocol === 'http' || protocol === 'https'
}

function openExternalLink(href: string): void {
  const url = safeMarkdownUrl(href)
  if (!isExternalHttpUrl(url)) return
  void window.electron.shell.openExternal(url).catch(() => undefined)
}

const markdownComponents: Components = {
  a: ({ href = '', children, node: _node, ...props }) => (
    <a
      {...props}
      href={safeMarkdownUrl(href) || undefined}
      onClick={(event) => {
        event.preventDefault()
        openExternalLink(href)
      }}
    >
      {children}
    </a>
  ),
}

function spacing(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.round(Math.max(0, Math.min(8, value))) * 4
}

function reactKey(node: ModPanelNode, index: number): string {
  if (typeof node !== 'string' && node.type === 'Button' && node.props?.key) {
    return `button:${node.props.key}`
  }
  return `index:${index}`
}

function renderNode(node: ModPanelNode, onPress: (key: string) => void): React.ReactNode {
  if (typeof node === 'string') return node
  if (!node || typeof node !== 'object') return null

  switch (node.type) {
    case 'Box': {
      const props = node.props ?? {}
      const className = [
        'flex min-w-0',
        props.flexDirection === 'row' ? 'flex-row' : 'flex-col',
        props.wrap ? 'flex-wrap' : '',
        props.border ? 'rounded border border-border p-2' : '',
      ].filter(Boolean).join(' ')

      return (
        <div
          className={className}
          style={{ gap: spacing(props.gap), padding: spacing(props.padding) }}
        >
          {renderChildren(node.children, onPress)}
        </div>
      )
    }

    case 'Text': {
      const props = node.props ?? {}
      const className = [
        TEXT_COLOR_CLASSES[props.color ?? 'default'] ?? TEXT_COLOR_CLASSES.default,
        props.bold ? 'font-semibold' : '',
        props.italic ? 'italic' : '',
        props.dim ? 'opacity-60' : '',
        props.mono ? 'font-mono' : '',
      ].filter(Boolean).join(' ')

      return <span className={className}>{renderChildren(node.children, onPress)}</span>
    }

    case 'Button': {
      const props = node.props
      if (!props || typeof props.key !== 'string') return null

      const variantClassName = props.variant === 'primary'
        ? 'border-transparent bg-accent text-text-inverse hover:opacity-90'
        : 'border-border-visible text-text-display hover:border-text-secondary hover:bg-hover-bg'
      const hasChildren = Array.isArray(node.children) && node.children.length > 0

      return (
        <button
          type="button"
          key={props.key}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClassName}`}
          disabled={props.disabled === true}
          onClick={() => onPress(props.key)}
        >
          {hasChildren ? renderChildren(node.children, onPress) : props.label || props.key}
        </button>
      )
    }

    case 'Markdown':
      return (
        <MDEditor.Markdown
          {...safeMarkdownPreviewOptions}
          source={typeof node.props?.text === 'string' ? node.props.text : ''}
          urlTransform={safeMarkdownUrl}
          components={markdownComponents}
          className="bg-transparent! text-text-primary!"
          wrapperElement={{ 'data-color-mode': currentColorMode() }}
        />
      )

    case 'Code':
      return (
        <pre className="overflow-auto whitespace-pre rounded bg-bg-primary p-2 font-mono text-xs">
          {typeof node.props?.source === 'string' ? node.props.source : ''}
        </pre>
      )

    case 'Divider':
      return <hr className="border-border" />

    default:
      return null
  }
}

function renderChildren(children: ModPanelNode[] | undefined, onPress: (key: string) => void): React.ReactNode {
  if (!Array.isArray(children)) return null
  return children.map((child, index) => (
    <React.Fragment key={reactKey(child, index)}>
      {renderNode(child, onPress)}
    </React.Fragment>
  ))
}

/** Renders one mod panel tree. Unknown node types are ignored. */
export function ModPanelTree({ node, onPress }: ModPanelTreeProps): React.ReactElement {
  return <>{renderNode(node, onPress)}</>
}
