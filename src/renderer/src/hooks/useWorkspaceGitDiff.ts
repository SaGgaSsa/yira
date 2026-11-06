import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceGitDiffResult } from '@shared/types'

export type WorkspaceGitDiffReader = (workspaceId: string) => Promise<WorkspaceGitDiffResult>

export interface WorkspaceGitDiffRequestController {
  refresh: () => Promise<void>
  invalidate: () => void
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
  let rereadPending = false

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
        if (rereadPending && !disposed) {
          rereadPending = false
          void refresh()
        }
      }
    })()

    return pending
  }

  const invalidate = () => {
    if (disposed) return
    if (pending) {
      rereadPending = true
      return
    }
    void refresh()
  }

  return {
    refresh,
    invalidate,
    dispose: () => {
      disposed = true
    },
  }
}

export interface WorkspaceGitDiffWatchBridge {
  watchWorkspaceDiff: (workspaceId: string) => Promise<void>
  unwatchWorkspaceDiff: (workspaceId: string) => Promise<void>
  onWorkspaceDiffChanged: (callback: (workspaceId: string) => void) => () => void
}

export interface WorkspaceGitDiffChangeHub {
  subscribe: (workspaceId: string, listener: () => void) => () => void
}

interface WorkspaceGitDiffChangeSubscription {
  notify: () => void
}

export function createWorkspaceGitDiffChangeHub(
  bridge: WorkspaceGitDiffWatchBridge,
): WorkspaceGitDiffChangeHub {
  const subscriptionsByWorkspace = new Map<string, Set<WorkspaceGitDiffChangeSubscription>>()
  let removeChangeListener: (() => void) | null = null

  const watch = (workspaceId: string) => {
    try {
      void bridge.watchWorkspaceDiff(workspaceId).catch(() => {})
    } catch {
      // A failed watcher must not stop the indicator from refreshing normally.
    }
  }

  const unwatch = (workspaceId: string) => {
    try {
      void bridge.unwatchWorkspaceDiff(workspaceId).catch(() => {})
    } catch {
      // Ignore unwatch failures for the same reason.
    }
  }

  return {
    subscribe(workspaceId, listener) {
      if (!removeChangeListener) {
        removeChangeListener = bridge.onWorkspaceDiffChanged((changedWorkspaceId) => {
          const subscriptions = subscriptionsByWorkspace.get(changedWorkspaceId)
          if (!subscriptions) return
          for (const subscription of [...subscriptions]) subscription.notify()
        })
      }

      const existingSubscriptions = subscriptionsByWorkspace.get(workspaceId)
      const subscriptions = existingSubscriptions ?? new Set<WorkspaceGitDiffChangeSubscription>()
      if (!existingSubscriptions) subscriptionsByWorkspace.set(workspaceId, subscriptions)
      const firstForWorkspace = subscriptions.size === 0
      const subscription: WorkspaceGitDiffChangeSubscription = {
        notify: () => listener(),
      }
      subscriptions.add(subscription)
      if (firstForWorkspace) watch(workspaceId)

      let released = false
      return () => {
        if (released) return
        released = true
        subscriptions.delete(subscription)
        if (subscriptions.size > 0) return
        subscriptionsByWorkspace.delete(workspaceId)
        unwatch(workspaceId)
        if (subscriptionsByWorkspace.size > 0) return
        removeChangeListener?.()
        removeChangeListener = null
      }
    },
  }
}

let sharedChangeHub: WorkspaceGitDiffChangeHub | null = null
function getWorkspaceGitDiffChangeHub(): WorkspaceGitDiffChangeHub {
  sharedChangeHub ??= createWorkspaceGitDiffChangeHub(window.electron.git)
  return sharedChangeHub
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
    const unsubscribe = getWorkspaceGitDiffChangeHub().subscribe(
      workspaceId,
      () => controller.invalidate(),
    )

    return () => {
      effectActive = false
      unsubscribe()
      controller.dispose()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [configurationKey, configured, workspaceId])

  // The main process reports changes to .git, and unstaged edits do not touch
  // .git, so the active workspace also reads again when it becomes active and
  // when the window regains focus.
  useEffect(() => {
    if (active) void controllerRef.current?.refresh()
  }, [active])

  useEffect(() => {
    if (!active) return undefined
    const handleWindowFocus = () => {
      void controllerRef.current?.refresh()
    }
    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
  }, [active])

  return configured && snapshot.key === configurationKey ? snapshot.result : null
}
