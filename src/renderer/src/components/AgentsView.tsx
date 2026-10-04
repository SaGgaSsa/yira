import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Maximize2, Minimize2, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  AgentActiveSession,
  AgentProvider,
  FileTileOpenOptions,
  WorkspaceConfig,
} from '@shared/types'
import { computeAgentsViewGrid } from '@/utils/agentsViewLayout'
import { selectAgentsViewSessions } from '@/utils/agentsViewSessions'
import { useCanvasStore } from '@/store/canvasStore'
import { AgentSessionTerminal } from './AgentSessionTerminal'

export interface AgentsViewProps {
  workspaceId: string
  workspaceConfig: WorkspaceConfig
  provider: AgentProvider
  sessions: AgentActiveSession[]
  /** Synthetic tileId of the session whose terminal currently has focus. */
  focusedSessionId: string | null
  /** Receives the synthetic tileId used by the terminal runtime. */
  onFocusSession: (tileId: string) => void
  /** Synthetic tileId of the session that fills the view, if any. */
  maximizedSessionId: string | null
  onMaximizedSessionChange: (tileId: string | null) => void
  onCloseSession: (session: AgentActiveSession) => void
  onNewSession: () => void
  shortcutLabel?: string
  onOpenBrowserTile?: (url: string) => void
  onOpenFileTile?: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
}

interface SessionCardProps {
  session: AgentActiveSession
  workspaceId: string
  workspaceConfig: WorkspaceConfig
  isFocused: boolean
  isMaximized: boolean
  isVisible: boolean
  onFocus: () => void
  onClose: () => void
  onToggleMaximize: () => void
  onOpenBrowserTile?: (url: string) => void
  onOpenFileTile?: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
}

function getStatusLabel(status: AgentActiveSession['status'], translate: (key: string) => string): string {
  switch (status) {
    case 'needs-input': return translate('agentsView.statusNeedsInput')
    case 'done': return translate('agentsView.statusDone')
    case 'exited': return translate('agentsView.statusExited')
    default: return translate('agentsView.statusWorking')
  }
}

function getSessionFrameClass(status: AgentActiveSession['status'], isFocused: boolean): string {
  const focusClass = isFocused ? 'ring-2 ring-text-display' : ''
  switch (status) {
    case 'needs-input': return `border-warning ${focusClass}`
    case 'done': return `border-success ${focusClass}`
    case 'exited': return `border-border-visible opacity-70 ${focusClass}`
    default: return `border-border-visible ${focusClass}`
  }
}

function getStatusBadgeClass(status: AgentActiveSession['status']): string {
  switch (status) {
    case 'needs-input': return 'border-warning text-warning'
    case 'done': return 'border-success text-success'
    case 'exited': return 'border-border-visible bg-bg-primary text-text-disabled'
    default: return 'border-border-visible text-text-secondary'
  }
}

function AgentSessionCard({
  session,
  workspaceId,
  workspaceConfig,
  isFocused,
  isMaximized,
  isVisible,
  onFocus,
  onClose,
  onToggleMaximize,
  onOpenBrowserTile,
  onOpenFileTile,
}: SessionCardProps): React.ReactElement {
  const { t } = useTranslation()
  const liveTitle = useCanvasStore((state) => state.terminalTitles[session.tileId])?.trim() ?? ''
  // Sessions started without a prompt have no stored title; use the agent's
  // terminal title unless it is only a spinner frame.
  const title = session.title?.trim()
    || (/[\p{L}\p{N}]/u.test(liveTitle) ? liveTitle : '')
    || t('agentsView.unknownTitle')
  const providerLabel = session.provider === 'claude' ? 'Claude' : 'Codex'
  const providerColor = 'text-activity'
  const statusLabel = getStatusLabel(session.status, t)
  const maximizeLabel = isMaximized ? t('agentsView.restoreSession') : t('agentsView.maximizeSession')

  return (
    <article
      className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-bg-secondary transition-shadow ${getSessionFrameClass(session.status, isFocused)}`}
      data-agent-session={session.tileId}
      onClick={onFocus}
      onFocusCapture={onFocus}
      tabIndex={0}
    >
      <header className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-2.5">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-bg-primary ${providerColor}`} title={providerLabel}>
          <Bot size={14} aria-hidden="true" />
        </span>
        <span className="nd-caption shrink-0 text-text-disabled">{t('agentsView.agentSession')}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-text-display" title={title}>{title}</span>
        {session.worktreeBranch && (
          <span className="max-w-28 shrink-0 truncate rounded-full border border-border-visible px-2 py-0.5 font-mono text-[10px] text-text-secondary" title={`${session.worktreeBranch} · ${session.worktrees?.length ?? 0} repos`}>
            {session.worktreeBranch}
          </span>
        )}
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${getStatusBadgeClass(session.status)}`} data-agent-status={session.status}>
          {statusLabel}
        </span>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
          aria-label={maximizeLabel}
          title={maximizeLabel}
          onClick={(event) => {
            event.stopPropagation()
            onToggleMaximize()
          }}
        >
          {isMaximized ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
          aria-label={t('agentsView.closeSession')}
          title={t('agentsView.closeSession')}
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 min-w-0 flex-1">
        <AgentSessionTerminal
          session={session}
          workspaceId={workspaceId}
          workspaceConfig={workspaceConfig}
          isFocused={isFocused}
          isVisible={isVisible}
          onFocus={onFocus}
          onOpenBrowserTile={onOpenBrowserTile}
          onOpenFileTile={onOpenFileTile}
        />
      </div>
    </article>
  )
}

export function AgentsView({
  workspaceId,
  workspaceConfig,
  provider,
  sessions,
  focusedSessionId,
  onFocusSession,
  maximizedSessionId,
  onMaximizedSessionChange,
  onCloseSession,
  onNewSession,
  shortcutLabel = 'Ctrl+N',
  onOpenBrowserTile,
  onOpenFileTile,
}: AgentsViewProps): React.ReactElement {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const visibleSessions = useMemo(
    () => selectAgentsViewSessions({ sessions }, workspaceId),
    [sessions, workspaceId],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateSize = (): void => {
      const bounds = container.getBoundingClientRect()
      setSize({ width: bounds.width, height: bounds.height })
    }
    updateSize()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (maximizedSessionId && !visibleSessions.some((session) => session.tileId === maximizedSessionId)) {
      onMaximizedSessionChange(null)
    }
  }, [maximizedSessionId, onMaximizedSessionChange, visibleSessions])

  const grid = computeAgentsViewGrid(visibleSessions.length, size.width, size.height)
  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
  }
  const providerLabel = provider === 'claude' ? 'Claude' : 'Codex'

  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-bg-primary" aria-label={t('agentsView.title')}>
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Bot size={17} className="text-text-secondary" aria-hidden="true" />
        <h1 className="nd-label text-text-display">{t('agentsView.title')}</h1>
        <span className="rounded-full border border-border-visible px-2 py-0.5 text-xs text-text-secondary">
          {t('agentsView.sessionCount', { count: visibleSessions.length })}
        </span>
        <span className="ml-auto text-xs text-text-secondary">{providerLabel}</span>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-border-visible px-3 py-1.5 text-xs text-text-display transition-colors hover:bg-hover-bg"
          onClick={onNewSession}
        >
          <Plus size={13} aria-hidden="true" />
          {t('agentsView.newSession')}
        </button>
      </header>
      <div ref={containerRef} className="min-h-0 flex-1">
        {visibleSessions.length === 0 ? (
          <div className="flex h-full min-h-0 flex-col items-center justify-center px-6 text-center">
            <Bot size={28} className="text-text-disabled" aria-hidden="true" />
            <h2 className="mt-3 text-base text-text-display">{t('agentsView.emptyTitle')}</h2>
            <p className="mt-1 max-w-sm text-sm text-text-secondary">{t('agentsView.emptyDescription')}</p>
            <button
              type="button"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-text-display px-4 py-2 text-sm text-text-display transition-colors hover:bg-bg-secondary"
              onClick={onNewSession}
            >
              <Plus size={15} aria-hidden="true" />
              {t('agentsView.newAgentSession')}
              <kbd className="rounded border border-border-visible px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">{shortcutLabel}</kbd>
            </button>
          </div>
        ) : (
          <div
            className="grid h-full min-h-0 w-full gap-2.5 p-2.5"
            style={gridStyle}
            data-agent-session-grid="true"
          >
            {visibleSessions.map((session) => {
              const isMaximized = maximizedSessionId === session.tileId
              const isVisible = maximizedSessionId === null || isMaximized
              return (
                <div
                  key={session.tileId}
                  className={isVisible ? 'min-h-0 min-w-0' : 'hidden'}
                  style={isMaximized ? { gridColumn: '1 / -1', gridRow: '1 / -1' } : undefined}
                >
                  <AgentSessionCard
                    session={session}
                    workspaceId={workspaceId}
                    workspaceConfig={workspaceConfig}
                    isFocused={session.tileId === focusedSessionId}
                    isMaximized={isMaximized}
                    isVisible={isVisible}
                    onFocus={() => onFocusSession(session.tileId)}
                    onClose={() => onCloseSession(session)}
                    onToggleMaximize={() => onMaximizedSessionChange(isMaximized ? null : session.tileId)}
                    onOpenBrowserTile={onOpenBrowserTile}
                    onOpenFileTile={onOpenFileTile}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
