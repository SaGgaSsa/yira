import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import MDEditor from '@uiw/react-md-editor'
import '@uiw/react-markdown-preview/markdown.css'
import type { Components } from 'react-markdown'
import { useTranslation } from 'react-i18next'
import { ArrowUp, Play, X } from 'lucide-react'
import type { AgentSessionHistoryItem, AgentSessionTranscriptResult, AgentTranscriptEntry } from '@shared/types'
import { safeMarkdownPreviewOptions } from '../utils/markdownPlugins'
import { safeMarkdownUrl } from '../utils/markdownPreview'

export interface AgentTranscriptDialogProps {
  item: AgentSessionHistoryItem
  workspaceId: string
  onClose: () => void
  onResume?: (item: AgentSessionHistoryItem) => void
  /** Defaults to document.body. */
  portalTarget?: Element
}

type TranscriptState = {
  status: 'loading' | 'error' | 'not-found' | 'empty' | 'ready'
  entries: AgentTranscriptEntry[]
  start: number
  total: number
  earlierLoading: boolean
  earlierError: boolean
}

type PendingScroll =
  | { kind: 'bottom' }
  | { kind: 'prepend'; height: number; top: number }

const EMPTY_STATE: TranscriptState = {
  status: 'loading',
  entries: [],
  start: 0,
  total: 0,
  earlierLoading: false,
  earlierError: false,
}

type TranscriptLabels = {
  you: string
  agent: string
  claude: string
  codex: string
  truncatedEntry: string
}

type StatusLabels = {
  loading: string
  error: string
  notFound: string
  empty: string
}

const markdownComponents: Components = {
  a: ({ href = '', children, node: _node, ...props }) => {
    const safeHref = safeMarkdownUrl(href)
    if (!safeHref) return <span>{children}</span>

    return (
      <a {...props} href={safeHref} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  },
}

function providerLabel(provider: AgentSessionHistoryItem['provider'], labels: TranscriptLabels): string {
  return provider === 'claude' ? labels.claude : labels.codex
}

function formatTimestamp(timestamp: string | undefined): string | null {
  if (!timestamp) return null
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function transcriptStatusText(state: TranscriptState, labels: StatusLabels): string | null {
  if (state.status === 'loading') return labels.loading
  if (state.status === 'error' || state.earlierError) return labels.error
  if (state.status === 'not-found') return labels.notFound
  if (state.status === 'empty') return labels.empty
  return null
}

function currentColorMode(): 'light' | 'dark' {
  return document.documentElement?.classList?.contains('light') ? 'light' : 'dark'
}

function TranscriptEntryView({
  entry,
  provider,
  labels,
}: {
  entry: AgentTranscriptEntry
  provider: AgentSessionHistoryItem['provider']
  labels: TranscriptLabels
}): React.ReactElement {
  const timestamp = formatTimestamp(entry.timestamp)

  if (entry.kind === 'prompt') {
    return (
      <div className="flex justify-end">
        <article className="max-w-[88%] rounded-2xl border border-border-visible bg-hover-bg px-4 py-3">
          <div className="mb-1 flex items-center justify-between gap-4 text-[11px] text-text-secondary">
            <span>{labels.you}</span>
            {timestamp && <time dateTime={entry.timestamp}>{timestamp}</time>}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">{entry.text}</p>
          {entry.truncated && <p className="mt-2 text-[11px] text-text-disabled">{labels.truncatedEntry}</p>}
        </article>
      </div>
    )
  }

  if (entry.kind === 'command') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border-visible bg-bg-primary px-3 py-1.5 font-mono text-xs text-text-secondary">
          {entry.text}
        </span>
        {timestamp && <time className="text-[11px] text-text-disabled" dateTime={entry.timestamp}>{timestamp}</time>}
      </div>
    )
  }

  return (
    <article className="max-w-[94%] rounded-2xl border border-border-visible bg-bg-primary px-4 py-3">
      <div className="mb-1 flex items-center justify-between gap-4 text-[11px] text-text-secondary">
        <span>{labels.agent} · {providerLabel(provider, labels)}</span>
        {timestamp && <time dateTime={entry.timestamp}>{timestamp}</time>}
      </div>
      <MDEditor.Markdown
        {...safeMarkdownPreviewOptions}
        source={entry.text}
        urlTransform={safeMarkdownUrl}
        components={markdownComponents}
        className="!bg-transparent !text-text-primary"
        wrapperElement={{ 'data-color-mode': currentColorMode() }}
      />
      {entry.truncated && <p className="mt-2 text-[11px] text-text-disabled">{labels.truncatedEntry}</p>}
    </article>
  )
}

export function AgentTranscriptDialog({
  item,
  workspaceId,
  onClose,
  onResume,
  portalTarget,
}: AgentTranscriptDialogProps): React.ReactElement {
  const { t } = useTranslation()
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const requestIdRef = useRef(0)
  const pendingScrollRef = useRef<PendingScroll | null>(null)
  const earlierLoadingRef = useRef(false)
  const [state, setState] = useState<TranscriptState>(EMPTY_STATE)
  const title = item.title?.trim() || t('agents.unknownTitle')

  const closeDialog = useCallback(() => {
    requestIdRef.current += 1
    onClose()
  }, [onClose])

  useEffect(() => {
    const requestId = ++requestIdRef.current
    pendingScrollRef.current = { kind: 'bottom' }
    earlierLoadingRef.current = false
    setState(EMPTY_STATE)

    void window.electron.agents.historyTranscript({
      workspaceId,
      provider: item.provider,
      identifier: item.identifier,
    }).then((result: AgentSessionTranscriptResult) => {
      if (requestId !== requestIdRef.current) return
      pendingScrollRef.current = { kind: 'bottom' }
      setState({
        status: !result.found ? 'not-found' : result.entries.length === 0 ? 'empty' : 'ready',
        entries: result.entries,
        start: result.start,
        total: result.total,
        earlierLoading: false,
        earlierError: false,
      })
    }).catch(() => {
      if (requestId !== requestIdRef.current) return
      pendingScrollRef.current = null
      setState({ ...EMPTY_STATE, status: 'error' })
    })

    return () => {
      if (requestId === requestIdRef.current) requestIdRef.current += 1
    }
  }, [item.identifier, item.provider, workspaceId])

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeDialog()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeDialog])

  useLayoutEffect(() => {
    const container = listRef.current
    const pending = pendingScrollRef.current
    if (!container || !pending) return

    if (pending.kind === 'bottom') {
      container.scrollTop = container.scrollHeight
    } else {
      container.scrollTop = pending.top + container.scrollHeight - pending.height
    }
    pendingScrollRef.current = null
  }, [state.entries, state.start])

  const loadEarlier = useCallback(async () => {
    if (state.start <= 0 || earlierLoadingRef.current) return
    const requestId = requestIdRef.current
    const container = listRef.current
    earlierLoadingRef.current = true
    pendingScrollRef.current = {
      kind: 'prepend',
      height: container?.scrollHeight ?? 0,
      top: container?.scrollTop ?? 0,
    }
    setState((current) => ({ ...current, earlierLoading: true, earlierError: false }))

    try {
      const result = await window.electron.agents.historyTranscript({
        workspaceId,
        provider: item.provider,
        identifier: item.identifier,
        before: state.start,
      })
      if (requestId !== requestIdRef.current) return
      setState((current) => ({
        ...current,
        entries: [...result.entries, ...current.entries],
        start: result.start,
        total: result.total,
        status: current.status === 'empty' && result.entries.length > 0 ? 'ready' : current.status,
        earlierLoading: false,
        earlierError: false,
      }))
    } catch {
      if (requestId !== requestIdRef.current) return
      pendingScrollRef.current = null
      setState((current) => ({ ...current, earlierLoading: false, earlierError: true }))
    } finally {
      if (requestId === requestIdRef.current) earlierLoadingRef.current = false
    }
  }, [item.identifier, item.provider, state.start, workspaceId])

  const labels: TranscriptLabels = {
    you: t('agents.you'),
    agent: t('agents.agent'),
    claude: t('agents.claude'),
    codex: t('agents.codex'),
    truncatedEntry: t('agents.truncatedEntry'),
  }
  const statusText = transcriptStatusText(state, {
    loading: t('agents.loadingConversation'),
    error: t('agents.conversationError'),
    notFound: t('agents.conversationNotFound'),
    empty: t('agents.conversationEmpty'),
  })
  const visibleEntryCount = state.status === 'loading' ? item.messageCount : state.total

  // Render at the document root so the side panel's overflow and stacking cannot clip the modal.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-transcript-dialog-title"
        className="flex h-[85vh] max-h-[850px] w-full max-w-3xl flex-col overflow-hidden rounded-[20px] border border-border-visible bg-bg-secondary shadow-2xl"
      >
        <header className="flex items-start gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="nd-label text-text-secondary">
              {providerLabel(item.provider, labels)} · {t('agents.entries', { count: visibleEntryCount })}
            </div>
            <h2 id="agent-transcript-dialog-title" className="mt-1 truncate text-lg text-text-display" title={title}>
              {title}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
            aria-label={t('agents.closeConversation')}
            title={t('agents.closeConversation')}
            onClick={closeDialog}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </header>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {state.start > 0 && (
            <div className="mb-4 flex justify-center">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-border-visible px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void loadEarlier()}
                disabled={state.earlierLoading}
              >
                <ArrowUp size={13} aria-hidden="true" />
                {t('agents.loadEarlier')}
              </button>
            </div>
          )}

          {statusText && (
            <p aria-live="polite" aria-atomic="true" className="py-8 text-center text-sm text-text-secondary">
              {statusText}
            </p>
          )}

          {state.status === 'ready' && (
            <ol className="space-y-4" aria-label={t('agents.conversationTitle')}>
              {state.entries.map((entry, index) => (
                <li key={`${state.start + index}-${entry.kind}-${entry.timestamp ?? ''}`}>
                  <TranscriptEntryView entry={entry} provider={item.provider} labels={labels} />
                </li>
              ))}
            </ol>
          )}
        </div>

        {onResume && (
          <footer className="flex justify-end border-t border-border px-5 py-4 sm:px-6">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-border-visible px-4 py-2 text-sm text-text-display transition-colors hover:bg-hover-bg"
              onClick={() => {
                onResume(item)
                closeDialog()
              }}
            >
              <Play size={13} aria-hidden="true" />
              {t('agents.resume')}
            </button>
          </footer>
        )}
      </section>
    </div>,
    portalTarget ?? document.body,
  )
}
