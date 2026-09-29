import React, { useCallback, useEffect, useRef, useState } from 'react'
import { GitBranch, List, ListFilter, RefreshCw, TreePine } from 'lucide-react'
import type { GitCommitHistoryResult, GitFileChange, GitRepository, GitStatusResult, SourceControlViewMode, Workspace } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { SourceControlRepositorySection, type RepositoryAction } from './SourceControlRepositorySection'

interface WorkspaceSourceControlProps {
  workspaceId: string
  sourceControlRepositoryPaths: string[]
  sourceControlViewMode: SourceControlViewMode
  onWorkspaceUpdated: (workspace: Workspace) => void
  onOpenWorkspaceSettings: (initialTab?: 'sourceControl') => void
  onOpenDiff: (repositoryPath: string, change: GitFileChange, staged: boolean) => void
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function historyErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function repositoryNameFromPath(relativePath: string): string {
  const segments = relativePath.split('/').filter((segment) => segment && segment !== '.' && segment !== '..')
  return segments.at(-1) ?? '.'
}

function sortRepositories(repositories: GitRepository[]): GitRepository[] {
  return [...repositories].sort((left, right) => left.name.localeCompare(right.name) || left.relativePath.localeCompare(right.relativePath))
}

function emptyStatus(error: unknown, fallback: string): GitStatusResult {
  return {
    isRepository: false,
    branch: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    error: errorMessage(error, fallback),
  }
}

export function WorkspaceSourceControl({
  workspaceId,
  sourceControlRepositoryPaths,
  sourceControlViewMode,
  onWorkspaceUpdated,
  onOpenWorkspaceSettings,
  onOpenDiff,
}: WorkspaceSourceControlProps): React.ReactElement {
  const { t } = useTranslation()
  const [repositories, setRepositories] = useState<GitRepository[]>([])
  const [repositoriesLoading, setRepositoriesLoading] = useState(true)
  const [statuses, setStatuses] = useState<Record<string, GitStatusResult | undefined>>({})
  const [statusLoading, setStatusLoading] = useState<Record<string, boolean>>({})
  const [statusRefreshing, setStatusRefreshing] = useState(false)
  const [histories, setHistories] = useState<Record<string, GitCommitHistoryResult | undefined>>({})
  const [expandedRepositories, setExpandedRepositories] = useState<Record<string, boolean>>({})
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [pendingActions, setPendingActions] = useState<Record<string, string | undefined>>({})
  const [actionErrors, setActionErrors] = useState<Record<string, string | undefined>>({})
  const [retryActions, setRetryActions] = useState<Record<string, RepositoryAction | undefined>>({})
  const [commitMessages, setCommitMessages] = useState<Record<string, string | undefined>>({})
  const [expandedCommitAccordions, setExpandedCommitAccordions] = useState<Record<string, boolean>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)

  const workspaceRef = useRef(workspaceId)
  const repositoryLoadVersionRef = useRef(0)
  const globalRefreshVersionRef = useRef(0)
  const repositoryStatusVersionsRef = useRef<Record<string, number>>({})
  const pendingActionsRef = useRef(new Set<string>())
  const historyLoadingPathsRef = useRef(new Set<string>())
  const historyLoadedPathsRef = useRef(new Set<string>())
  const manuallyToggledCommitsRef = useRef(new Set<string>())
  const repositoryPathsKey = sourceControlRepositoryPaths.join('\u0000')
  workspaceRef.current = workspaceId

  const refreshRepositoryStatus = useCallback(async (repository: GitRepository): Promise<void> => {
    const requestWorkspaceId = workspaceId
    const repositoryPath = repository.relativePath
    const nextVersion = (repositoryStatusVersionsRef.current[repositoryPath] ?? 0) + 1
    repositoryStatusVersionsRef.current[repositoryPath] = nextVersion
    setStatusLoading((current) => ({ ...current, [repositoryPath]: true }))

    let nextStatus: GitStatusResult
    try {
      nextStatus = await window.electron.git.status(requestWorkspaceId, repositoryPath)
    } catch (error) {
      nextStatus = emptyStatus(error, t('sourceControl.loadStatusError'))
    }

    if (workspaceRef.current !== requestWorkspaceId
      || repositoryStatusVersionsRef.current[repositoryPath] !== nextVersion) return

    setStatuses((current) => ({ ...current, [repositoryPath]: nextStatus }))
    setStatusLoading((current) => ({ ...current, [repositoryPath]: false }))
  }, [t, workspaceId])

  const refreshAllStatuses = useCallback(async (targets: GitRepository[]) => {
    const requestWorkspaceId = workspaceId
    const refreshVersion = globalRefreshVersionRef.current + 1
    globalRefreshVersionRef.current = refreshVersion
    setStatusRefreshing(true)

    await Promise.all(targets.map((repository) => refreshRepositoryStatus(repository)))

    if (workspaceRef.current === requestWorkspaceId
      && globalRefreshVersionRef.current === refreshVersion) {
      setStatusRefreshing(false)
    }
  }, [refreshRepositoryStatus, workspaceId])

  const loadRepositories = useCallback(async () => {
    const requestWorkspaceId = workspaceId
    const loadVersion = repositoryLoadVersionRef.current + 1
    repositoryLoadVersionRef.current = loadVersion
    setRepositoriesLoading(true)

    let discoveredRepositories: GitRepository[] = []
    try {
      const result = await window.electron.git.discoverRepositories(requestWorkspaceId)
      discoveredRepositories = Array.isArray(result) ? result : []
    } catch {
      // Keep configured repository paths available with fallback names.
    }

    if (workspaceRef.current !== requestWorkspaceId
      || repositoryLoadVersionRef.current !== loadVersion) return

    const discoveredByPath = new Map(discoveredRepositories.map((repository) => [repository.relativePath, repository]))
    const configuredRepositoryPaths = repositoryPathsKey.split('\u0000').filter((path) => path.length > 0)
    const configuredRepositories = configuredRepositoryPaths
      .map((relativePath) => discoveredByPath.get(relativePath) ?? {
        relativePath,
        name: repositoryNameFromPath(relativePath),
      })
    const nextRepositories = sortRepositories(configuredRepositories)

    setRepositories(nextRepositories)
    setStatuses({})
    setStatusLoading({})
    const nextRepositoryPaths = new Set(nextRepositories.map((repository) => repository.relativePath))
    setHistories((current) => Object.fromEntries(
      Object.entries(current).filter(([repositoryPath]) => nextRepositoryPaths.has(repositoryPath)),
    ))
    setCommitMessages({})
    setPendingActions({})
    setActionErrors({})
    setRetryActions({})
    setRepositoriesLoading(false)
    void refreshAllStatuses(nextRepositories)
  }, [refreshAllStatuses, repositoryPathsKey, workspaceId])

  useEffect(() => {
    void loadRepositories()
  }, [loadRepositories])

  const loadRepositoryHistory = useCallback(async (repositoryPath: string): Promise<void> => {
    if (historyLoadingPathsRef.current.has(repositoryPath)) return

    const requestWorkspaceId = workspaceId
    const wasAlreadyLoaded = historyLoadedPathsRef.current.has(repositoryPath)
    historyLoadingPathsRef.current.add(repositoryPath)
    try {
      const history = await window.electron.git.history(requestWorkspaceId, repositoryPath)
      if (workspaceRef.current !== requestWorkspaceId) return

      historyLoadedPathsRef.current.add(repositoryPath)
      setHistories((current) => ({ ...current, [repositoryPath]: history }))
      const hasOutgoingCommits = history.outgoing.length > 0
      if (!wasAlreadyLoaded
        && hasOutgoingCommits
        && !manuallyToggledCommitsRef.current.has(repositoryPath)) {
        setExpandedCommitAccordions((current) => ({ ...current, [repositoryPath]: true }))
      }
    } catch (error) {
      if (workspaceRef.current === requestWorkspaceId) {
        historyLoadedPathsRef.current.add(repositoryPath)
        setHistories((current) => ({
          ...current,
          [repositoryPath]: { outgoing: [], upstream: [], local: [], error: historyErrorMessage(error, t('sourceControl.loadHistoryErrorFallback')) },
        }))
      }
    } finally {
      historyLoadingPathsRef.current.delete(repositoryPath)
    }
  }, [t, workspaceId])

  useEffect(() => {
    repositories.forEach((repository) => {
      const repositoryPath = repository.relativePath
      const repositoryStatus = statuses[repositoryPath]
      const hasChanges = Boolean(repositoryStatus?.staged.length || repositoryStatus?.unstaged.length)
      const hasError = Boolean(repositoryStatus?.error)
      const isExpanded = repositories.length === 1
        || (expandedRepositories[repositoryPath] ?? (hasChanges || hasError))

      if (isExpanded && repositoryStatus?.isRepository && histories[repositoryPath] === undefined) {
        void loadRepositoryHistory(repositoryPath)
      }
    })
  }, [expandedRepositories, histories, loadRepositoryHistory, repositories, statuses])

  const handleRepositoryAction = useCallback(async (
    repositoryPath: string,
    repositoryAction: RepositoryAction,
  ): Promise<void> => {
    const requestWorkspaceId = workspaceId
    const actionKey = `${requestWorkspaceId}\u0000${repositoryPath}`
    if (workspaceRef.current !== requestWorkspaceId || pendingActionsRef.current.has(actionKey)) return

    pendingActionsRef.current.add(actionKey)
    setPendingActions((current) => ({ ...current, [repositoryPath]: repositoryAction.type }))
    setActionErrors((current) => ({ ...current, [repositoryPath]: undefined }))

    try {
      if (repositoryAction.type === 'toggle') {
        if (repositoryAction.staged) {
          await window.electron.git.unstage(requestWorkspaceId, repositoryPath, repositoryAction.change.path, repositoryAction.change.originalPath)
        } else {
          await window.electron.git.stage(requestWorkspaceId, repositoryPath, repositoryAction.change.path, repositoryAction.change.originalPath)
        }
      } else if (repositoryAction.type === 'commit') {
        await window.electron.git.commit(requestWorkspaceId, repositoryPath, repositoryAction.message)
      } else {
        await window.electron.git[repositoryAction.type](requestWorkspaceId, repositoryPath)
      }

      if (workspaceRef.current !== requestWorkspaceId) return
      const repository = repositories.find((candidate) => candidate.relativePath === repositoryPath)
      if (repository) await refreshRepositoryStatus(repository)

      if ((repositoryAction.type === 'commit' || repositoryAction.type === 'sync')
        && historyLoadedPathsRef.current.has(repositoryPath)) {
        historyLoadedPathsRef.current.delete(repositoryPath)
        setHistories((current) => ({ ...current, [repositoryPath]: undefined }))
        await loadRepositoryHistory(repositoryPath)
      }
      if (repositoryAction.type === 'commit') {
        setCommitMessages((current) => ({ ...current, [repositoryPath]: '' }))
      }
      setRetryActions((current) => ({ ...current, [repositoryPath]: undefined }))
    } catch (error) {
      if (workspaceRef.current === requestWorkspaceId) {
        setActionErrors((current) => ({ ...current, [repositoryPath]: errorMessage(error, t('sourceControl.loadStatusError')) }))
        setRetryActions((current) => ({ ...current, [repositoryPath]: repositoryAction }))
      }
    } finally {
      pendingActionsRef.current.delete(actionKey)
      if (workspaceRef.current === requestWorkspaceId) {
        setPendingActions((current) => ({ ...current, [repositoryPath]: undefined }))
      }
    }
  }, [loadRepositoryHistory, refreshRepositoryStatus, repositories, t, workspaceId])

  const handleViewModeChange = useCallback((viewMode: SourceControlViewMode) => {
    if (viewMode === sourceControlViewMode) return

    const requestWorkspaceId = workspaceId
    void window.electron.workspace.update(requestWorkspaceId, { config: { sourceControlViewMode: viewMode } })
      .then((workspace) => {
        if (workspaceRef.current !== requestWorkspaceId) return
        if (!workspace) throw new Error('Workspace is unavailable')
        onWorkspaceUpdated(workspace)
        setGlobalError(null)
      })
      .catch((error: unknown) => {
        if (workspaceRef.current === requestWorkspaceId) setGlobalError(errorMessage(error, t('sourceControl.loadStatusError')))
      })
  }, [onWorkspaceUpdated, sourceControlViewMode, t, workspaceId])

  const handleCommitsToggle = useCallback((repositoryPath: string) => {
    manuallyToggledCommitsRef.current.add(repositoryPath)
    setExpandedCommitAccordions((current) => ({
      ...current,
      [repositoryPath]: !(current[repositoryPath] ?? false),
    }))
  }, [])

  const handleCommitMessageChange = useCallback((repositoryPath: string, message: string) => {
    setCommitMessages((current) => ({ ...current, [repositoryPath]: message }))
  }, [])

  const isRepositoryChanged = (repositoryStatus: GitStatusResult | undefined): boolean => Boolean(
    repositoryStatus?.error || repositoryStatus?.staged.length || repositoryStatus?.unstaged.length,
  )
  const orderedRepositories = [...repositories].sort((left, right) => {
    const leftChanged = isRepositoryChanged(statuses[left.relativePath])
    const rightChanged = isRepositoryChanged(statuses[right.relativePath])
    return Number(rightChanged) - Number(leftChanged)
      || left.name.localeCompare(right.name)
      || left.relativePath.localeCompare(right.relativePath)
  })
  const visibleRepositories = onlyChanged
    ? orderedRepositories.filter((repository) => isRepositoryChanged(statuses[repository.relativePath]))
    : orderedRepositories
  const changedRepositoryCount = repositories.filter((repository) => isRepositoryChanged(statuses[repository.relativePath])).length

  if (repositoriesLoading) {
    return <div className="px-4 py-3 text-sm text-text-disabled">{t('sourceControl.loadingSourceControl')}</div>
  }

  if (repositories.length === 0) {
    return (
      <div className="px-4 py-4 text-sm text-text-secondary">
        <p>{t('workspace.noRepositoriesConfigured')}</p>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-text-display hover:underline"
          onClick={() => onOpenWorkspaceSettings('sourceControl')}
        >
          <GitBranch size={14} /> {t('workspace.configureSourceControl')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 text-xs text-text-display">
          {t('sourceControl.repositoriesSummary', { count: repositories.length, changed: changedRepositoryCount })}
        </span>
        <button
          type="button"
          className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs ${onlyChanged ? 'bg-active-bg text-text-display' : 'text-text-secondary hover:bg-hover-bg hover:text-text-display'}`}
          aria-pressed={onlyChanged}
          onClick={() => setOnlyChanged((current) => !current)}
          title={t('sourceControl.onlyChanged')}
        >
          <ListFilter size={14} /> {t('sourceControl.onlyChanged')}
        </button>
        <button
          type="button"
          className={`inline-flex h-7 w-7 items-center justify-center rounded ${sourceControlViewMode === 'list' ? 'bg-active-bg text-text-display' : 'text-text-secondary hover:bg-hover-bg'}`}
          onClick={() => handleViewModeChange('list')}
          title={t('sourceControl.listView')}
          aria-label={t('sourceControl.listView')}
        >
          <List size={15} />
        </button>
        <button
          type="button"
          className={`inline-flex h-7 w-7 items-center justify-center rounded ${sourceControlViewMode === 'tree' ? 'bg-active-bg text-text-display' : 'text-text-secondary hover:bg-hover-bg'}`}
          onClick={() => handleViewModeChange('tree')}
          title={t('sourceControl.treeView')}
          aria-label={t('sourceControl.treeView')}
        >
          <TreePine size={15} />
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-hover-bg hover:text-text-display disabled:opacity-50"
          onClick={() => void refreshAllStatuses(repositories)}
          disabled={statusRefreshing}
          title={t('sourceControl.refreshAll')}
          aria-label={t('sourceControl.refreshAll')}
        >
          <RefreshCw size={15} className={statusRefreshing ? 'animate-spin' : ''} />
          <span className="sr-only">{t('sourceControl.refreshAll')}</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {visibleRepositories.map((repository) => {
          const repositoryPath = repository.relativePath
          const repositoryStatus = statuses[repositoryPath]
          const changeCount = (repositoryStatus?.staged.length ?? 0) + (repositoryStatus?.unstaged.length ?? 0)
          const initialExpansion = Boolean(repositoryStatus?.error || changeCount > 0)
          const isExpanded = repositories.length === 1
            || (expandedRepositories[repositoryPath] ?? initialExpansion)
          const duplicateName = repositories.filter((candidate) => candidate.name === repository.name).length > 1
          const retryAction = retryActions[repositoryPath]

          return (
            <SourceControlRepositorySection
              key={`${workspaceId}:${repositoryPath}`}
              repository={repository}
              duplicateName={duplicateName}
              repositoryStatus={repositoryStatus}
              statusLoading={Boolean(statusLoading[repositoryPath])}
              expanded={isExpanded}
              history={histories[repositoryPath]}
              commitsExpanded={expandedCommitAccordions[repositoryPath] ?? false}
              commitMessage={commitMessages[repositoryPath] ?? ''}
              pendingAction={pendingActions[repositoryPath]}
              actionError={actionErrors[repositoryPath]}
              retryAction={retryAction}
              viewMode={sourceControlViewMode}
              onToggleExpanded={() => {
                if (repositories.length === 1) return
                setExpandedRepositories((current) => ({ ...current, [repositoryPath]: !isExpanded }))
              }}
              onToggleCommits={() => handleCommitsToggle(repositoryPath)}
              onCommitMessageChange={(message) => handleCommitMessageChange(repositoryPath, message)}
              onAction={(action) => { void handleRepositoryAction(repositoryPath, action) }}
              onRetryStatus={() => { void refreshRepositoryStatus(repository) }}
              onRetryAction={() => {
                if (retryAction) void handleRepositoryAction(repositoryPath, retryAction)
              }}
              onOpenDiff={(change, staged) => onOpenDiff(repositoryPath, change, staged)}
            />
          )
        })}
        {onlyChanged && visibleRepositories.length === 0 && (
          <div className="px-4 py-4 text-sm text-text-disabled">{t('sourceControl.noChangedRepositories')}</div>
        )}
      </div>
      {globalError && (
        <div className="border-t border-border px-3 py-2 text-xs text-red-300">{globalError}</div>
      )}
    </div>
  )
}
