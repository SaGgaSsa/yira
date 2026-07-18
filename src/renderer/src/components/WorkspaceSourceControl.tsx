import React, { useCallback, useEffect, useState } from 'react'
import { ChevronDown, File, Folder, GitBranch, List, RefreshCw, SquarePlus, SquareMinus, TreePine, Upload } from 'lucide-react'
import type { GitFileChange, GitStatusResult, SourceControlViewMode, Workspace } from '@shared/types'
import { buildSourceControlTree, type SourceControlTreeNode } from '@/utils/sourceControlTree'

interface WorkspaceSourceControlProps {
  workspaceId: string
  sourceControlViewMode: SourceControlViewMode
  onWorkspaceUpdated: (workspace: Workspace) => void
}

type SourceControlAction =
  | { type: 'toggle'; change: GitFileChange; staged: boolean }
  | { type: 'commit'; message: string }
  | { type: 'sync' }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load source control status'
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

export function WorkspaceSourceControl({ workspaceId, sourceControlViewMode, onWorkspaceUpdated }: WorkspaceSourceControlProps): React.ReactElement {
  const [status, setStatus] = useState<GitStatusResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [retryAction, setRetryAction] = useState<SourceControlAction | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setActionError(null)
    try {
      setStatus(await window.electron.git.status(workspaceId))
    } catch (error) {
      setStatus({ isRepository: false, branch: null, ahead: 0, behind: 0, staged: [], unstaged: [], error: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runAction = useCallback(async (action: SourceControlAction): Promise<boolean> => {
    setActionError(null)
    setRetryAction(null)
    setActionPending(true)
    try {
      if (action.type === 'toggle') {
        if (action.staged) await window.electron.git.unstage(workspaceId, action.change.path, action.change.originalPath)
        else await window.electron.git.stage(workspaceId, action.change.path, action.change.originalPath)
      } else if (action.type === 'commit') {
        await window.electron.git.commit(workspaceId, action.message)
      } else {
        await window.electron.git.sync(workspaceId)
      }
      await refresh()
      return true
    } catch (error) {
      setActionError(errorMessage(error))
      setRetryAction(action)
      return false
    } finally {
      setActionPending(false)
    }
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
    if (!status?.upstream || actionPending) return
    await runAction({ type: 'sync' })
  }, [actionPending, runAction, status?.upstream])

  const handleRetryAction = useCallback(async () => {
    if (!retryAction || actionPending) return
    if (await runAction(retryAction)) {
      if (retryAction.type === 'commit') setCommitMessage('')
    }
  }, [actionPending, retryAction, runAction])

  const handleViewModeChange = useCallback((viewMode: SourceControlViewMode) => {
    if (viewMode === sourceControlViewMode) return
    void window.electron.workspace.update(workspaceId, { config: { sourceControlViewMode: viewMode } })
      .then((workspace) => {
        if (!workspace) throw new Error('Workspace is unavailable')
        onWorkspaceUpdated(workspace)
      })
      .catch((error: unknown) => setActionError(errorMessage(error)))
  }, [onWorkspaceUpdated, sourceControlViewMode, workspaceId])

  const branch = status?.branch ?? 'No branch'
  const canOpenOrigin = Boolean(status?.originUrl)
  const canCommit = Boolean(status?.staged.length) && Boolean(commitMessage.trim())

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2">
        <GitBranch size={15} className="shrink-0 text-text-secondary" />
        {canOpenOrigin ? (
          <button
            className="min-w-0 flex-1 truncate text-left text-sm text-text-display hover:underline"
            onClick={() => { void window.electron.shell.openExternal(status!.originUrl!) }}
            title={status?.originUrl}
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
          disabled={!status?.upstream || actionPending}
          title={status?.upstream ? `Sync ${status.upstream}` : 'Sync requires an upstream branch'}
        >
          <Upload size={14} /> Sync
        </button>
        <button className="inline-flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-hover-bg hover:text-text-display disabled:opacity-50" onClick={() => void refresh()} disabled={loading || actionPending} title="Refresh source control" aria-label="Refresh source control">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading && !status ? <div className="px-4 py-3 text-sm text-text-disabled">Loading source control…</div> : status?.isRepository ? (
          <>
            {status.upstream && (
              <div className="border-b border-border px-4 py-2 text-xs text-text-secondary">
                {status.upstream}{status.ahead > 0 ? ` · ${status.ahead} ahead` : ''}{status.behind > 0 ? ` · ${status.behind} behind` : ''}
              </div>
            )}
            <ChangeSection title="Staged Changes" changes={status.staged} staged viewMode={sourceControlViewMode} disabled={actionPending} onToggle={handleToggle} />
            <ChangeSection title="Changes" changes={status.unstaged} staged={false} viewMode={sourceControlViewMode} disabled={actionPending} onToggle={handleToggle} />
          </>
        ) : (
          <div className="px-4 py-4 text-sm text-text-secondary">
            <p>{status?.error ?? 'This workspace is not a Git repository.'}</p>
            <button className="mt-3 inline-flex items-center gap-1.5 text-sm text-text-display hover:underline" onClick={() => void refresh()}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}
      </div>
      {status?.isRepository && (
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
      {actionError && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-2 text-xs text-red-300">
          <span className="min-w-0 flex-1">{actionError}</span>
          {retryAction && (
            <button className="shrink-0 text-text-display hover:underline" onClick={() => void handleRetryAction()} disabled={actionPending}>
              Retry operation
            </button>
          )}
        </div>
      )}
    </div>
  )
}
