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

export type SourceControlAction =
  | { type: 'toggle'; change: GitFileChange; staged: boolean }
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

function FileChangeRow({ change, staged, depth, displayPath, disabled, onToggle }: {
  change: GitFileChange
  staged: boolean
  depth: number
  displayPath: boolean
  disabled: boolean
  onToggle: (change: GitFileChange, staged: boolean) => void
}): React.ReactElement {
  return (
    <div
      className="flex min-w-0 items-center gap-2 py-1.5 pr-3 text-sm text-text-secondary"
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      title={change.originalPath ? `${change.path} (renamed from ${change.originalPath})` : change.path}
    >
      <span className="w-3 shrink-0 text-center font-mono text-xs text-text-disabled">{statusLabel(change.status)}</span>
      <File size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs">
        {displayPath ? change.path : change.path.split('/').at(-1)}
      </span>
      <button
        type="button"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-hover-bg hover:text-text-display disabled:opacity-50"
        onClick={() => onToggle(change, staged)}
        disabled={disabled}
        title={staged ? 'Unstage file' : 'Stage file'}
        aria-label={staged ? `Unstage ${change.path}` : `Stage ${change.path}`}
      >
        {staged ? <SquareMinus size={15} /> : <SquarePlus size={15} />}
      </button>
    </div>
  )
}

function TreeChangeRow({ node, staged, depth, disabled, onToggle }: {
  node: SourceControlTreeNode<GitFileChange>
  staged: boolean
  depth: number
  disabled: boolean
  onToggle: (change: GitFileChange, staged: boolean) => void
}): React.ReactElement {
  if (node.entry) {
    return <FileChangeRow change={node.entry} staged={staged} depth={depth} displayPath={false} disabled={disabled} onToggle={onToggle} />
  }

  return (
    <>
      <div className="flex items-center gap-1.5 py-1.5 pr-3 text-sm text-text-secondary" style={{ paddingLeft: `${12 + depth * 16}px` }}>
        <ChevronDown size={14} className="shrink-0" />
        <Folder size={14} className="shrink-0" />
        <span className="min-w-0 truncate">{node.name}</span>
      </div>
      {node.children?.map((child) => (
        <TreeChangeRow key={child.path} node={child} staged={staged} depth={depth + 1} disabled={disabled} onToggle={onToggle} />
      ))}
    </>
  )
}

function ChangeSection({ title, changes, staged, viewMode, disabled, onToggle }: {
  title: string
  changes: GitFileChange[]
  staged: boolean
  viewMode: SourceControlViewMode
  disabled: boolean
  onToggle: (change: GitFileChange, staged: boolean) => void
}): React.ReactElement {
  return (
    <section className="border-b border-border py-2 last:border-b-0">
      <div className="nd-label px-4 py-1.5 text-text-secondary">{title} ({changes.length})</div>
      {changes.length === 0 ? (
        <div className="px-4 py-2 text-xs text-text-disabled">No changes</div>
      ) : viewMode === 'tree' ? (
        <div>
          {buildSourceControlTree(changes).map((node) => (
            <TreeChangeRow key={node.path} node={node} staged={staged} depth={0} disabled={disabled} onToggle={onToggle} />
          ))}
        </div>
      ) : (
        <div>
          {changes.map((change) => (
            <FileChangeRow key={change.path} change={change} staged={staged} depth={0} displayPath disabled={disabled} onToggle={onToggle} />
          ))}
        </div>
      )}
    </section>
  )
}

function relativeCommitDate(commitDate: string | null | undefined): string {
  const timestamp = typeof commitDate === 'string' ? Date.parse(commitDate) : Number.NaN
  if (!Number.isFinite(timestamp)) return 'fecha desconocida'

  const elapsedSeconds = Math.round((Date.now() - timestamp) / 1000)
  const elapsed = Math.abs(elapsedSeconds)
  if (elapsed < 60) return elapsedSeconds < 0 ? 'en un momento' : 'hace un momento'

  const units = [
    { seconds: 31_536_000, singular: 'año', plural: 'años' },
    { seconds: 2_592_000, singular: 'mes', plural: 'meses' },
    { seconds: 604_800, singular: 'semana', plural: 'semanas' },
    { seconds: 86_400, singular: 'día', plural: 'días' },
    { seconds: 3_600, singular: 'hora', plural: 'horas' },
    { seconds: 60, singular: 'minuto', plural: 'minutos' },
  ]
  const unit = units.find(({ seconds }) => elapsed >= seconds)
  if (!unit) return elapsedSeconds < 0 ? 'en un momento' : 'hace un momento'

  const value = Math.max(1, Math.floor(elapsed / unit.seconds))
  const label = value === 1 ? unit.singular : unit.plural
  return elapsedSeconds < 0 ? `en ${value} ${label}` : `hace ${value} ${label}`
}

function CommitRow({ commit }: { commit: GitCommitSummary }): React.ReactElement {
  const subject = typeof commit.subject === 'string' && commit.subject ? commit.subject : '(sin asunto)'
  const shortHash = typeof commit.shortHash === 'string' && commit.shortHash ? commit.shortHash : '—'
  const commitDate = typeof commit.commitDate === 'string' && commit.commitDate ? commit.commitDate : undefined

  return (
    <div className="flex min-w-0 items-center gap-2 px-4 py-1.5 text-xs text-text-secondary" title={subject}>
      <span className="shrink-0 font-mono text-[11px] text-text-disabled">{shortHash}</span>
      <span className="min-w-0 flex-1 truncate">{subject}</span>
      <time className="shrink-0 text-[11px] text-text-disabled" dateTime={commitDate} title={commitDate ?? 'Fecha desconocida'}>
        {relativeCommitDate(commit.commitDate)}
      </time>
    </div>
  )
}

function CommitSection({ title, commits }: { title: string; commits: GitCommitSummary[] }): React.ReactElement {
  return (
    <section className="border-t border-border py-2 first:border-t-0">
      <div className="nd-label px-4 py-1.5 text-text-secondary">{title}</div>
      {commits.length === 0 ? (
        <div className="px-4 py-2 text-xs text-text-disabled">No hay commits</div>
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
          <span>Commits</span>
        </button>
      </h2>
      {expanded && (
        <div id={id} role="region" aria-label="Commits">
          {history === undefined ? (
            <div className="px-4 py-2 text-xs text-text-disabled">Cargando historial…</div>
          ) : (
            <>
              {history.error && (
                <div className="px-4 py-2 text-xs text-red-300" role="status">
                  No se pudo cargar el historial: {history.error}
                </div>
              )}
              {upstream ? (
                <>
                  <CommitSection title={`Por subir (${outgoing.length})`} commits={outgoing} />
                  <CommitSection title="Últimos en remoto" commits={upstreamCommits.slice(0, 5)} />
                </>
              ) : (
                <>
                  <div className="px-4 py-2 text-xs text-text-secondary">No hay comparación remota</div>
                  <CommitSection title="Últimos locales" commits={localCommits.slice(0, 5)} />
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
  const actions = [
    { type: 'fetch', label: 'Fetch', subtitle: 'Fetch refs', Icon: ArrowDownToLine, requiresUpstream: false },
    { type: 'pull', label: 'Pull', subtitle: `↓${repositoryStatus.behind} behind`, Icon: ArrowDownToLine, requiresUpstream: true },
    { type: 'push', label: 'Push', subtitle: `↑${repositoryStatus.ahead} ahead`, Icon: ArrowUpFromLine, requiresUpstream: true },
    { type: 'sync', label: 'Sync', subtitle: 'Pull then push', Icon: RefreshCw, requiresUpstream: true },
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
            title={disabledForUpstream ? `${label} requires an upstream branch` : label}
            onClick={() => onAction(type === 'sync' ? { type: 'sync' } : { type })}
          >
            {isPending ? <LoaderCircle size={15} className="shrink-0 animate-spin" /> : <Icon size={15} className="shrink-0" />}
            <span className="min-w-0">
              <span className="block text-xs text-text-display">{label}</span>
              <span className="block truncate text-[11px] text-text-disabled">{isPending ? 'Working…' : subtitle}</span>
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
}: SourceControlRepositorySectionProps): React.ReactElement {
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
            {repositoryStatus?.branch ?? (statusLoading ? 'Loading…' : 'No branch')}
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
            <div className="px-4 py-3 text-sm text-text-disabled">Loading source control…</div>
          )}
          {repositoryStatus && !isRepository && (
            <div className="px-4 py-3 text-sm text-red-300">
              <p>{repositoryStatus.error ?? 'This workspace is not a Git repository.'}</p>
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-text-display hover:underline"
                onClick={onRetryStatus}
              >
                <RefreshCw size={14} /> Retry
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
                      {repositoryStatus.branch ?? 'No branch'}
                    </button>
                  ) : (
                    <span className="min-w-0 truncate text-sm text-text-display">{repositoryStatus.branch ?? 'No branch'}</span>
                  )}
                </div>
                <div className="mt-1 pl-6 text-xs text-text-disabled">
                  {repositoryStatus.upstream
                    ? `${repositoryStatus.upstream} · ↑${repositoryStatus.ahead} ↓${repositoryStatus.behind}`
                    : 'No upstream'}
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
                title="Staged Changes"
                changes={repositoryStatus.staged}
                staged
                viewMode={viewMode}
                disabled={Boolean(pendingAction)}
                onToggle={(change, staged) => onAction({ type: 'toggle', change, staged })}
              />
              <ChangeSection
                title="Changes"
                changes={repositoryStatus.unstaged}
                staged={false}
                viewMode={viewMode}
                disabled={Boolean(pendingAction)}
                onToggle={(change, staged) => onAction({ type: 'toggle', change, staged })}
              />
              <div className="border-t border-border p-3">
                <label htmlFor={commitMessageId} className="sr-only">Commit message</label>
                <textarea
                  id={commitMessageId}
                  className="h-16 w-full resize-none rounded border border-border-visible bg-bg-primary px-2 py-1.5 text-sm text-text-display outline-none placeholder:text-text-disabled disabled:opacity-50"
                  value={commitMessage}
                  onChange={(event) => onCommitMessageChange(event.target.value)}
                  placeholder="Commit message"
                  disabled={Boolean(pendingAction)}
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded bg-active-bg px-3 text-sm text-text-display hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => onAction({ type: 'commit', message: commitMessage.trim() })}
                    disabled={!canCommit || Boolean(pendingAction)}
                  >
                    Commit
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
                  Retry operation
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
