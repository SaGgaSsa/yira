import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  AgentActiveSession,
  AgentProvider,
  AgentSessionCreateResult,
  UserSettings,
  WorkspaceMetadata,
} from '@shared/types'
import type { ActivityPaletteStep } from '@/hooks/useAgentsView'
import {
  ACTIVITY_PALETTE_GRID_TRACKS,
  buildActivityPaletteGroups,
  flattenActivityMessage,
  formatActivityElapsed,
  getActivityPaletteCardSpans,
  getAgentSessionSurface,
  moveActivityPaletteSelection,
  summarizeActivityPalette,
  type ActivityPaletteGroup,
  type ActivityPaletteNavigationKey,
} from '@/utils/activityPalette'
import { getAgentSessionTitle } from '@/utils/terminalDisplayTitle'
import { AgentSessionDialog } from './AgentSessionDialog'

const ELAPSED_REFRESH_MS = 30_000
const NAVIGATION_KEYS = new Set<string>(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
const WARNING_SOFT_BORDER = 'color-mix(in srgb, var(--warning) 45%, transparent)'

export interface ActivityPaletteProps {
  step: ActivityPaletteStep | null
  /** Whether the new-session step was reached from the Activity step. */
  fromActivity: boolean
  /** All workspaces, in sidebar order. */
  workspaces: WorkspaceMetadata[]
  /** Workspaces offered by the new-session step. */
  sessionWorkspaces: WorkspaceMetadata[]
  sessions: readonly AgentActiveSession[]
  agents: UserSettings['agents']
  initialWorkspaceId: string | null
  focusRequestId: number
  shortcutLabel: string
  onClose: () => void
  onNewSession: () => void
  onBack: () => void
  onCreated: (result: AgentSessionCreateResult) => void
  onOpenAgent: (workspace: WorkspaceMetadata, session: AgentActiveSession) => void
}

/** Latest agent message per `sessionId:lastActivityAt`; `null` means there is none to show. */
type MessageCache = Map<string, string | null>

/** Transcript of the conversation the agent is running now. */
function getConversationId(session: AgentActiveSession): string {
  return session.conversationId ?? session.sessionId
}

function getMessageKey(session: AgentActiveSession): string {
  return `${getConversationId(session)}:${session.lastActivityAt}`
}

function getProviderLabel(provider: AgentProvider, translate: (key: string) => string): string {
  return translate(provider === 'claude' ? 'agentsView.claude' : 'agentsView.codex')
}

function getProviderColor(provider: AgentProvider): string {
  return provider === 'claude' ? 'var(--agent-claude)' : 'var(--agent-codex)'
}

function isButtonTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const closest = (target as { closest?: unknown }).closest
  return typeof closest === 'function' && Boolean(closest.call(target, 'button'))
}

/** Loads the last transcript entry of each visible session, refreshing when its activity changes. */
function useLatestAgentMessages(
  sessions: readonly AgentActiveSession[],
  cache: MessageCache,
): Record<string, string | null> {
  const [messages, setMessages] = useState<Record<string, string | null>>(() => (
    Object.fromEntries(sessions.map((session) => [session.sessionId, cache.get(getMessageKey(session)) ?? null]))
  ))
  const latestKeysRef = useRef(new Map<string, string>())
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    for (const session of sessions) {
      const key = getMessageKey(session)
      if (latestKeysRef.current.get(session.sessionId) === key) continue
      latestKeysRef.current.set(session.sessionId, key)

      if (cache.has(key)) {
        const cached = cache.get(key) ?? null
        setMessages((current) => ({ ...current, [session.sessionId]: cached }))
        continue
      }

      void window.electron.agents.historyTranscript({
        workspaceId: session.workspaceId,
        provider: session.provider,
        identifier: getConversationId(session),
        limit: 1,
      })
        .then((result) => {
          const lastEntry = result.entries[result.entries.length - 1]
          return lastEntry ? flattenActivityMessage(lastEntry.text) || null : null
        })
        .catch(() => null)
        .then((text) => {
          // A newer activity timestamp has been requested since; drop this response.
          if (latestKeysRef.current.get(session.sessionId) !== key) return
          cache.set(key, text)
          if (mountedRef.current) setMessages((current) => ({ ...current, [session.sessionId]: text }))
        })
    }
  }, [cache, sessions])

  return messages
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), ELAPSED_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [])
  return now
}

function Keycap({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <kbd className="rounded border border-border-visible px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
      {children}
    </kbd>
  )
}

interface ActivityStepProps {
  groups: ActivityPaletteGroup[]
  messageCache: MessageCache
  shortcutLabel: string
  onClose: () => void
  onNewSession: () => void
  onOpenAgent: (workspace: WorkspaceMetadata, session: AgentActiveSession) => void
}

function ActivityStep({
  groups,
  messageCache,
  shortcutLabel,
  onClose,
  onNewSession,
  onOpenAgent,
}: ActivityStepProps): React.ReactElement {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const visibleSessions = useMemo(() => groups.flatMap((group) => group.sessions), [groups])
  const messages = useLatestAgentMessages(visibleSessions, messageCache)
  const now = useNow()
  const summary = summarizeActivityPalette(groups)
  const spans = getActivityPaletteCardSpans(groups.length)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedSessionId = visibleSessions.some((session) => session.sessionId === selectedId)
    ? selectedId
    : visibleSessions[0]?.sessionId ?? null

  const openAgent = useCallback((workspace: WorkspaceMetadata, session: AgentActiveSession) => {
    onClose()
    onOpenAgent(workspace, session)
  }, [onClose, onOpenAgent])

  useEffect(() => {
    // Take focus from the terminal underneath so arrow keys do not reach it.
    containerRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return

      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (NAVIGATION_KEYS.has(event.key)) {
        event.preventDefault()
        setSelectedId(moveActivityPaletteSelection(groups, selectedSessionId, event.key as ActivityPaletteNavigationKey))
        return
      }
      // Enter on a focused header button activates that button instead.
      if (event.key !== 'Enter' || isButtonTarget(event.target)) return

      event.preventDefault()
      const group = groups.find((entry) => entry.sessions.some((session) => session.sessionId === selectedSessionId))
      const session = group?.sessions.find((entry) => entry.sessionId === selectedSessionId)
      if (group && session) openAgent(group.workspace, session)
      else if (groups.length === 0) onNewSession()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [groups, onClose, onNewSession, openAgent, selectedSessionId])

  const subtitle = [
    t('activityPalette.agentCount', { count: summary.agentCount }),
    t('activityPalette.workspaceCount', { count: summary.workspaceCount }),
    ...(summary.needsInputCount > 0 ? [t('activityPalette.needsInputCount', { count: summary.needsInputCount })] : []),
  ].join(' · ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-palette-title"
        tabIndex={-1}
        data-activity-palette="activity"
        className="flex max-h-[calc(100vh-2rem)] w-[min(1240px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[20px] border border-border-visible bg-bg-secondary shadow-2xl outline-none"
      >
        <div className="flex shrink-0 items-center gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0 flex-1">
            <h2 id="activity-palette-title" className="text-xl text-text-display">
              {t('activityPalette.title')}
            </h2>
            {groups.length > 0 && (
              <p className="nd-label mt-1 text-text-muted" data-activity-palette-summary="true">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border-visible px-3 text-sm text-text-display transition-colors hover:bg-hover-bg"
            onClick={onNewSession}
          >
            <Plus size={14} aria-hidden="true" />
            {t('activityPalette.newSession')}
            <Keycap>{shortcutLabel}</Keycap>
          </button>
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display"
            aria-label={t('agentsView.closeDialog')}
            title={t('agentsView.closeDialog')}
            onClick={onClose}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-14 text-center" data-activity-palette-empty="true">
            <p className="text-sm text-text-secondary">{t('activityPalette.empty')}</p>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-text-display px-4 py-2 text-sm text-text-display transition-colors hover:bg-bg-primary"
              onClick={onNewSession}
            >
              <Plus size={15} aria-hidden="true" />
              {t('activityPalette.newSession')}
              <Keycap>{shortcutLabel}</Keycap>
            </button>
          </div>
        ) : (
          <div
            role="listbox"
            aria-label={t('activityPalette.agentList')}
            aria-activedescendant={selectedSessionId ? `activity-palette-agent-${selectedSessionId}` : undefined}
            className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-4"
            style={{ gridTemplateColumns: `repeat(${ACTIVITY_PALETTE_GRID_TRACKS}, minmax(0, 1fr))` }}
          >
            {groups.map((group, index) => (
              <WorkspaceCard
                key={group.workspace.id}
                group={group}
                span={spans[index] ?? ACTIVITY_PALETTE_GRID_TRACKS}
                selectedSessionId={selectedSessionId}
                messages={messages}
                now={now}
                shortcutLabel={shortcutLabel}
                onSelect={setSelectedId}
                onOpen={openAgent}
              />
            ))}
          </div>
        )}

        <div className="nd-label flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-6 py-3 text-text-muted">
          <span><Keycap>↑ ↓ ← →</Keycap> {t('activityPalette.footerMove')}</span>
          <span><Keycap>Enter</Keycap> {t('activityPalette.footerOpen')}</span>
          <span><Keycap>{shortcutLabel}</Keycap> {t('activityPalette.footerNewSession')}</span>
          <span><Keycap>Esc</Keycap> {t('activityPalette.footerClose')}</span>
        </div>
      </div>
    </div>
  )
}

interface WorkspaceCardProps {
  group: ActivityPaletteGroup
  span: number
  selectedSessionId: string | null
  messages: Record<string, string | null>
  now: number
  shortcutLabel: string
  onSelect: (sessionId: string) => void
  onOpen: (workspace: WorkspaceMetadata, session: AgentActiveSession) => void
}

function WorkspaceCard({
  group,
  span,
  selectedSessionId,
  messages,
  now,
  shortcutLabel,
  onSelect,
  onOpen,
}: WorkspaceCardProps): React.ReactElement {
  const { t } = useTranslation()
  const hasInput = group.needsInputCount > 0
  const workspaceName = group.workspace.name.trim() || t('agentsView.unnamedWorkspace')
  const cardSummary = [
    ...(group.needsInputCount > 0 ? [t('activityPalette.needsInputCount', { count: group.needsInputCount })] : []),
    ...(group.workingCount > 0 ? [t('activityPalette.workingCount', { count: group.workingCount })] : []),
  ].join(' · ')

  return (
    <section
      data-activity-palette-card={group.workspace.id}
      aria-label={workspaceName}
      className="flex min-w-0 flex-col rounded-2xl border border-border-visible bg-bg-primary"
      style={{
        gridColumn: `span ${span} / span ${span}`,
        ...(hasInput ? { borderColor: WARNING_SOFT_BORDER } : {}),
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${hasInput ? 'bg-warning' : 'bg-activity'}`}
          aria-hidden="true"
        />
        <h3 className="min-w-0 flex-1 truncate text-sm text-text-display">{workspaceName}</h3>
        <span className="nd-label shrink-0 text-text-muted">{cardSummary}</span>
      </div>
      <div className="flex flex-col gap-1 p-2">
        {group.sessions.map((session) => (
          <AgentRow
            key={session.sessionId}
            session={session}
            selected={session.sessionId === selectedSessionId}
            message={messages[session.sessionId] ?? null}
            now={now}
            shortcutLabel={shortcutLabel}
            onSelect={() => onSelect(session.sessionId)}
            onOpen={() => onOpen(group.workspace, session)}
          />
        ))}
      </div>
    </section>
  )
}

interface AgentRowProps {
  session: AgentActiveSession
  selected: boolean
  message: string | null
  now: number
  shortcutLabel: string
  onSelect: () => void
  onOpen: () => void
}

function AgentRow({
  session,
  selected,
  message,
  now,
  shortcutLabel,
  onSelect,
  onOpen,
}: AgentRowProps): React.ReactElement {
  const { t } = useTranslation()
  const rowRef = useRef<HTMLDivElement | null>(null)
  const needsInput = session.status === 'needs-input'
  const providerLabel = getProviderLabel(session.provider, t)
  const title = getAgentSessionTitle(session) || providerLabel
  const source = getAgentSessionSurface(session) === 'agents-view'
    ? t('activityPalette.sourceAgentsView', { shortcut: shortcutLabel })
    : t('activityPalette.sourceTile')

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selected])

  return (
    <div
      ref={rowRef}
      id={`activity-palette-agent-${session.sessionId}`}
      role="option"
      aria-selected={selected}
      data-activity-palette-agent={session.sessionId}
      className={`cursor-pointer rounded-xl border px-3 py-2 transition-colors ${
        selected ? 'border-border-visible bg-bg-secondary' : 'border-transparent hover:bg-hover-bg'
      }`}
      onMouseEnter={onSelect}
      onClick={onOpen}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
          style={{ backgroundColor: getProviderColor(session.provider) }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{title}</span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
            needsInput ? 'border-warning text-warning' : 'border-activity text-activity'
          }`}
        >
          {needsInput ? t('activityPalette.statusNeedsInput') : t('activityPalette.statusWorking')}
        </span>
      </div>
      {message && (
        <p
          className={`mt-1 truncate text-xs ${needsInput ? 'text-warning' : 'text-text-secondary'}`}
          data-activity-palette-message="true"
        >
          {message}
        </p>
      )}
      <div className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-text-muted">
        <span className="min-w-0 flex-1 truncate">
          {[providerLabel, source, ...(session.worktreeBranch ? [`⎇ ${session.worktreeBranch}`] : [])].join(' · ')}
        </span>
        <span className="shrink-0">{formatActivityElapsed(session.startedAt, now)}</span>
      </div>
    </div>
  )
}

export function ActivityPalette({
  step,
  fromActivity,
  workspaces,
  sessionWorkspaces,
  sessions,
  agents,
  initialWorkspaceId,
  focusRequestId,
  shortcutLabel,
  onClose,
  onNewSession,
  onBack,
  onCreated,
  onOpenAgent,
}: ActivityPaletteProps): React.ReactElement {
  // Kept for the palette's lifetime so reopening shows messages without waiting.
  const messageCacheRef = useRef<MessageCache>(new Map())
  const groups = useMemo(
    () => buildActivityPaletteGroups(workspaces, sessions),
    [sessions, workspaces],
  )

  return (
    <>
      {step === 'activity' && (
        <ActivityStep
          groups={groups}
          messageCache={messageCacheRef.current}
          shortcutLabel={shortcutLabel}
          onClose={onClose}
          onNewSession={onNewSession}
          onOpenAgent={onOpenAgent}
        />
      )}
      <AgentSessionDialog
        open={step === 'new-session'}
        workspaces={sessionWorkspaces}
        initialWorkspaceId={initialWorkspaceId}
        agents={agents}
        focusRequestId={focusRequestId}
        onClose={onClose}
        onCreated={onCreated}
        onBack={fromActivity ? onBack : undefined}
      />
    </>
  )
}
