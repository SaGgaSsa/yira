import { useEffect, useMemo, useState } from 'react'
import type { WorkspaceGitDiffResult } from '@shared/types'

export type WorkspaceGitDiffReader = (workspaceId: string) => Promise<WorkspaceGitDiffResult>

export interface WorkspaceGitDiffRequestController {
  refresh: () => Promise<void>
  dispose: () => void
}

interface WorkspaceGitDiffRequestControllerOptions {
  workspaceId: string
  read: WorkspaceGitDiffReader
  onResult: (result: WorkspaceGitDiffResult) => void
}

export const WORKSPACE_GIT_DIFF_REFRESH_INTERVAL_MS = 10_000

export function canReadWorkspaceGitDiff(
  rootFolderPath: string | undefined,
): boolean {
  return Boolean(rootFolderPath?.trim())
}

export function createWorkspaceGitDiffRequestController({
  workspaceId,
  read,
  onResult,
}: WorkspaceGitDiffRequestControllerOptions): WorkspaceGitDiffRequestController {
  let disposed = false
  let pending: Promise<void> | null = null

  const refresh = (): Promise<void> => {
    if (disposed) return Promise.resolve()
    if (pending) return pending

    pending = (async () => {
      try {
        const result = await Promise.resolve().then(() => read(workspaceId))
        if (!disposed) onResult(result)
      } catch {
        if (!disposed) {
          onResult({ additions: 0, deletions: 0, available: false })
        }
      } finally {
        pending = null
      }
    })()

    return pending
  }

  return {
    refresh,
    dispose: () => {
      disposed = true
    },
  }
}

function readWorkspaceGitDiff(workspaceId: string): Promise<WorkspaceGitDiffResult> {
  return window.electron.git.workspaceDiff(workspaceId)
}

export interface UseWorkspaceGitDiffOptions {
  workspaceId: string
  rootFolderPath?: string
  sourceControlRepositoryPaths?: readonly string[]
  refreshIntervalMs?: number
}

export function useWorkspaceGitDiff({
  workspaceId,
  rootFolderPath,
  sourceControlRepositoryPaths,
  refreshIntervalMs = WORKSPACE_GIT_DIFF_REFRESH_INTERVAL_MS,
}: UseWorkspaceGitDiffOptions): WorkspaceGitDiffResult | null {
  const normalizedRootFolderPath = rootFolderPath?.trim() ?? ''
  const repositoryPathsKey = useMemo(
    () => (sourceControlRepositoryPaths ?? [])
      .map((repositoryPath) => repositoryPath.trim())
      .filter(Boolean)
      .join('\u0000'),
    [sourceControlRepositoryPaths],
  )
  const configurationKey = `${workspaceId}\u0000${normalizedRootFolderPath}\u0000${repositoryPathsKey}`
  const configured = canReadWorkspaceGitDiff(normalizedRootFolderPath)
  const [snapshot, setSnapshot] = useState<{ key: string; result: WorkspaceGitDiffResult | null }>({
    key: '',
    result: null,
  })

  useEffect(() => {
    if (!configured) {
      setSnapshot({ key: configurationKey, result: null })
      return undefined
    }

    let effectActive = true
    setSnapshot({ key: configurationKey, result: null })
    const controller = createWorkspaceGitDiffRequestController({
      workspaceId,
      read: readWorkspaceGitDiff,
      onResult: (result) => {
        if (!effectActive) return
        setSnapshot((current) => current.key === configurationKey
          ? { key: configurationKey, result }
          : current)
      },
    })
    const refresh = (): void => {
      void controller.refresh()
    }

    refresh()
    const interval = window.setInterval(refresh, refreshIntervalMs)
    const handleWindowFocus = (): void => refresh()
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      effectActive = false
      controller.dispose()
      window.clearInterval(interval)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [configurationKey, configured, refreshIntervalMs, workspaceId])

  return configured && snapshot.key === configurationKey ? snapshot.result : null
}
