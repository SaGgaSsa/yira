import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, File, Folder, GitBranch, List, RefreshCw, SquarePlus, SquareMinus, TreePine, Upload } from 'lucide-react'
import type { GitCommitHistoryResult, GitCommitSummary, GitFileChange, GitRepository, GitStatusResult, SourceControlViewMode, Workspace } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { buildSourceControlTree, type SourceControlTreeNode } from '@/utils/sourceControlTree'

interface WorkspaceSourceControlProps {
  workspaceId: string
  sourceControlRepositoryPaths: string[]
  sourceControlViewMode: SourceControlViewMode
  onWorkspaceUpdated: (workspace: Workspace) => void
  onOpenWorkspaceSettings: (initialTab?: 'sourceControl') => void
}

type SourceControlAction =
  | { type: 'toggle'; change: GitFileChange; staged: boolean }
  | { type: 'commit'; message: string }
  | { type: 'sync' }

interface SourceControlRefreshOptions {
  preserveActionError?: boolean
}

interface WorkspaceActionError {
  workspaceId: string
  repositoryPath: string | null
  message: string
}

interface WorkspaceRetryAction {
  workspaceId: string
  repositoryPath: string
  action: SourceControlAction
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load source control status'
}

function historyErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load commit history'
}

function repositoryNameFromPath(relativePath: string): string {
  const segments = relativePath.split('/').filter((segment) => segment && segment !== '.' && segment !== '..')
  return segments.at(-1) ?? '.'
}

function sortRepositories(repositories: GitRepository[]): GitRepository[] {
  return [...repositories].sort((left, right) => left.name.localeCompare(right.name) || left.relativePath.localeCompare(right.relativePath))
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
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{displayPath ? change.path : change.path.split('/').at(-1)}</span>
      <button
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
  if (node.entry) return <FileChangeRow change={node.entry} staged={staged} depth={depth} displayPath={false} disabled={disabled} onToggle={onToggle} />

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
        <div>{buildSourceControlTree(changes).map((node) => <TreeChangeRow key={node.path} node={node} staged={staged} depth={0} disabled={disabled} onToggle={onToggle} />)}</div>
      ) : (
        <div>{changes.map((change) => <FileChangeRow key={change.path} change={change} staged={staged} depth={0} displayPath disabled={disabled} onToggle={onToggle} />)}</div>
      )}
    </section>
  )
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

function CommitHistoryAccordion({ history, upstream, expanded, onToggle }: {
  history: GitCommitHistoryResult | null
  upstream?: string
  expanded: boolean
  onToggle: () => void
}): React.ReactElement {
  const outgoing = history?.outgoing ?? []
  const upstreamCommits = history?.upstream ?? []
  const localCommits = history?.local ?? []
  const hasUpstream = Boolean(upstream)

  return (
    <section className="border-b border-border">
      <h2 className="m-0">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-display hover:bg-hover-bg"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls="source-control-commits"
        >
          <ChevronDown size={14} className={`shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          <span>Commits</span>
        </button>
      </h2>
      {expanded && (
        <div id="source-control-commits" role="region" aria-label="Commits">
          {history === null ? (
            <div className="px-4 py-2 text-xs text-text-disabled">Cargando historial…</div>
          ) : (
            <>
              {history.error && (
                <div className="px-4 py-2 text-xs text-red-300" role="status">
                  No se pudo cargar el historial: {history.error}
                </div>
              )}
              {hasUpstream ? (
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

export function WorkspaceSourceControl({ workspaceId, sourceControlRepositoryPaths, sourceControlViewMode, onWorkspaceUpdated, onOpenWorkspaceSettings }: WorkspaceSourceControlProps): React.ReactElement {
  const { t } = useTranslation()
  const [repositories, setRepositories] = useState<GitRepository[]>([])
  const [repositoriesLoading, setRepositoriesLoading] = useState(true)
  const [activeRepositoryPath, setActiveRepositoryPathState] = useState<string | null>(null)
  const [status, setStatus] = useState<GitStatusResult | null>(null)
  const [history, setHistory] = useState<GitCommitHistoryResult | null>(null)
  const [commitsExpanded, setCommitsExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<WorkspaceActionError | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [retryAction, setRetryAction] = useState<WorkspaceRetryAction | null>(null)
  const activeWorkspaceRef = useRef(workspaceId)
  const activeRepositoryPathRef = useRef<string | null>(null)
  const statusWorkspaceRef = useRef<string | null>(null)
  const statusRepositoryRef = useRef<string | null>(null)
  const historyLoadedWorkspaceRef = useRef<string | null>(null)
  const historyLoadedRepositoryRef = useRef<string | null>(null)
  const manualCommitsToggleRef = useRef(new Map<string, boolean>())
  const refreshVersionRef = useRef(0)
  const repositoryLoadVersionRef = useRef(0)
  const sourceControlRepositoryPathsKey = sourceControlRepositoryPaths.join('\u0000')
  activeWorkspaceRef.current = workspaceId

  const setActiveRepositoryPath = useCallback((repositoryPath: string | null) => {
    activeRepositoryPathRef.current = repositoryPath
    setActiveRepositoryPathState(repositoryPath)
  }, [])

  const loadRepositories = useCallback(async (): Promise<string | null> => {
    const loadWorkspaceId = workspaceId
    const loadVersion = repositoryLoadVersionRef.current + 1
    repositoryLoadVersionRef.current = loadVersion
    setRepositoriesLoading(true)

    let discoveredRepositories: GitRepository[] = []
    try {
      const discoveryResult = await window.electron.git.discoverRepositories(workspaceId)
      discoveredRepositories = Array.isArray(discoveryResult) ? discoveryResult : []
    } catch {
      // Configured paths can still be shown with their normalized fallback names.
    }
    if (loadVersion !== repositoryLoadVersionRef.current || activeWorkspaceRef.current !== loadWorkspaceId) return null

    const configuredRepositoryPaths = sourceControlRepositoryPaths.filter((path): path is string => typeof path === 'string' && path.length > 0)
    const discoveredByPath = new Map(discoveredRepositories.map((repository) => [repository.relativePath, repository]))
    const configuredRepositories = configuredRepositoryPaths.map((relativePath) => discoveredByPath.get(relativePath) ?? {
      relativePath,
      name: repositoryNameFromPath(relativePath),
    })
    const nextRepositories = sortRepositories(configuredRepositories)
    setRepositories(nextRepositories)

    const currentPath = activeRepositoryPathRef.current
    const nextPath = currentPath && nextRepositories.some((repository) => repository.relativePath === currentPath)
      ? currentPath
      : nextRepositories[0]?.relativePath ?? null
    setActiveRepositoryPath(nextPath)
    setRepositoriesLoading(false)
    return nextPath
  }, [setActiveRepositoryPath, sourceControlRepositoryPathsKey, workspaceId])

  const refresh = useCallback(async ({ preserveActionError = false }: SourceControlRefreshOptions = {}) => {
    if (activeWorkspaceRef.current !== workspaceId) return
    const repositoryPath = activeRepositoryPathRef.current
    if (!repositoryPath) {
      setLoading(false)
      setStatus(null)
      setHistory(null)
      statusWorkspaceRef.current = null
      statusRepositoryRef.current = null
      return
    }
    setLoading(true)
    if (!preserveActionError) setActionError(null)
    const refreshVersion = refreshVersionRef.current + 1
    refreshVersionRef.current = refreshVersion
    const [statusResult, historyResult] = await Promise.allSettled([
      Promise.resolve().then(() => window.electron.git.status(workspaceId, repositoryPath)),
      Promise.resolve().then(() => window.electron.git.history(workspaceId, repositoryPath)),
    ])
    if (refreshVersion !== refreshVersionRef.current || activeWorkspaceRef.current !== workspaceId || activeRepositoryPathRef.current !== repositoryPath) return

    if (statusResult.status === 'fulfilled') {
      statusWorkspaceRef.current = workspaceId
      statusRepositoryRef.current = repositoryPath
      setStatus(statusResult.value)
    } else {
      statusWorkspaceRef.current = workspaceId
      statusRepositoryRef.current = repositoryPath
      setStatus({ isRepository: false, branch: null, ahead: 0, behind: 0, staged: [], unstaged: [], error: errorMessage(statusResult.reason) })
    }

    if (historyResult.status === 'fulfilled') {
      const nextHistory = historyResult.value
      setHistory(nextHistory)
      if (statusResult.status === 'fulfilled' && statusResult.value.isRepository && !nextHistory.error && (historyLoadedWorkspaceRef.current !== workspaceId || historyLoadedRepositoryRef.current !== repositoryPath) && !manualCommitsToggleRef.current.has(workspaceId)) {
        historyLoadedWorkspaceRef.current = workspaceId
        historyLoadedRepositoryRef.current = repositoryPath
        setCommitsExpanded(nextHistory.outgoing.length > 0)
      }
    } else {
      setHistory({ outgoing: [], upstream: [], local: [], error: historyErrorMessage(historyResult.reason) })
    }
    setLoading(false)
  }, [workspaceId])

  useEffect(() => {
    refreshVersionRef.current += 1
    repositoryLoadVersionRef.current += 1
    historyLoadedWorkspaceRef.current = null
    historyLoadedRepositoryRef.current = null
    statusWorkspaceRef.current = null
    statusRepositoryRef.current = null
    setRepositories([])
    setRepositoriesLoading(true)
    setActiveRepositoryPath(null)
    setStatus(null)
    setHistory(null)
    setCommitsExpanded(manualCommitsToggleRef.current.get(workspaceId) ?? false)
    setLoading(true)
    setActionError(null)
    setActionPending(false)
    setCommitMessage('')
    setRetryAction(null)
  }, [setActiveRepositoryPath, workspaceId])

  useEffect(() => {
    void loadRepositories()
  }, [loadRepositories, sourceControlRepositoryPathsKey])

  useEffect(() => {
    if (!activeRepositoryPath) return

    refreshVersionRef.current += 1
    historyLoadedRepositoryRef.current = null
    statusWorkspaceRef.current = null
    statusRepositoryRef.current = null
    setLoading(true)
    setStatus(null)
    setHistory(null)
    setActionError(null)
    setRetryAction(null)
    void refresh()
  }, [activeRepositoryPath, refresh])

  const handleRefresh = useCallback(async () => {
    const currentPath = activeRepositoryPathRef.current
    const nextPath = await loadRepositories()
    if (nextPath && nextPath === currentPath && activeWorkspaceRef.current === workspaceId) await refresh()
  }, [loadRepositories, refresh, workspaceId])

  const runAction = useCallback(async (action: SourceControlAction): Promise<boolean> => {
    const actionWorkspaceId = workspaceId
    const actionRepositoryPath = activeRepositoryPathRef.current
    if (activeWorkspaceRef.current !== actionWorkspaceId || !actionRepositoryPath) return false
    setActionError(null)
    setRetryAction(null)
    setActionPending(true)
    let mutationFailed = false
    let mutationError: unknown
    try {
      if (action.type === 'toggle') {
        if (action.staged) await window.electron.git.unstage(workspaceId, actionRepositoryPath, action.change.path, action.change.originalPath)
        else await window.electron.git.stage(workspaceId, actionRepositoryPath, action.change.path, action.change.originalPath)
      } else if (action.type === 'commit') {
        await window.electron.git.commit(workspaceId, actionRepositoryPath, action.message)
      } else {
        await window.electron.git.sync(workspaceId, actionRepositoryPath)
      }
    } catch (error) {
      mutationFailed = true
      mutationError = error
    }

    if (activeWorkspaceRef.current === actionWorkspaceId && activeRepositoryPathRef.current === actionRepositoryPath) {
      if (mutationFailed) {
        setActionError({ workspaceId: actionWorkspaceId, repositoryPath: actionRepositoryPath, message: errorMessage(mutationError) })
        setRetryAction({ workspaceId: actionWorkspaceId, repositoryPath: actionRepositoryPath, action })
      }
      await refresh({ preserveActionError: mutationFailed })
    }

    if (activeWorkspaceRef.current === actionWorkspaceId && activeRepositoryPathRef.current === actionRepositoryPath) {
      setActionPending(false)
    }
    return !mutationFailed && activeWorkspaceRef.current === actionWorkspaceId && activeRepositoryPathRef.current === actionRepositoryPath
  }, [refresh, workspaceId])

  const handleToggle = useCallback(async (change: GitFileChange, staged: boolean) => {
    if (actionPending) return
    await runAction({ type: 'toggle', change, staged })
  }, [actionPending, runAction])

  const handleCommit = useCallback(async () => {
    const message = commitMessage.trim()
    if (!message || actionPending) return
    if (await runAction({ type: 'commit', message })) setCommitMessage('')
  }, [actionPending, commitMessage, runAction])

  const handleSync = useCallback(async () => {
    if (statusWorkspaceRef.current !== workspaceId || statusRepositoryRef.current !== activeRepositoryPath || !status?.upstream || actionPending) return
    await runAction({ type: 'sync' })
  }, [actionPending, activeRepositoryPath, runAction, status?.upstream, workspaceId])

  const handleRetryAction = useCallback(async () => {
    if (!retryAction || retryAction.workspaceId !== workspaceId || retryAction.repositoryPath !== activeRepositoryPath || actionPending) return
    if (await runAction(retryAction.action)) {
      if (retryAction.action.type === 'commit') setCommitMessage('')
    }
  }, [actionPending, activeRepositoryPath, retryAction, runAction, workspaceId])

  const handleCommitsToggle = useCallback(() => {
    if (activeWorkspaceRef.current !== workspaceId) return
    setCommitsExpanded((expanded) => {
      const nextExpanded = !expanded
      manualCommitsToggleRef.current.set(workspaceId, nextExpanded)
      return nextExpanded
    })
  }, [workspaceId])

  const handleViewModeChange = useCallback((viewMode: SourceControlViewMode) => {
    if (viewMode === sourceControlViewMode) return
    const updateWorkspaceId = workspaceId
    void window.electron.workspace.update(updateWorkspaceId, { config: { sourceControlViewMode: viewMode } })
      .then((workspace) => {
        if (activeWorkspaceRef.current !== updateWorkspaceId) return
        if (!workspace) throw new Error('Workspace is unavailable')
        onWorkspaceUpdated(workspace)
      })
      .catch((error: unknown) => {
        if (activeWorkspaceRef.current === updateWorkspaceId) setActionError({ workspaceId: updateWorkspaceId, repositoryPath: activeRepositoryPathRef.current, message: errorMessage(error) })
      })
  }, [onWorkspaceUpdated, sourceControlViewMode, workspaceId])

  const currentStatus = statusWorkspaceRef.current === workspaceId && statusRepositoryRef.current === activeRepositoryPath ? status : null
  const currentActionError = actionError?.workspaceId === workspaceId && actionError.repositoryPath === activeRepositoryPath ? actionError.message : null
  const currentRetryAction = retryAction?.workspaceId === workspaceId && retryAction.repositoryPath === activeRepositoryPath ? retryAction.action : null
  const branch = currentStatus?.branch ?? 'No branch'
  const canOpenOrigin = Boolean(currentStatus?.originUrl)
  const canCommit = Boolean(currentStatus?.staged.length) && Boolean(commitMessage.trim())

  return (
    <div className="flex h-full min-h-0 flex-col">
      {repositoriesLoading ? <div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-sm text-text-disabled">Loading source control…</div> : repositories.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 text-sm text-text-secondary">
          <p>{t('workspace.noRepositoriesConfigured')}</p>
          <button className="mt-3 inline-flex items-center gap-1.5 text-sm text-text-display hover:underline" onClick={() => onOpenWorkspaceSettings('sourceControl')}>
            <GitBranch size={14} /> {t('workspace.configureSourceControl')}
          </button>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2">
            {repositories.length > 1 && (
              <label className="min-w-0 max-w-[45%]">
                <span className="sr-only">{t('workspace.repository')}</span>
                <select
                  id="source-control-repository"
                  className="h-7 max-w-full rounded border border-border-visible bg-bg-primary px-2 text-xs text-text-display outline-none disabled:opacity-50"
                  value={activeRepositoryPath ?? ''}
                  onChange={(event) => setActiveRepositoryPath(event.target.value || null)}
                  disabled={loading || actionPending}
                  aria-label={t('workspace.repository')}
                >
                  {repositories.map((repository) => {
                    const hasDuplicateName = repositories.filter((candidate) => candidate.name === repository.name).length > 1
                    return <option key={repository.relativePath} value={repository.relativePath}>{hasDuplicateName ? `${repository.name} — ${repository.relativePath}` : repository.name}</option>
                  })}
                </select>
              </label>
            )}
            <GitBranch size={15} className="shrink-0 text-text-secondary" />
            {canOpenOrigin ? (
              <button
                className="min-w-0 flex-1 truncate text-left text-sm text-text-display hover:underline"
                onClick={() => { void window.electron.shell.openExternal(currentStatus!.originUrl!) }}
                title={currentStatus?.originUrl}
              >
                {branch}
              </button>
            ) : <span className="min-w-0 flex-1 truncate text-sm text-text-display">{branch}</span>}
            <button
              className={`inline-flex h-7 w-7 items-center justify-center rounded ${sourceControlViewMode === 'list' ? 'bg-active-bg text-text-display' : 'text-text-secondary hover:bg-hover-bg hover:text-text-display'}`}
              onClick={() => handleViewModeChange('list')}
              title="List view"
              aria-label="List view"
            >
              <List size={15} />
            </button>
            <button
              className={`inline-flex h-7 w-7 items-center justify-center rounded ${sourceControlViewMode === 'tree' ? 'bg-active-bg text-text-display' : 'text-text-secondary hover:bg-hover-bg hover:text-text-display'}`}
              onClick={() => handleViewModeChange('tree')}
              title="Tree view"
              aria-label="Tree view"
            >
              <TreePine size={15} />
            </button>
            <button
              className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-text-secondary hover:bg-hover-bg hover:text-text-display disabled:opacity-50"
              onClick={() => void handleSync()}
              disabled={!currentStatus?.upstream || actionPending}
              title={currentStatus?.upstream ? `Sync ${currentStatus.upstream}` : 'Sync requires an upstream branch'}
            >
              <Upload size={14} /> Sync
            </button>
            <button className="inline-flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-hover-bg hover:text-text-display disabled:opacity-50" onClick={() => void handleRefresh()} disabled={loading || actionPending} title="Refresh source control" aria-label="Refresh source control">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {loading && !currentStatus ? <div className="px-4 py-3 text-sm text-text-disabled">Loading source control…</div> : currentStatus?.isRepository ? (
              <>
                {currentStatus.upstream && (
                  <div className="border-b border-border px-4 py-2 text-xs text-text-secondary">
                    {currentStatus.upstream}{currentStatus.ahead > 0 ? ` · ${currentStatus.ahead} ahead` : ''}{currentStatus.behind > 0 ? ` · ${currentStatus.behind} behind` : ''}
                  </div>
                )}
                <CommitHistoryAccordion history={history} upstream={currentStatus.upstream} expanded={commitsExpanded} onToggle={handleCommitsToggle} />
                <ChangeSection title="Staged Changes" changes={currentStatus.staged} staged viewMode={sourceControlViewMode} disabled={actionPending} onToggle={handleToggle} />
                <ChangeSection title="Changes" changes={currentStatus.unstaged} staged={false} viewMode={sourceControlViewMode} disabled={actionPending} onToggle={handleToggle} />
              </>
            ) : (
              <div className="px-4 py-4 text-sm text-text-secondary">
                <p>{currentStatus?.error ?? 'This workspace is not a Git repository.'}</p>
                <button className="mt-3 inline-flex items-center gap-1.5 text-sm text-text-display hover:underline" onClick={() => void refresh()}>
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            )}
          </div>
          {currentStatus?.isRepository && (
            <div className="shrink-0 border-t border-border p-3">
              <label htmlFor="source-control-commit-message" className="sr-only">Commit message</label>
              <textarea
                id="source-control-commit-message"
                className="h-16 w-full resize-none rounded border border-border-visible bg-bg-primary px-2 py-1.5 text-sm text-text-display outline-none placeholder:text-text-disabled disabled:opacity-50"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder="Commit message"
                disabled={actionPending}
              />
              <div className="mt-2 flex justify-end">
                <button
                  className="inline-flex h-8 items-center rounded bg-active-bg px-3 text-sm text-text-display hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void handleCommit()}
                  disabled={!canCommit || actionPending}
                >
                  Commit
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {currentActionError && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-2 text-xs text-red-300">
          <span className="min-w-0 flex-1">{currentActionError}</span>
          {currentRetryAction && (
            <button className="shrink-0 text-text-display hover:underline" onClick={() => void handleRetryAction()} disabled={actionPending}>
              Retry operation
            </button>
          )}
        </div>
      )}
    </div>
  )
}
