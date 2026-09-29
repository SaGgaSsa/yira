import { useEffect, useMemo, useRef, useState } from 'react'
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
  /** Reads again each time the workspace becomes active. */
  active?: boolean
}

export function useWorkspaceGitDiff({
  workspaceId,
  rootFolderPath,
  sourceControlRepositoryPaths,
  active = false,
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
  const controllerRef = useRef<WorkspaceGitDiffRequestController | null>(null)

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
    controllerRef.current = controller
    void controller.refresh()

    return () => {
      effectActive = false
      controller.dispose()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [configurationKey, configured, workspaceId])

  // Git state changes outside the app, so refresh when the user opens the
  // workspace instead of polling every workspace in the background.
  useEffect(() => {
    if (active) void controllerRef.current?.refresh()
  }, [active])

  return configured && snapshot.key === configurationKey ? snapshot.result : null
}
