import React, { useEffect, useMemo } from 'react'
import { Bot, GripVertical, Maximize2, Pin, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  AgentActiveSession,
  FileTileOpenOptions,
  WorkspaceConfig,
} from '@shared/types'
import { selectAgentsViewSessions } from '@/utils/agentsViewSessions'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { getAgentSessionTitle } from '@/utils/terminalDisplayTitle'
import { getAgentNamedTitle } from '@shared/agentTerminalTitle'
import { useAgentsViewLayout } from '@/hooks/useAgentsViewLayout'
import { AgentSessionTerminal } from './AgentSessionTerminal'
import { GridLayoutSurface, type GridLayoutTileRenderState } from './GridLayoutSurface'

export interface AgentsViewProps {
  workspaceId: string
  workspaceConfig: WorkspaceConfig
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
  onPinSession?: (session: AgentActiveSession) => void
}

interface SessionCardProps {
  session: AgentActiveSession
  workspaceId: string
  workspaceConfig: WorkspaceConfig
  isFocused: boolean
  isMaximized: boolean
  isVisible: boolean
  isDragged: boolean
  onFocus: () => void
  onClose: () => void
  onToggleMaximize: () => void
  onStartMove?: (event: React.PointerEvent) => void
  onPin?: () => void
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
  isDragged,
  onFocus,
  onClose,
  onToggleMaximize,
  onStartMove,
  onPin,
  onOpenBrowserTile,
  onOpenFileTile,
}: SessionCardProps): React.ReactElement {
  const { t } = useTranslation()
  const liveTitle = useCanvasStore((state) => state.terminalTitles[session.tileId])
  const title = getAgentNamedTitle(liveTitle)
    || getAgentSessionTitle(session)
    || t('agentsView.unknownTitle')
  const providerLabel = session.provider === 'claude' ? 'Claude' : 'Codex'
  const providerColor = 'text-activity'
  const statusLabel = getStatusLabel(session.status, t)
  const readingMode = useSettingsStore((state) => state.terminal.readingMode)
  const pinDisabled = session.status === 'exited' || Boolean(session.worktreeRoot)
  const pinLabel = session.worktreeRoot
    ? t('agentsView.pinSessionWorktreeDisabled')
    : t('agentsView.pinSession')

  return (
    <article
      className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-bg-secondary transition-shadow ${getSessionFrameClass(session.status, isFocused)}`}
      data-agent-session={session.tileId}
      onClick={onFocus}
      onFocusCapture={onFocus}
      tabIndex={0}
    >
      <header className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-2.5">
        {onStartMove && (
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display active:cursor-grabbing"
            aria-label={t('ui.moveTile')}
            title={t('ui.moveTile')}
            onPointerDown={onStartMove}
            onClick={(event) => event.stopPropagation()}
          >
            <GripVertical size={13} aria-hidden="true" />
          </button>
        )}
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
        {onPin && (
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={pinLabel}
            title={pinLabel}
            disabled={pinDisabled}
            onClick={(event) => {
              event.stopPropagation()
              onPin()
            }}
          >
            <Pin size={13} aria-hidden="true" />
          </button>
        )}
        {!isMaximized && (
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
            aria-label={t('agentsView.maximizeSession')}
            title={t('agentsView.maximizeSession')}
            onClick={(event) => {
              event.stopPropagation()
              onToggleMaximize()
            }}
          >
            <Maximize2 size={13} aria-hidden="true" />
          </button>
        )}
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
      <div className={`min-h-0 min-w-0 flex-1 ${isDragged ? 'opacity-40' : ''}`}>
        <AgentSessionTerminal
          session={session}
          workspaceId={workspaceId}
          workspaceConfig={workspaceConfig}
          isFocused={isFocused}
          isVisible={isVisible}
          readingColumn={isMaximized && readingMode}
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
  onPinSession,
}: AgentsViewProps): React.ReactElement {
  const { t } = useTranslation()
  const visibleSessions = useMemo(
    () => selectAgentsViewSessions({ sessions }, workspaceId),
    [sessions, workspaceId],
  )

  useEffect(() => {
    if (maximizedSessionId && !visibleSessions.some((session) => session.tileId === maximizedSessionId)) {
      onMaximizedSessionChange(null)
    }
  }, [maximizedSessionId, onMaximizedSessionChange, visibleSessions])

  const tileIds = useMemo(
    () => visibleSessions.map((session) => session.tileId),
    [visibleSessions],
  )
  const [rootNode, setRootNode] = useAgentsViewLayout(workspaceId, tileIds)
  const sessionsByTileId = useMemo(
    () => new Map(visibleSessions.map((session) => [session.tileId, session])),
    [visibleSessions],
  )

  const renderTile = (tileId: string, state: GridLayoutTileRenderState): React.ReactNode | null => {
    const session = sessionsByTileId.get(tileId)
    if (!session) return null
    const isMaximized = maximizedSessionId === tileId
    const isVisible = maximizedSessionId === null || isMaximized

    return (
      <div
        className={`${isMaximized ? 'absolute inset-2.5 z-10' : 'h-full min-h-[180px] w-full min-w-[260px]'}${isVisible ? '' : ' invisible'}`}
      >
        <AgentSessionCard
          session={session}
          workspaceId={workspaceId}
          workspaceConfig={workspaceConfig}
          isFocused={session.tileId === focusedSessionId}
          isMaximized={isMaximized}
          isVisible={isVisible}
          isDragged={state.isDragged}
          onFocus={() => onFocusSession(session.tileId)}
          onClose={() => onCloseSession(session)}
          onToggleMaximize={() => onMaximizedSessionChange(isMaximized ? null : session.tileId)}
          onStartMove={maximizedSessionId === null ? state.startMove : undefined}
          onPin={onPinSession ? () => onPinSession(session) : undefined}
          onOpenBrowserTile={onOpenBrowserTile}
          onOpenFileTile={onOpenFileTile}
        />
      </div>
    )
  }

  const renderDragGhost = (tileId: string): React.ReactNode | null => {
    const session = sessionsByTileId.get(tileId)
    if (!session) return null
    const liveTitle = useCanvasStore.getState().terminalTitles[tileId]
    const title = getAgentNamedTitle(liveTitle)
      || getAgentSessionTitle(session)
      || t('agentsView.unknownTitle')
    const providerLabel = session.provider === 'claude' ? 'Claude' : 'Codex'

    return (
      <>
        <Bot size={16} className="shrink-0 text-cyan-300" />
        <div className="min-w-0">
          <div className="truncate text-sm text-text-display">{title}</div>
          <div className="mt-1 text-xs text-text-secondary">{providerLabel}</div>
        </div>
      </>
    )
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-bg-primary" aria-label={t('agentsView.title')}>
      <div className="min-h-0 flex-1">
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
              <kbd className="rounded-sm border border-border-visible px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">{shortcutLabel}</kbd>
            </button>
          </div>
        ) : (
          <GridLayoutSurface
            rootNode={rootNode}
            onSetRootNode={setRootNode}
            onFocusTile={onFocusSession}
            className="relative flex h-full w-full overflow-auto bg-bg-primary p-2.5"
            renderTile={renderTile}
            renderDragGhost={renderDragGhost}
          />
        )}
      </div>
    </section>
  )
}
