import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  CloudUpload,
  ExternalLink,
  ChevronRight,
  File,
  FileText,
  Folder,
  GitBranch,
  LoaderCircle,
  RefreshCw,
  SquareMinus,
  SquarePlus,
  Undo2,
} from 'lucide-react'
import type {
  GitBranch as GitBranchType,
  GitCommitHistoryResult,
  GitCommitSummary,
  GitFileChange,
  GitRepository,
  GitStatusResult,
  SourceControlViewMode,
} from '@shared/types'
import { buildSourceControlTree, type SourceControlTreeNode } from '@/utils/sourceControlTree'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import { SourceControlBranchPicker } from './SourceControlBranchPicker'

export type SourceControlAction =
  | { type: 'toggle'; change: GitFileChange; staged: boolean }
  | { type: 'toggleAll'; changes: GitFileChange[]; staged: boolean }
  | { type: 'discard'; changes: GitFileChange[] }
  | { type: 'commit'; message: string; push?: boolean }
  | { type: 'sync' }

export type RepositoryAction = SourceControlAction | { type: 'fetch' | 'pull' | 'push' | 'publish' } | { type: 'checkout'; branch: GitBranchType } | { type: 'createBranch'; name: string; startPoint?: string }

export interface SourceControlRepositorySectionProps {
  workspaceId: string
  repository: GitRepository
  duplicateName: boolean
  repositoryStatus: GitStatusResult | undefined
  statusLoading: boolean
  expanded: boolean
  history: GitCommitHistoryResult | undefined
  commitsExpanded: boolean
  commitMessage: string
  pendingAction: string | undefined
  actionError: string | undefined
  retryAction: RepositoryAction | undefined
  viewMode: SourceControlViewMode
  onToggleExpanded: () => void
  onToggleCommits: () => void
  onCommitMessageChange: (message: string) => void
  onAction: (action: RepositoryAction) => void
  onRetryStatus: () => void
  onRetryAction: () => void
  onOpenDiff: (change: GitFileChange, staged: boolean) => void
  onOpenFile?: (change: GitFileChange) => void
  onOpenCommitDiff?: (commit: GitCommitSummary, change: GitFileChange) => void
}

function statusLabel(status: GitFileChange['status']): string {
  return {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    copied: 'C',
    unmerged: 'U',
    untracked: 'U',
    unknown: '?',
  }[status]
}

const rowActionClassName = 'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-hover-bg hover:text-text-display disabled:opacity-50'

function FileChangeRow({ change, staged, depth, displayPath, disabled, onToggle, onDiscard, onOpenDiff, onOpenFile }: {
  change: GitFileChange
  staged: boolean
  depth: number
  displayPath: boolean
  disabled: boolean
  onToggle: (change: GitFileChange, staged: boolean) => void
  onDiscard: (changes: GitFileChange[]) => void
  onOpenDiff: (change: GitFileChange, staged: boolean) => void
  onOpenFile?: (change: GitFileChange) => void
}): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div
      className="flex min-w-0 cursor-pointer items-center gap-2 py-1.5 pr-3 text-sm text-text-secondary hover:bg-hover-bg"
      role="button"
      tabIndex={0}
      onClick={() => onOpenDiff(change, staged)}
      onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && !(event.target as HTMLElement).closest('button')) { event.preventDefault(); onOpenDiff(change, staged) } }}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      title={change.originalPath ? `${change.path} (renamed from ${change.originalPath})` : change.path}
    >
      <span className="w-3 shrink-0 text-center font-mono text-xs text-text-disabled">{statusLabel(change.status)}</span>
      <File size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs">
        {displayPath ? change.path : change.path.split('/').at(-1)}
      </span>
      {onOpenFile && change.status !== 'deleted' && (
        <button
          type="button"
          className={rowActionClassName}
          onClick={(event) => { event.stopPropagation(); onOpenFile(change) }}
          disabled={disabled}
          title={t('sourceControl.openFile')}
          aria-label={t('sourceControl.openPath', { path: change.path })}
        >
          <FileText size={15} />
        </button>
      )}
      {!staged && (
        <button
          type="button"
          className={rowActionClassName}
          onClick={(event) => { event.stopPropagation(); onDiscard([change]) }}
          disabled={disabled}
          title={t('sourceControl.discardFile')}
          aria-label={t('sourceControl.discardPath', { path: change.path })}
        >
          <Undo2 size={15} />
        </button>
      )}
      <button
        type="button"
        className={rowActionClassName}
        onClick={(event) => { event.stopPropagation(); onToggle(change, staged) }}
        disabled={disabled}
        title={staged ? t('sourceControl.unstageFile') : t('sourceControl.stageFile')}
        aria-label={staged ? t('sourceControl.unstagePath', { path: change.path }) : t('sourceControl.stagePath', { path: change.path })}
      >
        {staged ? <SquareMinus size={15} /> : <SquarePlus size={15} />}
      </button>
    </div>
  )
}

function folderChanges(node: SourceControlTreeNode<GitFileChange>): GitFileChange[] {
  return [
    ...(node.entry ? [node.entry] : []),
    ...(node.children ?? []).flatMap(folderChanges),
  ]
}

function TreeChangeRow({ node, staged, depth, disabled, onToggle, onToggleAll, onDiscard, onOpenDiff, onOpenFile }: {
  node: SourceControlTreeNode<GitFileChange>
  staged: boolean
  depth: number
  disabled: boolean
  onToggle: (change: GitFileChange, staged: boolean) => void
  onToggleAll: (changes: GitFileChange[], staged: boolean) => void
  onDiscard: (changes: GitFileChange[]) => void
  onOpenDiff: (change: GitFileChange, staged: boolean) => void
  onOpenFile?: (change: GitFileChange) => void
}): React.ReactElement {
  const { t } = useTranslation()
  if (node.entry) {
    return <FileChangeRow change={node.entry} staged={staged} depth={depth} displayPath={false} disabled={disabled} onToggle={onToggle} onDiscard={onDiscard} onOpenDiff={onOpenDiff} onOpenFile={onOpenFile} />
  }

  return (
    <>
      <div className="flex items-center gap-1.5 py-1.5 pr-3 text-sm text-text-secondary" style={{ paddingLeft: `${12 + depth * 16}px` }}>
        <ChevronDown size={14} className="shrink-0" />
        <Folder size={14} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {depth === 0 && (
          <button
            type="button"
            className={rowActionClassName}
            onClick={() => onToggleAll(folderChanges(node), staged)}
            disabled={disabled}
            title={staged ? t('sourceControl.unstageFolder', { path: node.path }) : t('sourceControl.stageFolder', { path: node.path })}
            aria-label={staged ? t('sourceControl.unstageFolder', { path: node.path }) : t('sourceControl.stageFolder', { path: node.path })}
          >
            {staged ? <SquareMinus size={15} /> : <SquarePlus size={15} />}
          </button>
        )}
      </div>
      {node.children?.map((child) => (
        <TreeChangeRow key={child.path} node={child} staged={staged} depth={depth + 1} disabled={disabled} onToggle={onToggle} onToggleAll={onToggleAll} onDiscard={onDiscard} onOpenDiff={onOpenDiff} onOpenFile={onOpenFile} />
      ))}
    </>
  )
}

function ChangeSection({ title, changes, staged, viewMode, disabled, onToggle, onToggleAll, onDiscard, onOpenDiff, onOpenFile }: {
  title: string
  changes: GitFileChange[]
  staged: boolean
  viewMode: SourceControlViewMode
  disabled: boolean
  onToggle: (change: GitFileChange, staged: boolean) => void
  onToggleAll: (changes: GitFileChange[], staged: boolean) => void
  onDiscard: (changes: GitFileChange[]) => void
  onOpenDiff: (change: GitFileChange, staged: boolean) => void
  onOpenFile?: (change: GitFileChange) => void
}): React.ReactElement {
  const { t } = useTranslation()
  return (
    <section className="border-b border-border py-2 last:border-b-0">
      <div className="flex items-center gap-2 py-1 pl-4 pr-3">
        <span className="nd-label min-w-0 flex-1 truncate py-0.5 text-text-secondary">{title} ({changes.length})</span>
        {!staged && changes.length > 0 && (
          <button
            type="button"
            className={rowActionClassName}
            onClick={() => onDiscard(changes)}
            disabled={disabled}
            title={t('sourceControl.discardAll')}
            aria-label={t('sourceControl.discardAll')}
          >
            <Undo2 size={15} />
          </button>
        )}
      </div>
      {changes.length === 0 ? (
        <div className="px-4 py-2 text-xs text-text-disabled">{t('sourceControl.noChanges')}</div>
      ) : viewMode === 'tree' ? (
        <div>
          {buildSourceControlTree(changes).map((node) => (
            <TreeChangeRow key={node.path} node={node} staged={staged} depth={0} disabled={disabled} onToggle={onToggle} onToggleAll={onToggleAll} onDiscard={onDiscard} onOpenDiff={onOpenDiff} onOpenFile={onOpenFile} />
          ))}
        </div>
      ) : (
        <div>
          {changes.map((change) => (
            <FileChangeRow key={change.path} change={change} staged={staged} depth={0} displayPath disabled={disabled} onToggle={onToggle} onDiscard={onDiscard} onOpenDiff={onOpenDiff} onOpenFile={onOpenFile} />
          ))}
        </div>
      )}
    </section>
  )
}

function relativeCommitDate(commitDate: string | null | undefined, language: string): string {
  const timestamp = typeof commitDate === 'string' ? Date.parse(commitDate) : Number.NaN
  if (!Number.isFinite(timestamp)) return i18n.t('sourceControl.unknownDate')

  const elapsedSeconds = (timestamp - Date.now()) / 1000
  const elapsed = Math.abs(elapsedSeconds)
  const units = [
    { seconds: 31_536_000, unit: 'year' as const },
    { seconds: 2_592_000, unit: 'month' as const },
    { seconds: 604_800, unit: 'week' as const },
    { seconds: 86_400, unit: 'day' as const },
    { seconds: 3_600, unit: 'hour' as const },
    { seconds: 60, unit: 'minute' as const },
  ]
  const unit = units.find(({ seconds }) => elapsed >= seconds) ?? { seconds: 1, unit: 'second' as const }
  const value = Math.max(1, Math.floor(elapsed / unit.seconds))
  return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(
    Math.sign(elapsedSeconds) * value,
    unit.unit,
  )
}

function CommitRow({ commit, workspaceId, repositoryPath, onOpenCommitDiff }: {
  commit: GitCommitSummary
  workspaceId: string
  repositoryPath: string
  onOpenCommitDiff?: (commit: GitCommitSummary, change: GitFileChange) => void
}): React.ReactElement {
  const { t } = useTranslation()
  const subject = typeof commit.subject === 'string' && commit.subject ? commit.subject : t('sourceControl.noSubject')
  const shortHash = typeof commit.shortHash === 'string' && commit.shortHash ? commit.shortHash : '—'
  const commitDate = typeof commit.commitDate === 'string' && commit.commitDate ? commit.commitDate : undefined
  const [expanded, setExpanded] = useState(false)
  const [files, setFiles] = useState<GitFileChange[] | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const loadedRef = useRef(false)

  const loadFiles = async () => {
    if (loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    setError(undefined)
    try {
      const result = await window.electron.git.commitFiles(workspaceId, repositoryPath, commit.shortHash)
      if (result?.error) {
        setFiles([])
        setError(result.error)
      } else {
        setFiles(Array.isArray(result?.files) ? result.files : [])
      }
    } catch (caught) {
      setFiles([])
      setError(caught instanceof Error ? caught.message : String(caught))
    }
    setLoading(false)
  }

  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    if (next && !loadedRef.current) void loadFiles()
  }

  return (
    <>
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 px-4 py-1.5 text-left text-xs text-text-secondary hover:bg-hover-bg"
        aria-expanded={expanded}
        onClick={toggle}
        title={subject}
      >
        {expanded ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
        <span className="shrink-0 font-mono text-[11px] text-text-disabled">{shortHash}</span>
        <span className="min-w-0 flex-1 truncate">{subject}</span>
        <time className="shrink-0 text-[11px] text-text-disabled" dateTime={commitDate} title={commitDate ?? t('sourceControl.unknownDate')}>
          {relativeCommitDate(commit.commitDate, i18n.language)}
        </time>
      </button>
      {expanded && (
        <div className="pl-8">
          {loading && (
            <div className="px-4 py-2 text-xs text-text-disabled">{t('sourceControl.loading')}</div>
          )}
          {!loading && error && (
            <div className="px-4 py-2 text-xs text-red-300">{t('sourceControl.loadHistoryError', { error })}</div>
          )}
          {!loading && !error && Array.isArray(files) && files.length === 0 && (
            <div className="px-4 py-2 text-xs text-text-disabled">{t('sourceControl.noFiles')}</div>
          )}
          {!loading && !error && Array.isArray(files) && files.length > 0 && (
            <div>
              {files.map((change, index) => (
                <button
                  key={`${change.path}-${index}`}
                  type="button"
                  className="flex w-full min-w-0 items-center gap-2 px-4 py-1.5 text-left text-xs text-text-secondary hover:bg-hover-bg"
                  title={change.path}
                  onClick={() => onOpenCommitDiff?.(commit, change)}
                >
                  <span className="w-3 shrink-0 text-center font-mono text-xs text-text-disabled">{statusLabel(change.status)}</span>
                  <File size={13} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{change.path}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function CommitSection({ title, commits, workspaceId, repositoryPath, onOpenCommitDiff }: { title: string; commits: GitCommitSummary[]; workspaceId: string; repositoryPath: string; onOpenCommitDiff?: (commit: GitCommitSummary, change: GitFileChange) => void }): React.ReactElement {
  const { t } = useTranslation()
  return (
    <section className="border-t border-border py-2 first:border-t-0">
      <div className="nd-label px-4 py-1.5 text-text-secondary">{title}</div>
      {commits.length === 0 ? (
        <div className="px-4 py-2 text-xs text-text-disabled">{t('sourceControl.noCommits')}</div>
      ) : (
        <div>{commits.map((commit, index) => <CommitRow key={`${commit.shortHash}-${index}`} commit={commit} workspaceId={workspaceId} repositoryPath={repositoryPath} onOpenCommitDiff={onOpenCommitDiff} />)}</div>
      )}
    </section>
  )
}

function CommitHistoryAccordion({ history, upstream, expanded, onToggle, id, workspaceId, repositoryPath, onOpenCommitDiff }: {
  history: GitCommitHistoryResult | undefined
  upstream?: string
  expanded: boolean
  onToggle: () => void
  id: string
  workspaceId: string
  repositoryPath: string
  onOpenCommitDiff?: (commit: GitCommitSummary, change: GitFileChange) => void
}): React.ReactElement {
  const { t } = useTranslation()
  const outgoing = history?.outgoing ?? []
  const upstreamCommits = history?.upstream ?? []
  const localCommits = history?.local ?? []

  return (
    <section className="border-b border-border">
      <h2 className="m-0">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-display hover:bg-hover-bg"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={id}
        >
          <ChevronDown size={14} className={`shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          <span>{t('sourceControl.commits')}</span>
        </button>
      </h2>
      {expanded && (
        <div id={id} role="region" aria-label={t('sourceControl.commits')}>
          {history === undefined ? (
            <div className="px-4 py-2 text-xs text-text-disabled">{t('sourceControl.loadingHistory')}</div>
          ) : (
            <>
              {history.error && (
                <div className="px-4 py-2 text-xs text-red-300" role="status">
                  {t('sourceControl.loadHistoryError', { error: history.error })}
                </div>
              )}
              {upstream ? (
                <>
                  <CommitSection title={t('sourceControl.outgoing', { count: outgoing.length })} commits={outgoing} workspaceId={workspaceId} repositoryPath={repositoryPath} onOpenCommitDiff={onOpenCommitDiff} />
                  <CommitSection title={t('sourceControl.latestRemote')} commits={upstreamCommits.slice(0, 5)} workspaceId={workspaceId} repositoryPath={repositoryPath} onOpenCommitDiff={onOpenCommitDiff} />
                </>
              ) : (
                <>
                  <div className="px-4 py-2 text-xs text-text-secondary">{t('sourceControl.noRemoteComparison')}</div>
                  <CommitSection title={t('sourceControl.latestLocal')} commits={localCommits.slice(0, 5)} workspaceId={workspaceId} repositoryPath={repositoryPath} onOpenCommitDiff={onOpenCommitDiff} />
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function RepositoryActions({
  repositoryStatus,
  pendingAction,
  onAction,
}: {
  repositoryStatus: GitStatusResult
  pendingAction: string | undefined
  onAction: (action: RepositoryAction) => void
}): React.ReactElement {
  const { t } = useTranslation()
  const actions = [
    { type: 'fetch', label: t('sourceControl.actionFetch'), subtitle: t('sourceControl.fetchRefs'), Icon: ArrowDownToLine, requiresUpstream: false },
    { type: 'pull', label: 'Pull', subtitle: `↓${t('sourceControl.behind', { count: repositoryStatus.behind })}`, Icon: ArrowDownToLine, requiresUpstream: true },
    { type: 'push', label: 'Push', subtitle: `↑${t('sourceControl.ahead', { count: repositoryStatus.ahead })}`, Icon: ArrowUpFromLine, requiresUpstream: true },
    { type: 'sync', label: t('sourceControl.actionSync'), subtitle: t('sourceControl.pullThenPush'), Icon: RefreshCw, requiresUpstream: true },
  ] as const

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {actions.map(({ type, label, subtitle, Icon, requiresUpstream }) => {
        const isPublish = type === 'push' && !repositoryStatus.upstream && Boolean(repositoryStatus.branch)
        const resolvedLabel = isPublish ? t('sourceControl.publishBranch') : label
        const resolvedSubtitle = isPublish ? t('sourceControl.publishSetUpstream') : subtitle
        const ActionIcon = isPublish ? CloudUpload : Icon
        const disabledForUpstream = isPublish ? false : requiresUpstream && !repositoryStatus.upstream
        const isPending = pendingAction === (isPublish ? 'publish' : type)

        return (
          <button
            key={type}
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-sm border border-border px-2 py-1.5 text-left text-text-secondary hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50"
            disabled={Boolean(pendingAction) || disabledForUpstream}
            title={disabledForUpstream ? t('sourceControl.requiresUpstream', { action: resolvedLabel }) : resolvedLabel}
            onClick={() => onAction(isPublish ? { type: 'publish' } : type === 'sync' ? { type: 'sync' } : { type })}
          >
            {isPending ? <LoaderCircle size={15} className="shrink-0 animate-spin" /> : <ActionIcon size={15} className="shrink-0" />}
            <span className="min-w-0">
              <span className="block text-xs text-text-display">{resolvedLabel}</span>
              <span className="block truncate text-[11px] text-text-disabled">{isPending ? t('sourceControl.working') : resolvedSubtitle}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

type CommitMode = 'commit' | 'commitPush'

const commitModeStorageKey = 'yira.sourceControl.commitMode'

function readCommitMode(): CommitMode {
  try {
    return window.localStorage.getItem(commitModeStorageKey) === 'commitPush' ? 'commitPush' : 'commit'
  } catch {
    return 'commit'
  }
}

function writeCommitMode(mode: CommitMode): void {
  try {
    window.localStorage.setItem(commitModeStorageKey, mode)
  } catch {
    // Ignore storage failures.
  }
}

function CommitButton({ commitMessage, canCommit, pendingAction, onAction }: {
  commitMessage: string
  canCommit: boolean
  pendingAction: string | undefined
  onAction: (action: RepositoryAction) => void
}): React.ReactElement {
  const { t } = useTranslation()
  const [mode, setMode] = useState<CommitMode>(readCommitMode)
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      const contains = containerRef.current?.contains?.(target) ?? (containerRef.current === target)
      if (containerRef.current && !contains) {
        setMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const execute = (nextMode: CommitMode) => {
    onAction({ type: 'commit', message: commitMessage.trim(), push: nextMode === 'commitPush' })
  }

  const choose = (nextMode: CommitMode) => {
    setMode(nextMode)
    writeCommitMode(nextMode)
    setMenuOpen(false)
    execute(nextMode)
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        className="inline-flex h-8 items-center rounded-l-sm bg-active-bg px-3 text-sm text-text-display hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => execute(mode)}
        disabled={!canCommit || Boolean(pendingAction)}
      >
        {mode === 'commitPush' ? t('sourceControl.commitAndPush') : t('sourceControl.commit')}
      </button>
      <button
        type="button"
        className="inline-flex h-8 items-center rounded-r-sm border-l border-border bg-active-bg px-1.5 text-text-display hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50"
        aria-haspopup="menu"
        aria-label={t('sourceControl.commitAndPush')}
        disabled={!canCommit || Boolean(pendingAction)}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <ChevronDown size={14} />
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-sm border border-border bg-bg-primary shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center px-3 py-1.5 text-left text-sm text-text-display hover:bg-hover-bg"
            onClick={() => choose('commit')}
          >
            {t('sourceControl.commit')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center px-3 py-1.5 text-left text-sm text-text-display hover:bg-hover-bg"
            onClick={() => choose('commitPush')}
          >
            {t('sourceControl.commitAndPush')}
          </button>
        </div>
      )}
    </div>
  )
}

export function SourceControlRepositorySection({
  workspaceId,
  repository,
  duplicateName,
  repositoryStatus,
  statusLoading,
  expanded,
  history,
  commitsExpanded,
  commitMessage,
  pendingAction,
  actionError,
  retryAction,
  viewMode,
  onToggleExpanded,
  onToggleCommits,
  onCommitMessageChange,
  onAction,
  onRetryStatus,
  onRetryAction,
  onOpenDiff,
  onOpenFile,
  onOpenCommitDiff,
}: SourceControlRepositorySectionProps): React.ReactElement {
  const { t } = useTranslation()
  const changeCount = (repositoryStatus?.staged.length ?? 0) + (repositoryStatus?.unstaged.length ?? 0)
  const isRepository = repositoryStatus?.isRepository === true
  const canCommit = Boolean(repositoryStatus?.staged.length) && Boolean(commitMessage.trim())
  const repositoryId = encodeURIComponent(repository.relativePath)
  const commitMessageId = `source-control-commit-${repositoryId}`
  const historyId = `source-control-commits-${repositoryId}`

  return (
    <section className="border-b border-border">
      <h2 className="m-0">
        <div className="flex w-full items-center gap-2 px-3 py-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left hover:bg-hover-bg"
            aria-expanded={expanded}
            onClick={onToggleExpanded}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="min-w-0 flex-1 truncate text-sm text-text-display">
              {repository.name}{duplicateName ? <span className="text-xs text-text-disabled"> · {repository.relativePath}</span> : null}
            </span>
          </button>
          <SourceControlBranchPicker
            workspaceId={workspaceId}
            repositoryPath={repository.relativePath}
            currentBranch={repositoryStatus?.branch ?? null}
            disabled={Boolean(pendingAction)}
            onSelect={(branch) => onAction({ type: 'checkout', branch })}
            onCreate={(name, startPoint) => onAction({ type: 'createBranch', name, startPoint })}
          />
          {statusLoading && !repositoryStatus ? <LoaderCircle size={14} className="animate-spin" /> : null}
          {repositoryStatus?.error ? <span className="text-xs text-red-300" title={repositoryStatus.error}>!</span> : null}
          {!repositoryStatus?.error && changeCount > 0 ? (
            <span className="rounded-full bg-active-bg px-2 py-0.5 text-xs text-text-display">{changeCount}</span>
          ) : null}
          {!statusLoading && !repositoryStatus?.error && changeCount === 0 ? <Check size={14} className="text-text-disabled" /> : null}
        </div>
      </h2>

      {expanded && (
        <>
          {statusLoading && !repositoryStatus && (
            <div className="px-4 py-3 text-sm text-text-disabled">{t('sourceControl.loadingSourceControl')}</div>
          )}
          {repositoryStatus && !isRepository && (
            <div className="px-4 py-3 text-sm text-red-300">
              <p>{repositoryStatus.error ?? t('sourceControl.notGitRepository')}</p>
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-text-display hover:underline"
                onClick={onRetryStatus}
              >
                <RefreshCw size={14} /> {t('sourceControl.retry')}
              </button>
            </div>
          )}
          {isRepository && repositoryStatus && (
            <>
              <div className="border-t border-border px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <GitBranch size={15} className="shrink-0 text-text-secondary" />
                  <SourceControlBranchPicker
                    workspaceId={workspaceId}
                    repositoryPath={repository.relativePath}
                    currentBranch={repositoryStatus.branch ?? null}
                    disabled={Boolean(pendingAction)}
                    onSelect={(branch) => onAction({ type: 'checkout', branch })}
                    onCreate={(name, startPoint) => onAction({ type: 'createBranch', name, startPoint })}
                  />
                  {repositoryStatus.originUrl && (
                    <button
                      type="button"
                      className={rowActionClassName}
                      onClick={() => { void window.electron.shell.openExternal(repositoryStatus.originUrl!) }}
                      title={t('sourceControl.openInBrowser')}
                      aria-label={t('sourceControl.openInBrowser')}
                    >
                      <ExternalLink size={14} />
                    </button>
                  )}
                </div>
                <div className="mt-1 pl-6 text-xs text-text-disabled">
                  {repositoryStatus.upstream
                    ? `${repositoryStatus.upstream} · ↑${repositoryStatus.ahead} ↓${repositoryStatus.behind}`
                    : t('sourceControl.noUpstream')}
                </div>
                <RepositoryActions repositoryStatus={repositoryStatus} pendingAction={pendingAction} onAction={onAction} />
              </div>

              <CommitHistoryAccordion
                history={history}
                upstream={repositoryStatus.upstream}
                expanded={commitsExpanded}
                onToggle={onToggleCommits}
                id={historyId}
                workspaceId={workspaceId}
                repositoryPath={repository.relativePath}
                onOpenCommitDiff={onOpenCommitDiff}
              />
              <ChangeSection
                title={t('sourceControl.stagedChanges')}
                changes={repositoryStatus.staged}
                staged
                viewMode={viewMode}
                disabled={Boolean(pendingAction)}
                onToggle={(change, staged) => onAction({ type: 'toggle', change, staged })}
                onToggleAll={(changes, staged) => onAction({ type: 'toggleAll', changes, staged })}
                onDiscard={(changes) => onAction({ type: 'discard', changes })}
                onOpenDiff={onOpenDiff}
                onOpenFile={onOpenFile}
              />
              <ChangeSection
                title={t('sourceControl.changes')}
                changes={repositoryStatus.unstaged}
                staged={false}
                viewMode={viewMode}
                disabled={Boolean(pendingAction)}
                onToggle={(change, staged) => onAction({ type: 'toggle', change, staged })}
                onToggleAll={(changes, staged) => onAction({ type: 'toggleAll', changes, staged })}
                onDiscard={(changes) => onAction({ type: 'discard', changes })}
                onOpenDiff={onOpenDiff}
                onOpenFile={onOpenFile}
              />
              <div className="border-t border-border p-3">
                <label htmlFor={commitMessageId} className="sr-only">{t('sourceControl.commitMessage')}</label>
                <textarea
                  id={commitMessageId}
                  className="h-16 w-full resize-none rounded-sm border border-border-visible bg-bg-primary px-2 py-1.5 text-sm text-text-display outline-hidden placeholder:text-text-disabled disabled:opacity-50"
                  value={commitMessage}
                  onChange={(event) => onCommitMessageChange(event.target.value)}
                  placeholder={t('sourceControl.commitMessage')}
                  disabled={Boolean(pendingAction)}
                />
                <div className="mt-2 flex justify-end">
                  <CommitButton
                    commitMessage={commitMessage}
                    canCommit={canCommit}
                    pendingAction={pendingAction}
                    onAction={onAction}
                  />
                </div>
              </div>
            </>
          )}
          {actionError && (
            <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-xs text-red-300">
              <span className="min-w-0 flex-1">{actionError}</span>
              {retryAction && (
                <button
                  type="button"
                  className="shrink-0 text-text-display hover:underline disabled:opacity-50"
                  onClick={onRetryAction}
                  disabled={Boolean(pendingAction)}
                >
                  {t('sourceControl.retryOperation')}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
