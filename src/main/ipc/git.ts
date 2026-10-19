import { ipcMain } from 'electron'
import type { GitBranchListResult, GitCommitFilesResult, GitCommitHistoryResult, GitFileChange, GitFileDiffContent, GitRepository, GitStashEntry, GitStatusResult, WorkspaceGitDiffResult } from '@shared/types'
import { getGitCommitFileDiffContent, getGitDiffSummary, getGitFileDiffContent } from '../git/diff'
import { discoverGitRepositories, resolveConfiguredGitRepository } from '../git/repositories'
import { abortGitOperation, commitGitChanges, continueGitOperation, createGitBranch, checkoutGitBranch, discardGitChanges, type GitDiscardPaths, fetchGitRepository, findGitBranchStash, getGitCommitFiles, getGitCommitHistory, getGitStatus, listGitBranches, mergeGitBranch, popGitStash, publishGitBranch, pullGitRepository, pushGitRepository, rebaseGitBranch, stageGitFiles, stashGitChangesForBranch, syncGitRepository, unstageGitFiles } from '../git/runner'
import { getWorkspaceGitConfigById } from './workspace'

interface WorkspaceGitConfig {
  rootPath: string
  configuredRepositoryPaths: string[]
}

const WORKSPACE_DIFF_CACHE_TTL_MS = 5_000

interface WorkspaceDiffCacheEntry {
  expiresAt: number
  result: Promise<WorkspaceGitDiffResult>
}

export interface WorkspaceDiffCache {
  get(key: string): Promise<WorkspaceGitDiffResult> | undefined
  set(key: string, result: Promise<WorkspaceGitDiffResult>): Promise<WorkspaceGitDiffResult>
  clear(): void
}

export function createWorkspaceDiffCache(
  ttlMs = WORKSPACE_DIFF_CACHE_TTL_MS,
  now: () => number = Date.now,
): WorkspaceDiffCache {
  const entries = new Map<string, WorkspaceDiffCacheEntry>()
  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expiresAt <= now()) {
        entries.delete(key)
        return undefined
      }
      return entry.result
    },
    set(key, result) {
      const entry = { expiresAt: now() + ttlMs, result }
      entries.set(key, entry)
      // Do not keep a failed read cached for the whole TTL.
      void result.catch(() => {
        if (entries.get(key) === entry) entries.delete(key)
      })
      return result
    },
    clear() {
      entries.clear()
    },
  }
}

function mutationPaths(relativePath: string, originalPath?: string): string[] {
  if (typeof relativePath !== 'string') throw new Error('Path must be a string')
  if (originalPath !== undefined && typeof originalPath !== 'string') throw new Error('Original path must be a string')
  return originalPath && originalPath !== relativePath ? [relativePath, originalPath] : [relativePath]
}

function changePaths(changes: GitFileChange[]): string[] {
  if (!Array.isArray(changes) || changes.length === 0) throw new Error('At least one change is required')
  return changes.flatMap((change) => {
    if (!change || typeof change !== 'object') throw new Error('Change must be an object')
    return mutationPaths(change.path, change.originalPath)
  })
}

function discardPaths(changes: GitFileChange[]): GitDiscardPaths {
  if (!Array.isArray(changes) || changes.length === 0) throw new Error('At least one change is required')
  const trackedPaths: string[] = []
  const untrackedPaths: string[] = []
  for (const change of changes) {
    if (!change || typeof change !== 'object') throw new Error('Change must be an object')
    const paths = mutationPaths(change.path, change.originalPath)
    if (change.status === 'untracked') untrackedPaths.push(...paths)
    else trackedPaths.push(...paths)
  }
  return { trackedPaths, untrackedPaths }
}

function safeGitError(error: unknown): string {
  const message = typeof error === 'string'
    ? error.trim()
    : error instanceof Error
      ? error.message.trim()
      : ''
  if (!message || message.includes('/') || message.includes('\\') || /^[a-zA-Z]:/.test(message)) {
    return 'Workspace root folder is unavailable'
  }
  return message
}

export interface GitIPCDependencies {
  getWorkspaceGitConfigById: typeof getWorkspaceGitConfigById
  discoverGitRepositories: typeof discoverGitRepositories
  resolveConfiguredGitRepository: typeof resolveConfiguredGitRepository
  getGitStatus: typeof getGitStatus
  getGitCommitHistory: typeof getGitCommitHistory
  getGitDiffSummary: typeof getGitDiffSummary
  workspaceDiffCacheTtlMs?: number
  getGitFileDiffContent?: typeof getGitFileDiffContent
  stageGitFiles: typeof stageGitFiles
  unstageGitFiles: typeof unstageGitFiles
  discardGitChanges?: typeof discardGitChanges
  commitGitChanges: typeof commitGitChanges
  fetchGitRepository: typeof fetchGitRepository
  pullGitRepository: typeof pullGitRepository
  pushGitRepository: typeof pushGitRepository
  syncGitRepository: typeof syncGitRepository
  listGitBranches?: typeof listGitBranches
  checkoutGitBranch?: typeof checkoutGitBranch
  createGitBranch?: typeof createGitBranch
  stashGitChangesForBranch?: typeof stashGitChangesForBranch
  findGitBranchStash?: typeof findGitBranchStash
  popGitStash?: typeof popGitStash
  publishGitBranch?: typeof publishGitBranch
  getGitCommitFiles?: typeof getGitCommitFiles
  getGitCommitFileDiffContent?: typeof getGitCommitFileDiffContent
  mergeGitBranch?: typeof mergeGitBranch
  rebaseGitBranch?: typeof rebaseGitBranch
  abortGitOperation?: typeof abortGitOperation
  continueGitOperation?: typeof continueGitOperation
}

type GitIPCHandler = (...args: any[]) => unknown

interface GitIPCMain {
  handle(channel: string, handler: GitIPCHandler): void
}

async function getWorkspaceGitConfigWith(dependencies: GitIPCDependencies, workspaceId: string): Promise<WorkspaceGitConfig> {
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) throw new Error('Workspace is required')

  const workspaceConfig = await dependencies.getWorkspaceGitConfigById(workspaceId)
  if (!workspaceConfig) throw new Error('Workspace is unavailable')
  if (!workspaceConfig.rootFolderPath) throw new Error('Workspace root folder is unavailable')

  return {
    rootPath: workspaceConfig.rootFolderPath,
    configuredRepositoryPaths: workspaceConfig.sourceControlRepositoryPaths,
  }
}

function toSafeRepositories(repositories: Awaited<ReturnType<typeof discoverGitRepositories>>): GitRepository[] {
  return repositories.map(({ relativePath, name }) => ({ relativePath, name }))
}
export function createGitIPCHandlers(dependencies: GitIPCDependencies): Record<string, GitIPCHandler> {
  const getConfig = (workspaceId: string): Promise<WorkspaceGitConfig> => getWorkspaceGitConfigWith(dependencies, workspaceId)
  const resolveRepository = async (workspaceId: string, repositoryPath: string): Promise<string> => {
    const { rootPath, configuredRepositoryPaths } = await getConfig(workspaceId)
    const repository = await dependencies.resolveConfiguredGitRepository(rootPath, configuredRepositoryPaths, repositoryPath)
    return repository.absolutePath
  }

  const unavailableWorkspaceDiff: WorkspaceGitDiffResult = { additions: 0, deletions: 0, available: false }
  const workspaceDiffCache = createWorkspaceDiffCache(dependencies.workspaceDiffCacheTtlMs)
  const invalidateDiffAfter = (operation: GitIPCHandler): GitIPCHandler => async (...args) => {
    try {
      return await operation(...args)
    } finally {
      workspaceDiffCache.clear()
    }
  }
  const computeWorkspaceDiff = async (rootPath: string, configuredRepositoryPaths: string[]): Promise<WorkspaceGitDiffResult> => {
    const discoveredRepositories = await dependencies.discoverGitRepositories(rootPath, 1)
    const repositoryPaths = [...new Set([
      ...configuredRepositoryPaths,
      ...discoveredRepositories.map(({ relativePath }) => relativePath),
    ])]
    if (repositoryPaths.length === 0) return { ...unavailableWorkspaceDiff, repositoryCount: 0 }

    const repositoryRoots: string[] = []
    const seenRepositoryPaths = new Set<string>()
    for (const repositoryPath of repositoryPaths) {
      // Automatic discovery only expands this read. Mutations still require configured paths.
      const repository = await dependencies.resolveConfiguredGitRepository(rootPath, repositoryPaths, repositoryPath)
      const canonicalPath = process.platform === 'win32' ? repository.absolutePath.toLowerCase() : repository.absolutePath
      if (seenRepositoryPaths.has(canonicalPath)) continue
      seenRepositoryPaths.add(canonicalPath)
      repositoryRoots.push(repository.absolutePath)
    }

    const results = await Promise.all(repositoryRoots.map((repositoryRoot) => dependencies.getGitDiffSummary(repositoryRoot)))
    let additions = 0
    let deletions = 0
    for (const result of results) {
      if (!result.available
        || !Number.isSafeInteger(result.additions)
        || !Number.isSafeInteger(result.deletions)
        || result.additions < 0
        || result.deletions < 0) {
        return unavailableWorkspaceDiff
      }
      additions += result.additions
      deletions += result.deletions
      if (!Number.isSafeInteger(additions) || !Number.isSafeInteger(deletions)) return unavailableWorkspaceDiff
    }

    return { additions, deletions, available: true }
  }

  return {
    'git:discoverRepositories': async (_event: unknown, workspaceId: string): Promise<GitRepository[]> =>
      toSafeRepositories(await dependencies.discoverGitRepositories((await getConfig(workspaceId)).rootPath)),
    'git:discoverRepositoriesAtRoot': async (_event: unknown, rootFolderPath: string): Promise<GitRepository[]> =>
      toSafeRepositories(await dependencies.discoverGitRepositories(rootFolderPath)),
    'git:status': async (_event: unknown, workspaceId: string, repositoryPath: string): Promise<GitStatusResult> => {
      try {
        const result = await dependencies.getGitStatus(await resolveRepository(workspaceId, repositoryPath))
        return result.error ? { ...result, error: safeGitError(result.error) } : result
      } catch (error) {
        return { isRepository: false, branch: null, ahead: 0, behind: 0, staged: [], unstaged: [], error: safeGitError(error) }
      }
    },
    'git:history': async (_event: unknown, workspaceId: string, repositoryPath: string): Promise<GitCommitHistoryResult> => {
      try {
        const result = await dependencies.getGitCommitHistory(await resolveRepository(workspaceId, repositoryPath))
        return result.error ? { ...result, error: safeGitError(result.error) } : result
      } catch (error) {
        return { outgoing: [], upstream: [], local: [], error: safeGitError(error) }
      }
    },
    'git:workspaceDiff': async (_event: unknown, workspaceId: string): Promise<WorkspaceGitDiffResult> => {
      try {
        const { rootPath, configuredRepositoryPaths } = await getConfig(workspaceId)
        const cacheKey = JSON.stringify([rootPath, configuredRepositoryPaths])
        const cached = workspaceDiffCache.get(cacheKey)
        if (cached) return await cached

        return await workspaceDiffCache.set(cacheKey, computeWorkspaceDiff(rootPath, configuredRepositoryPaths))
      } catch {
        return unavailableWorkspaceDiff
      }
    },
    'git:fileDiff': async (_event: unknown, workspaceId: string, repositoryPath: string, relativePath: string, staged: boolean, originalPath?: string): Promise<GitFileDiffContent> => {
      try {
        return await (dependencies.getGitFileDiffContent ?? getGitFileDiffContent)(await resolveRepository(workspaceId, repositoryPath), {
          path: relativePath,
          originalPath,
          staged,
        })
      } catch (error) {
        return { original: '', modified: '', error: safeGitError(error) }
      }
    },
    'git:stage': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string, relativePath: string, originalPath?: string) => {
      await dependencies.stageGitFiles(await resolveRepository(workspaceId, repositoryPath), mutationPaths(relativePath, originalPath))
    }),
    'git:unstage': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string, relativePath: string, originalPath?: string) => {
      await dependencies.unstageGitFiles(await resolveRepository(workspaceId, repositoryPath), mutationPaths(relativePath, originalPath))
    }),
    'git:stageChanges': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string, changes: GitFileChange[]) => {
      await dependencies.stageGitFiles(await resolveRepository(workspaceId, repositoryPath), changePaths(changes))
    }),
    'git:unstageChanges': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string, changes: GitFileChange[]) => {
      await dependencies.unstageGitFiles(await resolveRepository(workspaceId, repositoryPath), changePaths(changes))
    }),
    'git:discard': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string, changes: GitFileChange[]) => {
      await (dependencies.discardGitChanges ?? discardGitChanges)(await resolveRepository(workspaceId, repositoryPath), discardPaths(changes))
    }),
    'git:commit': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string, message: string) => {
      await dependencies.commitGitChanges(await resolveRepository(workspaceId, repositoryPath), message)
    }),
    'git:sync': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string) => {
      await dependencies.syncGitRepository(await resolveRepository(workspaceId, repositoryPath))
    }),
    'git:fetch': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string) => {
      await dependencies.fetchGitRepository(await resolveRepository(workspaceId, repositoryPath))
    }),
    'git:pull': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string) => {
      await dependencies.pullGitRepository(await resolveRepository(workspaceId, repositoryPath))
    }),
    'git:push': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string) => {
      await dependencies.pushGitRepository(await resolveRepository(workspaceId, repositoryPath))
    }),
    'git:branches': async (_event: unknown, workspaceId: string, repositoryPath: string): Promise<GitBranchListResult> => {
      try {
        const result = await (dependencies.listGitBranches ?? listGitBranches)(await resolveRepository(workspaceId, repositoryPath))
        return result.error ? { branches: [], error: safeGitError(result.error) } : result
      } catch (error) {
        return { branches: [], error: safeGitError(error) }
      }
    },
    'git:checkout': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string, name: unknown, remote: unknown): Promise<void> => {
      if (typeof name !== 'string') throw new Error('Branch name must be a string')
      if (typeof remote !== 'boolean') throw new Error('Remote flag must be a boolean')
      await (dependencies.checkoutGitBranch ?? checkoutGitBranch)(await resolveRepository(workspaceId, repositoryPath), name, remote)
    }),
    'git:createBranch': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string, name: unknown, startPoint?: unknown): Promise<void> => {
      if (typeof name !== 'string') throw new Error('Branch name must be a string')
      if (startPoint !== undefined && typeof startPoint !== 'string') throw new Error('Start point must be a string')
      await (dependencies.createGitBranch ?? createGitBranch)(await resolveRepository(workspaceId, repositoryPath), name, startPoint as string | undefined)
    }),
    'git:stashForBranch': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string, branch: unknown): Promise<void> => {
      if (typeof branch !== 'string') throw new Error('Branch name must be a string')
      await (dependencies.stashGitChangesForBranch ?? stashGitChangesForBranch)(await resolveRepository(workspaceId, repositoryPath), branch)
    }),
    'git:branchStash': async (_event: unknown, workspaceId: string, repositoryPath: string, branch: unknown): Promise<GitStashEntry | null> => {
      if (typeof branch !== 'string') throw new Error('Branch name must be a string')
      return (dependencies.findGitBranchStash ?? findGitBranchStash)(await resolveRepository(workspaceId, repositoryPath), branch)
    },
    'git:popStash': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string, ref: unknown): Promise<void> => {
      if (typeof ref !== 'string') throw new Error('Stash reference must be a string')
      await (dependencies.popGitStash ?? popGitStash)(await resolveRepository(workspaceId, repositoryPath), ref)
    }),
    'git:publish': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string): Promise<void> => {
      await (dependencies.publishGitBranch ?? publishGitBranch)(await resolveRepository(workspaceId, repositoryPath))
    }),
    'git:commitFiles': async (_event: unknown, workspaceId: string, repositoryPath: string, commit: unknown): Promise<GitCommitFilesResult> => {
      if (typeof commit !== 'string') throw new Error('Commit reference must be a string')
      try {
        const result = await (dependencies.getGitCommitFiles ?? getGitCommitFiles)(await resolveRepository(workspaceId, repositoryPath), commit)
        return result.error ? { ...result, error: safeGitError(result.error) } : result
      } catch (error) {
        return { files: [], error: safeGitError(error) }
      }
    },
    'git:commitFileDiff': async (_event: unknown, workspaceId: string, repositoryPath: string, commit: unknown, relativePath: unknown, originalPath?: unknown): Promise<GitFileDiffContent> => {
      if (typeof commit !== 'string') throw new Error('Commit reference must be a string')
      if (typeof relativePath !== 'string') throw new Error('File path must be a string')
      if (originalPath !== undefined && typeof originalPath !== 'string') throw new Error('Original path must be a string')
      try {
        return await (dependencies.getGitCommitFileDiffContent ?? getGitCommitFileDiffContent)(await resolveRepository(workspaceId, repositoryPath), {
          commit,
          path: relativePath,
          ...(originalPath !== undefined ? { originalPath } : {}),
        })
      } catch (error) {
        return { original: '', modified: '', error: safeGitError(error) }
      }
    },
    'git:merge': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string, name: unknown): Promise<void> => {
      if (typeof name !== 'string') throw new Error('Branch name must be a string')
      await (dependencies.mergeGitBranch ?? mergeGitBranch)(await resolveRepository(workspaceId, repositoryPath), name)
    }),
    'git:rebase': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string, name: unknown): Promise<void> => {
      if (typeof name !== 'string') throw new Error('Branch name must be a string')
      await (dependencies.rebaseGitBranch ?? rebaseGitBranch)(await resolveRepository(workspaceId, repositoryPath), name)
    }),
    'git:abortOperation': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string): Promise<void> => {
      await (dependencies.abortGitOperation ?? abortGitOperation)(await resolveRepository(workspaceId, repositoryPath))
    }),
    'git:continueOperation': invalidateDiffAfter(async (_event: unknown, workspaceId: string, repositoryPath: string): Promise<void> => {
      await (dependencies.continueGitOperation ?? continueGitOperation)(await resolveRepository(workspaceId, repositoryPath))
    }),
  }
}

const defaultGitIPCDependencies: GitIPCDependencies = {
  getWorkspaceGitConfigById,
  discoverGitRepositories,
  resolveConfiguredGitRepository,
  getGitStatus,
  getGitCommitHistory,
  getGitDiffSummary,
  getGitFileDiffContent,
  stageGitFiles,
  unstageGitFiles,
  discardGitChanges,
  commitGitChanges,
  fetchGitRepository,
  pullGitRepository,
  pushGitRepository,
  syncGitRepository,
  listGitBranches,
  checkoutGitBranch,
  createGitBranch,
  stashGitChangesForBranch,
  findGitBranchStash,
  popGitStash,
  publishGitBranch,
  getGitCommitFiles,
  getGitCommitFileDiffContent,
  mergeGitBranch,
  rebaseGitBranch,
  abortGitOperation,
  continueGitOperation,
}

export function registerGitIPC(
  ipcMainInstance: GitIPCMain = ipcMain,
  dependencies: GitIPCDependencies = defaultGitIPCDependencies,
): void {
  const handlers = createGitIPCHandlers(dependencies)
  for (const [channel, handler] of Object.entries(handlers)) ipcMainInstance.handle(channel, handler)
}
