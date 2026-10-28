import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bot,
  Columns2,
  Copy,
  File,
  Folder,
  Frame,
  Globe,
  House,
  LayoutGrid,
  PanelLeft,
  PanelRight,
  Pin,
  Play,
  Plus,
  Search,
  Settings,
  Square,
  StickyNote,
  Terminal,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AgentActiveSession, FileSearchEntry, WorkspaceMetadata } from '@shared/types'
import { useNow } from '@/hooks/useNow'
import { useCommandPaletteStore } from '@/store/commandPaletteStore'
import { formatActivityElapsed } from '@/utils/activityPalette'
import {
  buildCommandPaletteHome,
  buildCommandPaletteResults,
  matchCommandPaletteText,
  parseCommandPaletteQuery,
  sessionItemKey,
  type CommandPaletteAction,
  type CommandPaletteCatalog,
  type CommandPaletteIcon,
  type CommandPaletteItem,
  type CommandPaletteMatch,
  type CommandPaletteRecent,
  type CommandPaletteSectionId,
} from '@/utils/commandPalette'
import { getAgentSessionTitle } from '@/utils/terminalDisplayTitle'

const ELAPSED_REFRESH_MS = 30_000
const FILE_SEARCH_DEBOUNCE_MS = 120
const PROMPT_PREVIEW_LENGTH = 60

const ITEM_ICONS: Record<CommandPaletteIcon, LucideIcon> = {
  plus: Plus,
  focus: Square,
  split: Columns2,
  grid: LayoutGrid,
  canvas: Frame,
  home: House,
  terminal: Terminal,
  agent: Bot,
  note: StickyNote,
  browser: Globe,
  sidebar: PanelLeft,
  panel: PanelRight,
  settings: Settings,
  script: Play,
  workspace: Folder,
  file: File,
}

const SESSION_ACTION_ICONS: Record<CommandPaletteSessionAction['icon'], LucideIcon> = {
  open: ArrowRight,
  split: Columns2,
  pin: Pin,
  copy: Copy,
  close: X,
}

const SECTION_TITLE_KEYS: Partial<Record<CommandPaletteSectionId, string>> = {
  attention: 'commandPalette.sectionAttention',
  recent: 'commandPalette.sectionRecent',
  active: 'commandPalette.sectionActive',
  sessions: 'commandPalette.sectionSessions',
  workspaces: 'commandPalette.sectionWorkspaces',
  actions: 'commandPalette.sectionActions',
  files: 'commandPalette.sectionFiles',
}

export interface CommandPaletteSessionAction {
  id: string
  label: string
  icon: 'open' | 'split' | 'pin' | 'copy' | 'close'
  /** Muted text at the right, for example the branch name. */
  detail?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  run: () => void
}

export interface CommandPaletteProps {
  open: boolean
  focusRequestId: number
  workspaces: WorkspaceMetadata[]
  activeWorkspaceId: string
  sessions: readonly AgentActiveSession[]
  actions: readonly CommandPaletteAction[]
  /** Muted text next to "New agent session", for example `yira · Claude`. */
  newSessionDetail: string
  newSessionShortcut: string
  searchFiles: ((query: string) => Promise<FileSearchEntry[]>) | null
  canOpenSessionInSplit: (session: AgentActiveSession) => boolean
  getSessionActions: (session: AgentActiveSession) => CommandPaletteSessionAction[]
  onClose: () => void
  onNewSession: (prompt?: string) => void
  onOpenSession: (session: AgentActiveSession, options: { split: boolean }) => void
  onOpenWorkspace: (workspace: WorkspaceMetadata) => void
  onOpenFile: (entry: FileSearchEntry) => void
  onRunAction: (actionId: string) => void
}

interface PaletteItemRow {
  key: string
  type: 'item'
  item: CommandPaletteItem
  match?: CommandPaletteMatch
}

interface PaletteMoreRow {
  key: string
  type: 'more'
  count: number
}

interface PaletteSessionActionRow {
  key: string
  type: 'session-action'
  action: CommandPaletteSessionAction
  match?: CommandPaletteMatch
}

type PaletteRow = PaletteItemRow | PaletteMoreRow | PaletteSessionActionRow

function isRowSelectable(row: PaletteRow): boolean {
  return row.type !== 'session-action' || !row.action.disabled
}

function providerColor(provider: AgentActiveSession['provider']): string {
  return provider === 'claude' ? 'var(--agent-claude)' : 'var(--agent-codex)'
}

function fileFolder(entry: FileSearchEntry): string {
  const segments = entry.relativePath.split(/[\\/]/)
  segments.pop()
  return segments.join('/')
}

function truncatePrompt(prompt: string): string {
  return prompt.length > PROMPT_PREVIEW_LENGTH ? `${prompt.slice(0, PROMPT_PREVIEW_LENGTH)}…` : prompt
}

function Keycap({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <kbd className="rounded-sm border border-border-visible px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">
      {children}
    </kbd>
  )
}

function LastUsedBadge({ label }: { label: string }): React.ReactElement {
  return (
    <span className="shrink-0 rounded-sm border border-accent px-1.5 py-0.5 font-mono text-[10.5px] text-accent">
      {label}
    </span>
  )
}

/** Same colors as the Activity palette; the arc spins while the agent works. */
function SessionStatusGlyph({ status }: { status: AgentActiveSession['status'] }): React.ReactElement {
  if (status === 'needs-input') {
    return (
      <svg
        viewBox="0 0 16 16"
        width={16}
        height={16}
        className="shrink-0 text-warning"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6" />
        <path d="M6.2 5.9a1.9 1.9 0 1 1 2.4 1.85c-.4.13-.6.5-.6.9v.35" strokeLinecap="round" />
        <circle cx="8" cy="11.3" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  if (status === 'working') {
    return (
      <svg
        viewBox="0 0 16 16"
        width={16}
        height={16}
        className="shrink-0 animate-spin text-activity"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6" opacity={0.25} />
        <path d="M8 2a6 6 0 0 1 6 6" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      className="shrink-0 text-success"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M5.4 8.2 7.2 10l3.4-3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Paints the matched ranges without disturbing the label around them. */
function HighlightedLabel({
  label,
  ranges,
}: {
  label: string
  ranges: readonly [number, number][]
}): React.ReactElement {
  if (ranges.length === 0) return <>{label}</>

  const parts: React.ReactNode[] = []
  let cursor = 0
  ranges.forEach(([start, end], index) => {
    if (start > cursor) parts.push(<React.Fragment key={`text-${index}`}>{label.slice(cursor, start)}</React.Fragment>)
    parts.push(
      <mark key={`mark-${index}`} className="bg-transparent text-accent underline underline-offset-2">
        {label.slice(start, end)}
      </mark>,
    )
    cursor = Math.max(cursor, end)
  })
  if (cursor < label.length) parts.push(<React.Fragment key="text-end">{label.slice(cursor)}</React.Fragment>)

  return <>{parts}</>
}

export function CommandPalette({
  open,
  focusRequestId,
  workspaces,
  activeWorkspaceId,
  sessions,
  actions,
  newSessionDetail,
  newSessionShortcut,
  searchFiles,
  canOpenSessionInSplit,
  getSessionActions,
  onClose,
  onNewSession,
  onOpenSession,
  onOpenWorkspace,
  onOpenFile,
  onRunAction,
}: CommandPaletteProps): React.ReactElement | null {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const requestIdRef = useRef(0)
  const [text, setText] = useState('')
  const [subPageSession, setSubPageSession] = useState<AgentActiveSession | null>(null)
  const [actionFilter, setActionFilter] = useState('')
  const [activeExpanded, setActiveExpanded] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // Freeze the order for this opening; agents below still update live.
  const [recents, setRecents] = useState<readonly CommandPaletteRecent[]>(
    () => useCommandPaletteStore.getState().recents,
  )
  // Files belong to the query that produced them so an old response never flashes.
  const [fileResults, setFileResults] = useState<{ query: string; entries: FileSearchEntry[] }>({
    query: '',
    entries: [],
  })
  const [pendingFileQuery, setPendingFileQuery] = useState<string | null>(null)
  const now = useNow(ELAPSED_REFRESH_MS)

  const catalog = useMemo<CommandPaletteCatalog>(
    () => ({ sessions, workspaces, actions, activeWorkspaceId }),
    [actions, activeWorkspaceId, sessions, workspaces],
  )
  const query = useMemo(() => parseCommandPaletteQuery(text), [text])
  const isSearching = text.trim().length > 0
  const isHome = !isSearching && !subPageSession
  const isFileSearch = isSearching && (query.mode === 'all' || query.mode === 'files') && query.text.length >= 2
  const currentFiles = fileResults.query === query.text ? fileResults.entries : []
  const filesPending = isFileSearch
    && searchFiles !== null
    && (pendingFileQuery !== null ? pendingFileQuery === query.text : fileResults.query !== query.text)

  const sessionLabel = useCallback((session: AgentActiveSession): string => (
    getAgentSessionTitle(session)
    || t(session.provider === 'claude' ? 'commandPalette.providerClaude' : 'commandPalette.providerCodex')
  ), [t])

  const providerLabel = useCallback((provider: AgentActiveSession['provider']): string => (
    t(provider === 'claude' ? 'commandPalette.providerClaude' : 'commandPalette.providerCodex')
  ), [t])

  const homeSections = useMemo(
    () => buildCommandPaletteHome({ catalog, recents, activeExpanded }),
    [activeExpanded, catalog, recents],
  )
  const resultSections = useMemo(
    () => (
      isSearching
        ? buildCommandPaletteResults({ catalog, query, files: currentFiles, sessionLabel })
        : []
    ),
    [catalog, currentFiles, isSearching, query, sessionLabel],
  )
  const sections = isSearching ? resultSections : homeSections

  const availableSessionActions = useMemo(
    () => (subPageSession ? getSessionActions(subPageSession) : []),
    [getSessionActions, subPageSession],
  )
  const filteredSessionActions = useMemo(() => {
    const filter = actionFilter.trim()
    return availableSessionActions.flatMap((action) => {
      const match = matchCommandPaletteText(action.label, filter)
      return match ? [{ action, match }] : []
    })
  }, [actionFilter, availableSessionActions])

  const rows = useMemo<PaletteRow[]>(() => {
    if (subPageSession) {
      return filteredSessionActions.map(({ action, match }): PaletteRow => ({
        key: `session-action:${action.id}`,
        type: 'session-action',
        action,
        match,
      }))
    }
    return sections.flatMap((section) => {
      const sectionRows: PaletteRow[] = section.items.map((item): PaletteRow => ({
        key: item.key,
        type: 'item',
        item,
        match: section.matches?.[item.key],
      }))
      if (section.id === 'active' && section.items.length < section.total) {
        sectionRows.push({ key: 'more:active', type: 'more', count: section.total - section.items.length })
      }
      return sectionRows
    })
  }, [filteredSessionActions, sections, subPageSession])

  const rowIds = useMemo(
    () => new Map(rows.map((row, index) => [row.key, `command-palette-option-${index}`])),
    [rows],
  )

  const selectedRow = rows.find((row) => row.key === selectedKey && isRowSelectable(row))
    ?? rows.find(isRowSelectable)
    ?? null
  const selectedRowKey = selectedRow?.key ?? null

  const setRowRef = useCallback((key: string) => (element: HTMLDivElement | null) => {
    if (element) rowRefs.current.set(key, element)
    else rowRefs.current.delete(key)
  }, [])

  const openSessionActions = useCallback((session: AgentActiveSession) => {
    setSubPageSession(session)
    setActionFilter('')
    setSelectedKey(null)
  }, [])

  const leaveSubPage = useCallback(() => {
    if (!subPageSession) return
    setSelectedKey(sessionItemKey(subPageSession.sessionId))
    setSubPageSession(null)
    setActionFilter('')
  }, [subPageSession])

  const completeItem = useCallback((item: CommandPaletteItem, shiftKey: boolean) => {
    useCommandPaletteStore.getState().recordUse(
      item.kind === 'file'
        ? { key: item.key, file: { workspaceId: item.workspaceId, entry: item.entry } }
        : { key: item.key },
    )

    if (item.kind === 'new-session') {
      onNewSession()
      return
    }
    if (item.kind === 'new-session-prompt') {
      onNewSession(item.prompt)
      return
    }
    if (item.kind === 'session') {
      onOpenSession(item.session, { split: shiftKey && canOpenSessionInSplit(item.session) })
      return
    }
    if (item.kind === 'workspace') {
      onOpenWorkspace(item.workspace)
      return
    }
    if (item.kind === 'action') {
      onRunAction(item.action.id)
      return
    }
    onOpenFile(item.entry)
  }, [canOpenSessionInSplit, onNewSession, onOpenFile, onOpenSession, onOpenWorkspace, onRunAction])

  const executeRow = useCallback((row: PaletteRow, shiftKey = false) => {
    if (row.type === 'more') {
      setActiveExpanded(true)
      return
    }
    if (row.type === 'session-action') {
      if (!row.action.disabled) row.action.run()
      return
    }
    completeItem(row.item, shiftKey)
  }, [completeItem])

  const moveSelection = useCallback((delta: number) => {
    const selectable = rows.filter(isRowSelectable)
    if (selectable.length === 0) return
    const currentIndex = selectedRow
      ? selectable.findIndex((row) => row.key === selectedRow.key)
      : -1
    const nextIndex = currentIndex === -1
      ? 0
      : Math.min(selectable.length - 1, Math.max(0, currentIndex + delta))
    setSelectedKey(selectable[nextIndex].key)
  }, [rows, selectedRow])

  useLayoutEffect(() => {
    if (open) setRecents(useCommandPaletteStore.getState().recents)
  }, [open])

  useEffect(() => {
    if (open) return
    setText('')
    setSubPageSession(null)
    setActionFilter('')
    setActiveExpanded(false)
    setSelectedKey(null)
    setFileResults({ query: '', entries: [] })
    setPendingFileQuery(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
  }, [focusRequestId, open])

  useEffect(() => {
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    if (!open || !isFileSearch || !searchFiles) {
      setPendingFileQuery(null)
      return
    }

    const searchText = query.text
    setPendingFileQuery(searchText)
    const timer = window.setTimeout(() => {
      void searchFiles(searchText)
        .then((entries) => {
          if (requestIdRef.current !== requestId) return
          setFileResults({ query: searchText, entries })
          setPendingFileQuery(null)
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return
          setFileResults({ query: searchText, entries: [] })
          setPendingFileQuery(null)
        })
    }, FILE_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [isFileSearch, open, query.text, searchFiles])

  // A response that lands after closing must not touch the next opening.
  useEffect(() => () => {
    requestIdRef.current += 1
  }, [])

  useEffect(() => {
    if (!open || !selectedRowKey) return
    rowRefs.current.get(selectedRowKey)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, selectedRowKey])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return

      if (event.key === 'Tab') {
        event.preventDefault()
        if (
          !event.shiftKey
          && !subPageSession
          && selectedRow?.type === 'item'
          && selectedRow.item.kind === 'session'
        ) {
          openSessionActions(selectedRow.item.session)
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        moveSelection(event.key === 'ArrowDown' ? 1 : -1)
        return
      }
      if (
        subPageSession
        && actionFilter.length === 0
        && (event.key === 'Backspace' || event.key === 'ArrowLeft')
      ) {
        event.preventDefault()
        leaveSubPage()
        return
      }
      if (event.key === 'Enter' && selectedRow) {
        event.preventDefault()
        executeRow(selectedRow, event.shiftKey)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    actionFilter.length,
    executeRow,
    leaveSubPage,
    moveSelection,
    onClose,
    open,
    openSessionActions,
    selectedRow,
    subPageSession,
  ])

  if (!open) return null

  const subPageTitle = subPageSession ? sessionLabel(subPageSession) : ''
  const noResultsQuery = subPageSession ? actionFilter : query.text

  const workspaceName = (workspace: WorkspaceMetadata): string => workspace.name.trim() || workspace.id

  const sessionMeta = (session: AgentActiveSession): string => {
    const workspace = workspaces.find((entry) => entry.id === session.workspaceId)
    return [
      workspace ? workspaceName(workspace) : '',
      providerLabel(session.provider),
      ...(session.worktreeBranch ? [`⎇ ${session.worktreeBranch}`] : []),
    ].filter(Boolean).join(' · ')
  }

  const renderMeta = (item: CommandPaletteItem, selected: boolean): React.ReactNode => {
    const iconClass = selected ? 'text-accent' : 'text-text-muted'

    if (item.kind === 'session') {
      return <SessionStatusGlyph status={item.session.status} />
    }
    if (item.kind === 'new-session' || item.kind === 'new-session-prompt') {
      return <Plus size={16} className={iconClass} aria-hidden="true" />
    }
    if (item.kind === 'workspace') {
      return <Folder size={16} className={iconClass} aria-hidden="true" />
    }
    if (item.kind === 'file') {
      return <File size={16} className={iconClass} aria-hidden="true" />
    }
    const Icon = ITEM_ICONS[item.action.icon]
    return <Icon size={16} className={iconClass} aria-hidden="true" />
  }

  const renderTrailing = (item: CommandPaletteItem): React.ReactNode => {
    const lastUsed = !isSearching && item.key === recents[0]?.key

    if (item.kind === 'session') {
      return (
        <div className="ml-2 flex shrink-0 items-center gap-2">
          {lastUsed && <LastUsedBadge label={t('commandPalette.lastUsed')} />}
          <span className="font-mono text-[11px] text-text-secondary">
            {formatActivityElapsed(item.session.startedAt, now)}
          </span>
        </div>
      )
    }
    if (item.kind === 'new-session') {
      return (
        <div className="ml-2 flex shrink-0 items-center gap-2">
          {lastUsed && <LastUsedBadge label={t('commandPalette.lastUsed')} />}
          <span className="font-mono text-[11px] text-text-secondary">{newSessionDetail}</span>
          <Keycap>{newSessionShortcut}</Keycap>
        </div>
      )
    }
    if (item.kind === 'new-session-prompt') {
      return <span className="ml-2 shrink-0 font-mono text-[11px] text-text-secondary">{newSessionDetail}</span>
    }
    if (item.kind === 'workspace') {
      return (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {lastUsed && <LastUsedBadge label={t('commandPalette.lastUsed')} />}
          {item.workspace.id === activeWorkspaceId && (
            <span className="font-mono text-[11px] text-text-secondary">{t('commandPalette.current')}</span>
          )}
        </div>
      )
    }
    if (item.kind === 'file') {
      const folder = fileFolder(item.entry)
      return (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {lastUsed && <LastUsedBadge label={t('commandPalette.lastUsed')} />}
          {folder && <span className="font-mono text-[11px] text-text-secondary">{folder}</span>}
        </div>
      )
    }
    return (
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {lastUsed && <LastUsedBadge label={t('commandPalette.lastUsed')} />}
        {item.action.shortcut
          ? <Keycap>{item.action.shortcut}</Keycap>
          : item.action.detail
            ? <span className="font-mono text-[11px] text-text-secondary">{item.action.detail}</span>
            : null}
      </div>
    )
  }

  const renderItemLabel = (item: CommandPaletteItem, match?: CommandPaletteMatch): React.ReactNode => {
    if (item.kind === 'session') {
      return (
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] leading-5">
            <HighlightedLabel label={sessionLabel(item.session)} ranges={match?.ranges ?? []} />
          </div>
          <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-text-secondary">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: providerColor(item.session.provider) }}
              aria-hidden="true"
            />
            <span className="truncate">{sessionMeta(item.session)}</span>
          </div>
        </div>
      )
    }
    if (item.kind === 'new-session') {
      return <span className="min-w-0 flex-1 truncate text-[13.5px]">{t('commandPalette.newSession')}</span>
    }
    if (item.kind === 'new-session-prompt') {
      return (
        <span className="min-w-0 flex-1 truncate text-[13.5px]">
          {t('commandPalette.newSessionWithPrompt', { prompt: truncatePrompt(item.prompt) })}
        </span>
      )
    }
    if (item.kind === 'workspace') {
      return (
        <span className="min-w-0 flex-1 truncate text-[13.5px]">
          <HighlightedLabel label={workspaceName(item.workspace)} ranges={match?.ranges ?? []} />
        </span>
      )
    }
    if (item.kind === 'file') {
      return (
        <span className="min-w-0 flex-1 truncate text-[13.5px]">
          <HighlightedLabel label={item.entry.name} ranges={match?.ranges ?? []} />
        </span>
      )
    }
    return (
      <span className="min-w-0 flex-1 truncate text-[13.5px]">
        <HighlightedLabel label={item.action.label} ranges={match?.ranges ?? []} />
      </span>
    )
  }

  const renderItemRow = (item: CommandPaletteItem, match?: CommandPaletteMatch): React.ReactElement => {
    const selected = item.key === selectedRowKey
    return (
      <div
        key={item.key}
        ref={setRowRef(item.key)}
        id={rowIds.get(item.key)}
        role="option"
        aria-selected={selected}
        data-command-palette-item={item.key}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors ${
          item.kind === 'session' ? 'min-h-12 py-1' : 'h-10'
        } ${selected ? 'bg-accent-subtle text-text-display' : 'text-text-primary hover:bg-hover-bg'}`}
        onMouseEnter={() => setSelectedKey(item.key)}
        onClick={() => executeRow({ key: item.key, type: 'item', item, match })}
      >
        {renderMeta(item, selected)}
        {renderItemLabel(item, match)}
        {renderTrailing(item)}
      </div>
    )
  }

  const renderMoreRow = (count: number): React.ReactElement => {
    const selected = selectedRowKey === 'more:active'
    return (
      <div
        key="more:active"
        ref={setRowRef('more:active')}
        id={rowIds.get('more:active')}
        role="option"
        aria-selected={selected}
        data-command-palette-more="true"
        className={`flex h-8 w-full cursor-pointer items-center rounded-lg pl-[38px] font-mono text-[11px] text-text-secondary transition-colors ${
          selected ? 'bg-accent-subtle' : 'hover:bg-hover-bg'
        }`}
        onMouseEnter={() => setSelectedKey('more:active')}
        onClick={() => executeRow({ key: 'more:active', type: 'more', count })}
      >
        {t('commandPalette.showMore', { count })}
      </div>
    )
  }

  const renderSectionHeader = (sectionId: CommandPaletteSectionId, total: number): React.ReactNode => {
    const titleKey = SECTION_TITLE_KEYS[sectionId]
    if (!titleKey) return null
    const showCount = sectionId === 'attention' || sectionId === 'active'
    return (
      <div className="nd-label flex items-center justify-between px-2.5 pb-1 pt-2 text-text-muted">
        <span>{t(titleKey)}</span>
        {showCount && <span>{total}</span>}
      </div>
    )
  }

  const footerHints = subPageSession
    ? (
        <>
          <span><Keycap>↑↓</Keycap> {t('commandPalette.footerMove')}</span>
          <span><Keycap>↵</Keycap> {t('commandPalette.footerRun')}</span>
          <span><Keycap>Backspace</Keycap> {t('commandPalette.footerBack')}</span>
          <span><Keycap>Esc</Keycap> {t('commandPalette.footerClose')}</span>
        </>
      )
    : (
        <>
          <span><Keycap>↑↓</Keycap> {t('commandPalette.footerMove')}</span>
          <span><Keycap>↵</Keycap> {t('commandPalette.footerOpen')}</span>
          <span><Keycap>Shift+↵</Keycap> {t('commandPalette.footerSplit')}</span>
          <span><Keycap>Tab</Keycap> {t('commandPalette.footerActions')}</span>
          <span><Keycap>Esc</Keycap> {t('commandPalette.footerClose')}</span>
        </>
      )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette.dialogLabel')}
        className="mt-[12vh] flex max-h-[70vh] w-[min(640px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border-visible bg-bg-secondary shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-4">
          {subPageSession ? (
            <span className="flex min-w-0 max-w-[45%] shrink-0 items-center gap-1.5 rounded-md border border-border-visible px-2 py-1 text-[12px] text-text-secondary">
              <SessionStatusGlyph status={subPageSession.status} />
              <span className="truncate">{subPageTitle}</span>
            </span>
          ) : (
            <Search size={15} className="shrink-0 text-text-muted" aria-hidden="true" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={subPageSession ? actionFilter : text}
            onChange={(event) => {
              if (subPageSession) setActionFilter(event.target.value)
              else setText(event.target.value)
              setSelectedKey(null)
            }}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text-display outline-hidden placeholder:text-text-muted"
            placeholder={subPageSession ? t('commandPalette.actionsPlaceholder') : t('commandPalette.placeholder')}
            aria-label={t('commandPalette.dialogLabel')}
            spellCheck={false}
          />
        </div>

        <div
          role="listbox"
          aria-label={t('commandPalette.dialogLabel')}
          aria-activedescendant={selectedRowKey ? rowIds.get(selectedRowKey) : undefined}
          className="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          {subPageSession ? (
            <div data-command-palette-section="actions" role="group" aria-label={t('commandPalette.sectionActions')}>
              {renderSectionHeader('actions', filteredSessionActions.length)}
              {filteredSessionActions.map(({ action, match }) => {
                const rowKey = `session-action:${action.id}`
                const selected = rowKey === selectedRowKey
                const Icon = SESSION_ACTION_ICONS[action.icon]
                return (
                  <div
                    key={rowKey}
                    ref={setRowRef(rowKey)}
                    id={rowIds.get(rowKey)}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={action.disabled || undefined}
                    data-command-palette-session-action={action.id}
                    className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors ${
                      action.disabled ? 'cursor-default opacity-50' : 'cursor-pointer'
                    } ${selected ? 'bg-accent-subtle' : 'hover:bg-hover-bg'}`}
                    onMouseEnter={action.disabled ? undefined : () => setSelectedKey(rowKey)}
                    onClick={action.disabled ? undefined : () => executeRow({ key: rowKey, type: 'session-action', action, match })}
                  >
                    <Icon
                      size={16}
                      className={action.danger ? 'text-danger' : selected ? 'text-accent' : 'text-text-muted'}
                      aria-hidden="true"
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-[13.5px] ${
                        action.danger ? 'text-danger' : selected ? 'text-text-display' : 'text-text-primary'
                      }`}
                    >
                      <HighlightedLabel label={action.label} ranges={match?.ranges ?? []} />
                    </span>
                    {action.shortcut
                      ? <Keycap>{action.shortcut}</Keycap>
                      : action.detail
                        ? <span className="shrink-0 font-mono text-[11px] text-text-secondary">{action.detail}</span>
                        : null}
                  </div>
                )
              })}
            </div>
          ) : (
            sections.map((section) => (
              <div
                key={section.id}
                data-command-palette-section={section.id}
                role="group"
                aria-label={section.id === 'top' || section.id === 'create' ? undefined : t(SECTION_TITLE_KEYS[section.id] ?? '')}
                className={section.id === 'create' ? 'mt-1 border-t border-border pt-1' : undefined}
              >
                {renderSectionHeader(section.id, section.total)}
                {section.items.map((item) => renderItemRow(item, section.matches?.[item.key]))}
                {section.id === 'active' && section.items.length < section.total
                  ? renderMoreRow(section.total - section.items.length)
                  : null}
              </div>
            ))
          )}

          {rows.length === 0 && !filesPending && (
            <div className="px-4 py-10 text-center text-sm text-text-secondary">
              {t('commandPalette.noResults', { query: noResultsQuery })}
            </div>
          )}
        </div>

        <div className="nd-label flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-text-muted">
          {footerHints}
          {isHome && (
            <span className="ml-auto flex items-center gap-2 font-mono text-[10.5px]">
              <span>&gt; {t('commandPalette.prefixActions')}</span>
              <span>@ {t('commandPalette.prefixSessions')}</span>
              <span># {t('commandPalette.prefixWorkspaces')}</span>
              <span>/ {t('commandPalette.prefixFiles')}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
