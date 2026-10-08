import React from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  GitBranch,
  LoaderCircle,
  RefreshCw,
  SquareMinus,
  SquarePlus,
  Undo2,
} from 'lucide-react'
import type {
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

export type SourceControlAction =
  | { type: 'toggle'; change: GitFileChange; staged: boolean }
  | { type: 'toggleAll'; changes: GitFileChange[]; staged: boolean }
  | { type: 'discard'; changes: GitFileChange[] }
  | { type: 'commit'; message: string }
  | { type: 'sync' }

export type RepositoryAction = SourceControlAction | { type: 'fetch' | 'pull' | 'push' }

export interface SourceControlRepositorySectionProps {
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

const rowActionClassName = 'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-hover-bg hover:text-text-display disabled:opacity-50'

function FileChangeRow({ change, staged, depth, displayPath, disabled, onToggle, onDiscard, onOpenDiff }: {
  change: GitFileChange
  staged: boolean
  depth: number
  displayPath: boolean
  disabled: boolean
  onToggle: (change: GitFileChange, staged: boolean) => void
  onDiscard: (changes: GitFileChange[]) => void
  onOpenDiff: (change: GitFileChange, staged: boolean) => void
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

function TreeChangeRow({ node, staged, depth, disabled, onToggle, onDiscard, onOpenDiff }: {
  node: SourceControlTreeNode<GitFileChange>
  staged: boolean
  depth: number
  disabled: boolean
  onToggle: (change: GitFileChange, staged: boolean) => void
  onDiscard: (changes: GitFileChange[]) => void
  onOpenDiff: (change: GitFileChange, staged: boolean) => void
}): React.ReactElement {
  if (node.entry) {
    return <FileChangeRow change={node.entry} staged={staged} depth={depth} displayPath={false} disabled={disabled} onToggle={onToggle} onDiscard={onDiscard} onOpenDiff={onOpenDiff} />
  }

  return (
    <>
      <div className="flex items-center gap-1.5 py-1.5 pr-3 text-sm text-text-secondary" style={{ paddingLeft: `${12 + depth * 16}px` }}>
        <ChevronDown size={14} className="shrink-0" />
        <Folder size={14} className="shrink-0" />
        <span className="min-w-0 truncate">{node.name}</span>
      </div>
      {node.children?.map((child) => (
        <TreeChangeRow key={child.path} node={child} staged={staged} depth={depth + 1} disabled={disabled} onToggle={onToggle} onDiscard={onDiscard} onOpenDiff={onOpenDiff} />
      ))}
    </>
  )
}

function ChangeSection({ title, changes, staged, viewMode, disabled, onToggle, onToggleAll, onDiscard, onOpenDiff }: {
  title: string
  changes: GitFileChange[]
  staged: boolean
  viewMode: SourceControlViewMode
  disabled: boolean
  onToggle: (change: GitFileChange, staged: boolean) => void
  onToggleAll: (changes: GitFileChange[], staged: boolean) => void
  onDiscard: (changes: GitFileChange[]) => void
  onOpenDiff: (change: GitFileChange, staged: boolean) => void
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
        {changes.length > 0 && (
          <button
            type="button"
            className={rowActionClassName}
            onClick={() => onToggleAll(changes, staged)}
            disabled={disabled}
            title={staged ? t('sourceControl.unstageAll') : t('sourceControl.stageAll')}
            aria-label={staged ? t('sourceControl.unstageAll') : t('sourceControl.stageAll')}
          >
            {staged ? <SquareMinus size={15} /> : <SquarePlus size={15} />}
          </button>
        )}
      </div>
      {changes.length === 0 ? (
        <div className="px-4 py-2 text-xs text-text-disabled">{t('sourceControl.noChanges')}</div>
      ) : viewMode === 'tree' ? (
        <div>
          {buildSourceControlTree(changes).map((node) => (
            <TreeChangeRow key={node.path} node={node} staged={staged} depth={0} disabled={disabled} onToggle={onToggle} onDiscard={onDiscard} onOpenDiff={onOpenDiff} />
          ))}
        </div>
      ) : (
        <div>
          {changes.map((change) => (
            <FileChangeRow key={change.path} change={change} staged={staged} depth={0} displayPath disabled={disabled} onToggle={onToggle} onDiscard={onDiscard} onOpenDiff={onOpenDiff} />
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

function CommitRow({ commit }: { commit: GitCommitSummary }): React.ReactElement {
  const { t } = useTranslation()
  const subject = typeof commit.subject === 'string' && commit.subject ? commit.subject : t('sourceControl.noSubject')
  const shortHash = typeof commit.shortHash === 'string' && commit.shortHash ? commit.shortHash : '—'
  const commitDate = typeof commit.commitDate === 'string' && commit.commitDate ? commit.commitDate : undefined

  return (
    <div className="flex min-w-0 items-center gap-2 px-4 py-1.5 text-xs text-text-secondary" title={subject}>
      <span className="shrink-0 font-mono text-[11px] text-text-disabled">{shortHash}</span>
      <span className="min-w-0 flex-1 truncate">{subject}</span>
      <time className="shrink-0 text-[11px] text-text-disabled" dateTime={commitDate} title={commitDate ?? t('sourceControl.unknownDate')}>
        {relativeCommitDate(commit.commitDate, i18n.language)}
      </time>
    </div>
  )
}

function CommitSection({ title, commits }: { title: string; commits: GitCommitSummary[] }): React.ReactElement {
  const { t } = useTranslation()
  return (
    <section className="border-t border-border py-2 first:border-t-0">
      <div className="nd-label px-4 py-1.5 text-text-secondary">{title}</div>
      {commits.length === 0 ? (
        <div className="px-4 py-2 text-xs text-text-disabled">{t('sourceControl.noCommits')}</div>
      ) : (
        <div>{commits.map((commit, index) => <CommitRow key={`${commit.shortHash}-${index}`} commit={commit} />)}</div>
      )}
    </section>
  )
}

function CommitHistoryAccordion({ history, upstream, expanded, onToggle, id }: {
  history: GitCommitHistoryResult | undefined
  upstream?: string
  expanded: boolean
  onToggle: () => void
  id: string
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
                  <CommitSection title={t('sourceControl.outgoing', { count: outgoing.length })} commits={outgoing} />
                  <CommitSection title={t('sourceControl.latestRemote')} commits={upstreamCommits.slice(0, 5)} />
                </>
              ) : (
                <>
                  <div className="px-4 py-2 text-xs text-text-secondary">{t('sourceControl.noRemoteComparison')}</div>
                  <CommitSection title={t('sourceControl.latestLocal')} commits={localCommits.slice(0, 5)} />
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
        const disabledForUpstream = requiresUpstream && !repositoryStatus.upstream
        const isPending = pendingAction === type

        return (
          <button
            key={type}
            type="button"
            className="flex min-w-0 items-center gap-2 rounded border border-border px-2 py-1.5 text-left text-text-secondary hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50"
            disabled={Boolean(pendingAction) || disabledForUpstream}
            title={disabledForUpstream ? t('sourceControl.requiresUpstream', { action: label }) : label}
            onClick={() => onAction(type === 'sync' ? { type: 'sync' } : { type })}
          >
            {isPending ? <LoaderCircle size={15} className="shrink-0 animate-spin" /> : <Icon size={15} className="shrink-0" />}
            <span className="min-w-0">
              <span className="block text-xs text-text-display">{label}</span>
              <span className="block truncate text-[11px] text-text-disabled">{isPending ? t('sourceControl.working') : subtitle}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function SourceControlRepositorySection({
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
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-hover-bg"
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="min-w-0 flex-1 truncate text-sm text-text-display">
            {repository.name}{duplicateName ? <span className="text-xs text-text-disabled"> · {repository.relativePath}</span> : null}
          </span>
          <span className="max-w-24 truncate text-xs text-text-secondary">
            {repositoryStatus?.branch ?? (statusLoading ? t('sourceControl.loading') : t('sourceControl.noBranch'))}
          </span>
          {statusLoading && !repositoryStatus ? <LoaderCircle size={14} className="animate-spin" /> : null}
          {repositoryStatus?.error ? <span className="text-xs text-red-300" title={repositoryStatus.error}>!</span> : null}
          {!repositoryStatus?.error && changeCount > 0 ? (
            <span className="rounded-full bg-active-bg px-2 py-0.5 text-xs text-text-display">{changeCount}</span>
          ) : null}
          {!statusLoading && !repositoryStatus?.error && changeCount === 0 ? <Check size={14} className="text-text-disabled" /> : null}
        </button>
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
                  {repositoryStatus.originUrl ? (
                    <button
                      type="button"
                      className="min-w-0 truncate text-left text-sm text-text-display hover:underline"
                      onClick={() => { void window.electron.shell.openExternal(repositoryStatus.originUrl!) }}
                      title={repositoryStatus.originUrl}
                    >
                      {repositoryStatus.branch ?? t('sourceControl.noBranch')}
                    </button>
                  ) : (
                    <span className="min-w-0 truncate text-sm text-text-display">{repositoryStatus.branch ?? t('sourceControl.noBranch')}</span>
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
              />
              <div className="border-t border-border p-3">
                <label htmlFor={commitMessageId} className="sr-only">{t('sourceControl.commitMessage')}</label>
                <textarea
                  id={commitMessageId}
                  className="h-16 w-full resize-none rounded border border-border-visible bg-bg-primary px-2 py-1.5 text-sm text-text-display outline-none placeholder:text-text-disabled disabled:opacity-50"
                  value={commitMessage}
                  onChange={(event) => onCommitMessageChange(event.target.value)}
                  placeholder={t('sourceControl.commitMessage')}
                  disabled={Boolean(pendingAction)}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded bg-active-bg px-3 text-sm text-text-display hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => onAction({ type: 'commit', message: commitMessage.trim() })}
                    disabled={!canCommit || Boolean(pendingAction)}
                  >
                    {t('sourceControl.commit')}
                  </button>
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
