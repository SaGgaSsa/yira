import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Clock3, History, Play, RefreshCw, Search, Settings, Terminal } from 'lucide-react'
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
  formatAgentAge,
  sanitizeAgentCwd,
  type AgentHistoryScope,
} from '@/utils/agentPanel'

interface AgentPanelProfile {
  id: ShellProfileId
  label: string
  available: boolean
}

export interface AgentPanelProps {
  workspaceId: string
  agentProviders: AgentProvidersConfig
  availableProfiles: AgentPanelProfile[]
  tiles: TileState[]
  terminalTitles: Record<string, string>
  addTerminal: (profileId: ShellProfileId, agent?: TerminalAgentMetadata) => string | null
  onFocusTile: (tileId: string) => void
  onOpenSettings: () => void
}

type HistoryState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  items: AgentSessionHistoryItem[]
  hasMore: boolean
}

const PROVIDERS: readonly AgentProvider[] = ['claude', 'codex']

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

function availabilityLabel(
  provider: AgentProvider,
  providers: AgentProvidersConfig,
  availability: AgentProviderAvailabilitySnapshot | null,
  availabilityError: boolean,
  loadingLabel: string,
  availableLabel: string,
  unavailableLabel: string,
  disabledLabel: string,
): string {
  if (providers[provider]?.enabled === false) return disabledLabel
  if (availabilityError) return unavailableLabel
  if (!availability) return loadingLabel
  return availability[provider]?.available ? availableLabel : unavailableLabel
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
  agentProviders,
  availableProfiles,
  tiles,
  terminalTitles,
  addTerminal,
  onFocusTile,
  onOpenSettings,
}: AgentPanelProps): React.ReactElement {
  const { t } = useTranslation()
  const [availability, setAvailability] = useState<AgentProviderAvailabilitySnapshot | null>(null)
  const [availabilityError, setAvailabilityError] = useState(false)
  const [sessions, setSessions] = useState<AgentActiveSession[]>([])
  const [historyScope, setHistoryScope] = useState<AgentHistoryScope>('workspace')
  const [historySearch, setHistorySearch] = useState('')
  const [historyState, setHistoryState] = useState<HistoryState>({ status: 'idle', items: [], hasMore: false })
  const historyRequestRef = useRef(0)

  const availableProfile = useMemo(
    () => availableProfiles.find((profile) => profile.available),
    [availableProfiles],
  )

  useEffect(() => {
    let cancelled = false
    setAvailability(null)
    setAvailabilityError(false)

    void window.electron.agents.availability()
      .then((result) => {
        if (cancelled) return
        setAvailability(result)
      })
      .catch(() => {
        if (cancelled) return
        setAvailabilityError(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setSessions([])

    const removeListener = window.electron.agents.onSessionsChanged((snapshot) => {
      if (!cancelled) setSessions(snapshot.sessions)
    })

    void window.electron.agents.sessionsSnapshot(workspaceId)
      .then((snapshot) => {
        if (!cancelled) setSessions(snapshot.sessions)
      })
      .catch(() => {
        if (!cancelled) setSessions([])
      })

    let subscribed = false
    void window.electron.agents.subscribeSessions(workspaceId)
      .then((result) => {
        subscribed = result
        if (cancelled && subscribed) void window.electron.agents.unsubscribeSessions()
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      removeListener()
      if (subscribed) void window.electron.agents.unsubscribeSessions()
    }
  }, [workspaceId])

  useEffect(() => {
    historyRequestRef.current += 1
    setHistoryState({ status: 'idle', items: [], hasMore: false })
  }, [historyScope, workspaceId])

  const loadHistory = useCallback(async () => {
    const requestId = ++historyRequestRef.current
    const query = buildAgentHistoryQuery(historyScope, workspaceId, historySearch)
    setHistoryState({ status: 'loading', items: [], hasMore: false })

    try {
      const result = await window.electron.agents.history(query)
      if (requestId !== historyRequestRef.current) return
      setHistoryState({ status: 'ready', items: result.items, hasMore: result.hasMore })
    } catch {
      if (requestId !== historyRequestRef.current) return
      setHistoryState({ status: 'error', items: [], hasMore: false })
    }
  }, [historyScope, historySearch, workspaceId])

  const canLaunch = useCallback((provider: AgentProvider): boolean => {
    if (!availableProfile || agentProviders[provider]?.enabled === false) return false
    if (availabilityError || !availability) return false
    return availability[provider]?.available === true
  }, [agentProviders, availability, availabilityError, availableProfile])

  const launchAgent = useCallback((provider: AgentProvider) => {
    if (!availableProfile || !canLaunch(provider)) return
    const tileId = addTerminal(availableProfile.id, { provider })
    if (tileId) onFocusTile(tileId)
  }, [addTerminal, availableProfile, canLaunch, onFocusTile])

  const resumeAgent = useCallback((item: AgentSessionHistoryItem) => {
    if (!availableProfile) return
    const cwd = sanitizeAgentCwd(item.cwd)
    const metadata: TerminalAgentMetadata = {
      provider: item.provider,
      sessionId: item.identifier,
      ...(cwd ? { cwd } : {}),
    }
    const tileId = addTerminal(availableProfile.id, metadata)
    if (tileId) onFocusTile(tileId)
  }, [addTerminal, availableProfile, onFocusTile])

  const tileById = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles])
  const setupNeeded = availabilityError || (availability !== null && PROVIDERS.some((provider) => (
    agentProviders[provider]?.enabled !== false && availability[provider]?.available !== true
  )))

  const copy = {
    title: t('agents.title', 'Agents'),
    newSession: t('agents.newSession', 'New agent session'),
    available: t('agents.available', 'Available'),
    unavailable: t('agents.unavailable', 'Unavailable'),
    disabled: t('agents.disabled', 'Disabled in workspace'),
    loading: t('agents.loading', 'Checking…'),
    running: t('agents.running', 'Running sessions'),
    noRunning: t('agents.noRunning', 'No running agent sessions'),
    history: t('agents.history', 'History'),
    loadHistory: t('agents.loadHistory', 'Load history'),
    refreshHistory: t('agents.refreshHistory', 'Refresh history'),
    scope: t('agents.scope', 'Scope'),
    workspace: t('agents.workspace', 'Workspace'),
    allLocal: t('agents.allLocal', 'All local'),
    searchPlaceholder: t('agents.searchPlaceholder', 'Search title or preview'),
    idleHistory: t('agents.idleHistory', 'History is loaded on demand.'),
    loadingHistory: t('agents.loadingHistory', 'Loading local history…'),
    historyError: t('agents.historyError', 'Unable to load local history.'),
    noHistory: t('agents.noHistory', 'No agent history found.'),
    noSearchResults: t('agents.noSearchResults', 'No history matches this search.'),
    historyMore: t('agents.historyMore', 'More local sessions are available.'),
    resume: t('agents.resume', 'Resume'),
    openSettings: t('agents.openSettings', 'Open Settings'),
    setupDescription: t('agents.setupDescription', 'Install or configure a provider, then refresh availability.'),
    noShell: t('agents.noShell', 'No available shell profile can launch an agent.'),
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
      <div className="shrink-0 border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-text-secondary" />
          <div className="nd-label text-text-display">{copy.title}</div>
        </div>
        <div className="mt-1 text-xs text-text-secondary">{copy.newSession}</div>
        <div className="mt-3 grid gap-2">
          {PROVIDERS.map((provider) => {
            const enabled = agentProviders[provider]?.enabled !== false
            const isAvailable = availability?.[provider]?.available === true
            const canStart = canLaunch(provider)
            const providerState = availabilityLabel(
              provider,
              agentProviders,
              availability,
              availabilityError,
              copy.loading,
              copy.available,
              copy.unavailable,
              copy.disabled,
            )
            return (
              <button
                key={provider}
                type="button"
                className="flex items-center gap-3 rounded-[16px] border border-border-visible bg-bg-primary px-3 py-2.5 text-left transition-colors hover:border-text-secondary hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canStart}
                onClick={() => launchAgent(provider)}
                aria-label={`Start ${providerLabel(provider)} agent`}
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary">
                  <Terminal size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-text-display">{providerLabel(provider)}</span>
                  <span className="mt-0.5 block text-[11px] text-text-secondary">{providerState}</span>
                </span>
                <Play size={14} className={enabled && isAvailable && availableProfile ? 'text-text-display' : 'text-text-disabled'} />
              </button>
            )
          })}
        </div>
        {!availableProfile && <p className="mt-2 text-xs text-text-disabled">{copy.noShell}</p>}
        {setupNeeded && (
          <div className="mt-3 rounded-[14px] border border-border-visible bg-bg-primary px-3 py-2.5">
            <p className="text-xs leading-5 text-text-secondary">{copy.setupDescription}</p>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-text-display underline decoration-border-visible underline-offset-4 hover:decoration-text-display"
              onClick={onOpenSettings}
            >
              <Settings size={13} />
              {copy.openSettings}
            </button>
          </div>
        )}
      </div>

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
              onClick={() => void loadHistory()}
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
            <label className="flex items-center justify-between gap-3 rounded-full border border-border-visible bg-bg-primary px-3 py-2 text-xs text-text-secondary">
              <span>{copy.scope}</span>
              <select
                value={historyScope}
                onChange={(event) => setHistoryScope(event.target.value as AgentHistoryScope)}
                className="bg-transparent text-right text-xs text-text-display outline-none"
                aria-label={copy.scope}
              >
                <option value="workspace">{copy.workspace}</option>
                <option value="all">{copy.allLocal}</option>
              </select>
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
                resumeDisabled={!availableProfile}
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
            {historyState.status === 'ready' && historyState.hasMore && (
              <p className="pt-1 text-center text-[11px] text-text-disabled">{copy.historyMore}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
