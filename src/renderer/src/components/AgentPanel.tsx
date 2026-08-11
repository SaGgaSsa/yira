import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Clock3, History, Play, RefreshCw, Search, Settings } from 'lucide-react'
import type {
  AgentActiveSession,
  AgentProvider,
  AgentProviderAvailabilitySnapshot,
  AgentProvidersConfig,
  AgentSessionHistoryItem,
  AgentSessionStatus,
  ShellProfileId,
  TerminalAgentMetadata,
  TileState,
} from '@shared/types'
import {
  buildAgentHistoryQuery,
  canResumeAgent,
  createAgentHistoryRefreshScheduler,
  filterAgentSessions,
  formatAgentAge,
  getAgentHistoryRefreshDelay,
  sanitizeAgentCwd,
  shouldShowAgentHistoryMore,
  shouldRequestAgentData,
} from '@/utils/agentPanel'

interface AgentPanelProfile {
  id: ShellProfileId
  label: string
  available: boolean
}

export interface AgentPanelProps {
  workspaceId: string
  selectedProvider?: AgentProvider
  agentProviders: AgentProvidersConfig
  availableProfiles: AgentPanelProfile[]
  tiles: TileState[]
  terminalTitles: Record<string, string>
  addTerminal: (profileId: ShellProfileId, agent?: TerminalAgentMetadata) => string | null
  onFocusTile: (tileId: string) => void
  onOpenWorkspaceSettings: () => void
}

type HistoryState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: AgentSessionHistoryItem[]
  hasMore: boolean
}

type SessionSubscription = {
  generation: number
  disposed: boolean
  token: string | null
}

function providerLabel(provider: AgentProvider): string {
  return provider === 'claude' ? 'Claude' : 'Codex'
}

function statusLabel(status: AgentSessionStatus): string {
  switch (status) {
    case 'needs-input': return 'Needs input'
    case 'done': return 'Done'
    case 'exited': return 'Exited'
    default: return 'Working'
  }
}

function statusClassName(status: AgentSessionStatus): string {
  switch (status) {
    case 'needs-input': return 'text-amber-300'
    case 'done': return 'text-emerald-300'
    case 'exited': return 'text-text-disabled'
    default: return 'text-text-display'
  }
}

function displayDate(value: string | undefined, unknownLabel: string): string {
  if (!value) return unknownLabel
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return unknownLabel
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}

function getHistoryTitle(item: AgentSessionHistoryItem, fallback: string): string {
  const title = item.title?.trim()
  return title || fallback
}

function getTerminalTitle(session: AgentActiveSession, tile: TileState | undefined, terminalTitles: Record<string, string>, fallback: string): string {
  const liveTitle = terminalTitles[session.tileId]?.trim()
  if (liveTitle) return liveTitle
  const tileLabel = tile?.label?.trim()
  return tileLabel || fallback
}

function RunningSessionCard({
  session,
  tile,
  terminalTitles,
  onFocusTile,
  fallbackTitle,
}: {
  session: AgentActiveSession
  tile: TileState | undefined
  terminalTitles: Record<string, string>
  onFocusTile: (tileId: string) => void
  fallbackTitle: string
}): React.ReactElement {
  const title = getTerminalTitle(session, tile, terminalTitles, fallbackTitle)
  return (
    <button
      type="button"
      className="w-full rounded-[18px] border border-border-visible bg-bg-primary px-3 py-3 text-left transition-colors hover:border-text-secondary hover:bg-hover-bg"
      onClick={() => onFocusTile(session.tileId)}
      title={`Focus ${title}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Bot size={15} className="shrink-0 text-text-secondary" />
        <span className="min-w-0 flex-1 truncate text-sm text-text-display">{title}</span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-text-disabled">{providerLabel(session.provider)}</span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
        <span className={statusClassName(session.status)}>{statusLabel(session.status)}</span>
        <span className="text-text-disabled">·</span>
        <time dateTime={session.startedAt} title={`Started ${session.startedAt}`}>
          {formatAgentAge(session.startedAt)}
        </time>
      </div>
    </button>
  )
}

function HistoryCard({
  item,
  onResume,
  resumeDisabled,
  unknownTitle,
  unknownDate,
  cwdUnavailableLabel,
  resumeLabel,
  modelLabel,
  messagesLabel,
  startedLabel,
  activeLabel,
}: {
  item: AgentSessionHistoryItem
  onResume: (item: AgentSessionHistoryItem) => void
  resumeDisabled: boolean
  unknownTitle: string
  unknownDate: string
  cwdUnavailableLabel: string
  resumeLabel: string
  modelLabel: string
  messagesLabel: string
  startedLabel: string
  activeLabel: string
}): React.ReactElement {
  const cwd = sanitizeAgentCwd(item.cwd)
  return (
    <article className="rounded-[18px] border border-border-visible bg-bg-primary px-3 py-3">
      <div className="flex min-w-0 items-start gap-2">
        <History size={15} className="mt-0.5 shrink-0 text-text-secondary" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <h4 className="min-w-0 truncate text-sm text-text-display" title={getHistoryTitle(item, unknownTitle)}>
              {getHistoryTitle(item, unknownTitle)}
            </h4>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-text-disabled">{providerLabel(item.provider)}</span>
          </div>
          {item.preview?.trim() && <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">{item.preview.trim()}</p>}
          <div className="mt-2 grid gap-1 text-[11px] text-text-disabled">
            <span>{cwd ? `cwd: ${cwd}` : cwdUnavailableLabel}</span>
            {item.model?.trim() && <span>{modelLabel}: {item.model.trim()}</span>}
            <span>{messagesLabel}: {item.messageCount}</span>
            <span>{startedLabel}: {displayDate(item.startedAt, unknownDate)}</span>
            <span>{activeLabel}: {displayDate(item.lastActivityAt, unknownDate)}</span>
          </div>
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border-visible px-3 py-1.5 text-xs text-text-display transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onResume(item)}
            disabled={resumeDisabled}
          >
            <Play size={12} />
            {resumeLabel}
          </button>
        </div>
      </div>
    </article>
  )
}

export function AgentPanel({
  workspaceId,
  selectedProvider,
  agentProviders,
  availableProfiles,
  tiles,
  terminalTitles,
  addTerminal,
  onFocusTile,
  onOpenWorkspaceSettings,
}: AgentPanelProps): React.ReactElement {
  const { t } = useTranslation()
  const [availability, setAvailability] = useState<AgentProviderAvailabilitySnapshot | null>(null)
  const [sessions, setSessions] = useState<AgentActiveSession[]>([])
  const [historySearch, setHistorySearch] = useState('')
  const [historyState, setHistoryState] = useState<HistoryState>({ status: 'idle', items: [], hasMore: false })
  const historyRequestRef = useRef(0)
  const historyRefreshSchedulerRef = useRef(createAgentHistoryRefreshScheduler())
  const availabilityRequestRef = useRef(0)
  const sessionSubscriptionRef = useRef<SessionSubscription | null>(null)

  const availableProfile = useMemo(
    () => availableProfiles.find((profile) => profile.available),
    [availableProfiles],
  )

  useEffect(() => {
    const requestId = ++availabilityRequestRef.current
    setAvailability(null)
    if (!shouldRequestAgentData(selectedProvider)) return

    void window.electron.agents.availability()
      .then((result) => {
        if (requestId === availabilityRequestRef.current) setAvailability(result)
      })
      .catch(() => undefined)

    return () => {
      availabilityRequestRef.current += 1
    }
  }, [selectedProvider])

  useEffect(() => {
    let cancelled = false
    setSessions([])
    if (!shouldRequestAgentData(selectedProvider)) return

    const subscription: SessionSubscription = {
      generation: (sessionSubscriptionRef.current?.generation ?? 0) + 1,
      disposed: false,
      token: null,
    }
    sessionSubscriptionRef.current = subscription

    const removeListener = window.electron.agents.onSessionsChanged((snapshot) => {
      if (!cancelled) setSessions(filterAgentSessions(snapshot, workspaceId, selectedProvider))
    })

    void window.electron.agents.sessionsSnapshot(workspaceId)
      .then((snapshot) => {
        if (!cancelled) setSessions(filterAgentSessions(snapshot, workspaceId, selectedProvider))
      })
      .catch(() => {
        if (!cancelled) setSessions([])
      })

    void window.electron.agents.subscribeSessions(workspaceId)
      .then((result) => {
        const token = typeof result === 'string' ? result : null
        if (!token) return
        if (subscription.disposed || sessionSubscriptionRef.current !== subscription || sessionSubscriptionRef.current.generation !== subscription.generation) {
          void window.electron.agents.unsubscribeSessions(token)
          return
        }
        subscription.token = token
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      subscription.disposed = true
      removeListener()
      if (sessionSubscriptionRef.current !== subscription || sessionSubscriptionRef.current.generation !== subscription.generation) return
      sessionSubscriptionRef.current = null
      const token = subscription.token
      subscription.token = null
      if (token) void window.electron.agents.unsubscribeSessions(token)
    }
  }, [selectedProvider, workspaceId])

  const canResume = useCallback((provider: AgentProvider): boolean => {
    return canResumeAgent(provider, selectedProvider, agentProviders, availability, Boolean(availableProfile))
  }, [agentProviders, availability, availableProfile, selectedProvider])

  const loadHistory = useCallback(async () => {
    if (!shouldRequestAgentData(selectedProvider)) return
    const requestId = ++historyRequestRef.current
    const query = {
      ...buildAgentHistoryQuery(workspaceId, selectedProvider, historySearch),
      provider: selectedProvider,
    }
    setHistoryState((current) => ({ ...current, status: 'loading' }))

    try {
      const result = await window.electron.agents.history(query)
      if (requestId !== historyRequestRef.current) return
      setHistoryState({ status: 'ready', items: result.items, hasMore: result.hasMore })
    } catch {
      if (requestId !== historyRequestRef.current) return
      setHistoryState({ status: 'error', items: [], hasMore: false })
    }
  }, [historySearch, workspaceId, selectedProvider])

  useEffect(() => {
    if (!shouldRequestAgentData(selectedProvider)) return
    const delay = getAgentHistoryRefreshDelay(historySearch)
    const scheduler = historyRefreshSchedulerRef.current
    scheduler.schedule(delay, () => {
      void loadHistory()
    })
    return () => {
      scheduler.cancel()
      historyRequestRef.current += 1
    }
  }, [historySearch, loadHistory, selectedProvider, workspaceId])

  const resumeAgent = useCallback((item: AgentSessionHistoryItem) => {
    if (!canResume(item.provider) || !availableProfile) return
    const cwd = sanitizeAgentCwd(item.cwd)
    const metadata: TerminalAgentMetadata = {
      provider: item.provider,
      sessionId: item.identifier,
      ...(cwd ? { cwd } : {}),
    }
    const tileId = addTerminal(availableProfile.id, metadata)
    if (tileId) onFocusTile(tileId)
  }, [addTerminal, availableProfile, canResume, onFocusTile])

  const tileById = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles])

  const copy = {
    unconfigured: t('agents.unconfigured', 'Choose an agent provider in this workspace to view its sessions and history.'),
    configureWorkspace: t('agents.configureWorkspace', 'Configure workspace'),
    running: t('agents.running', 'Running sessions'),
    noRunning: t('agents.noRunning', 'No running agent sessions'),
    history: t('agents.history', 'History'),
    loadHistory: t('agents.loadHistory', 'Load history'),
    refreshHistory: t('agents.refreshHistory', 'Refresh history'),
    searchPlaceholder: t('agents.searchPlaceholder', 'Search title or preview'),
    idleHistory: t('agents.idleHistory', 'History is loaded on demand.'),
    loadingHistory: t('agents.loadingHistory', 'Loading local history…'),
    historyError: t('agents.historyError', 'Unable to load local history.'),
    noHistory: t('agents.noHistory', 'No agent history found.'),
    noSearchResults: t('agents.noSearchResults', 'No history matches this search.'),
    historyMore: t('agents.historyMore', 'More local sessions are available.'),
    resume: t('agents.resume', 'Resume'),
    unknownTitle: t('agents.unknownTitle', 'Untitled session'),
    unknownDate: t('agents.unknownDate', 'Unknown date'),
    cwdUnavailable: t('agents.cwdUnavailable', 'cwd unavailable'),
    model: t('agents.model', 'Model'),
    messages: t('agents.messages', 'Messages'),
    started: t('agents.started', 'Started'),
    lastActivity: t('agents.lastActivity', 'Last activity'),
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {!selectedProvider ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-4 py-6">
          <div className="max-w-[280px] text-center">
            <Settings size={18} className="mx-auto text-text-secondary" />
            <p className="mt-3 text-sm leading-6 text-text-secondary">{copy.unconfigured}</p>
            <button
              type="button"
              className="mt-4 inline-flex items-center rounded-full border border-border-visible px-3 py-2 text-xs text-text-display transition-colors hover:border-text-secondary hover:bg-hover-bg"
              onClick={onOpenWorkspaceSettings}
            >
              {copy.configureWorkspace}
            </button>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
        <section className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock3 size={14} className="text-text-secondary" />
              <h3 className="nd-label text-text-display">{copy.running}</h3>
            </div>
            <span className="font-mono text-[10px] text-text-disabled">{sessions.length}</span>
          </div>
          <div className="mt-2 space-y-2">
            {sessions.length === 0 ? (
              <p className="py-1 text-xs text-text-disabled">{copy.noRunning}</p>
            ) : sessions.map((session) => (
              <RunningSessionCard
                key={`${session.workspaceId}-${session.tileId}`}
                session={session}
                tile={tileById.get(session.tileId)}
                terminalTitles={terminalTitles}
                onFocusTile={onFocusTile}
                fallbackTitle={`${providerLabel(session.provider)} agent`}
              />
            ))}
          </div>
        </section>

        <section className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <History size={14} className="text-text-secondary" />
              <h3 className="nd-label text-text-display">{copy.history}</h3>
            </div>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border-visible px-2.5 text-xs text-text-secondary transition-colors hover:border-text-secondary hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => historyRefreshSchedulerRef.current.runNow(() => void loadHistory())}
              disabled={historyState.status === 'loading'}
              title={historyState.status === 'idle' ? copy.loadHistory : copy.refreshHistory}
            >
              <RefreshCw size={13} className={historyState.status === 'loading' ? 'animate-spin' : ''} />
              <span>{historyState.status === 'idle' ? copy.loadHistory : copy.refreshHistory}</span>
            </button>
          </div>

          <div className="mt-3 grid gap-2">
            <label className="relative block">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled" />
              <input
                type="search"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder={copy.searchPlaceholder}
                aria-label={copy.searchPlaceholder}
                className="w-full rounded-full border border-border-visible bg-bg-primary py-2 pl-9 pr-3 text-xs text-text-display outline-none placeholder:text-text-disabled focus:border-text-secondary"
              />
            </label>
          </div>

          <div className="mt-3 space-y-2">
            {historyState.status === 'idle' && <p className="py-1 text-xs text-text-disabled">{copy.idleHistory}</p>}
            {historyState.status === 'loading' && <p className="py-1 text-xs text-text-disabled">{copy.loadingHistory}</p>}
            {historyState.status === 'error' && (
              <div className="rounded-[14px] border border-border-visible bg-bg-primary px-3 py-2.5 text-xs text-red-300">
                {copy.historyError}
              </div>
            )}
            {historyState.status === 'ready' && historyState.items.length === 0 && (
              <p className="py-1 text-xs text-text-disabled">
                {historySearch.trim() ? copy.noSearchResults : copy.noHistory}
              </p>
            )}
            {historyState.items.map((item) => (
              <HistoryCard
                key={`${item.provider}-${item.identifier}`}
                item={item}
                onResume={resumeAgent}
                resumeDisabled={!canResume(item.provider)}
                unknownTitle={copy.unknownTitle}
                unknownDate={copy.unknownDate}
                cwdUnavailableLabel={copy.cwdUnavailable}
                resumeLabel={copy.resume}
                modelLabel={copy.model}
                messagesLabel={copy.messages}
                startedLabel={copy.started}
                activeLabel={copy.lastActivity}
              />
            ))}
            {shouldShowAgentHistoryMore(historyState.status, historyState.hasMore) && (
              <p className="pt-1 text-center text-[11px] text-text-disabled">{copy.historyMore}</p>
            )}
          </div>
        </section>
        </div>
      )}
    </div>
  )
}
