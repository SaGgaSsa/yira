import { ipcMain } from 'electron'
import type { GitCommitHistoryResult, GitFileChange, GitFileDiffContent, GitRepository, GitStatusResult, WorkspaceGitDiffResult } from '@shared/types'
import { getGitDiffSummary, getGitFileDiffContent } from '../git/diff'
import { discoverGitRepositories, resolveConfiguredGitRepository } from '../git/repositories'
import { commitGitChanges, discardGitChanges, type GitDiscardPaths, fetchGitRepository, getGitCommitHistory, getGitStatus, pullGitRepository, pushGitRepository, stageGitFiles, syncGitRepository, unstageGitFiles } from '../git/runner'
import { getWorkspaceGitConfigById } from './workspace'

interface WorkspaceGitConfig {
  rootPath: string
  configuredRepositoryPaths: string[]
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
  getGitFileDiffContent?: typeof getGitFileDiffContent
  stageGitFiles: typeof stageGitFiles
  unstageGitFiles: typeof unstageGitFiles
  discardGitChanges?: typeof discardGitChanges
  commitGitChanges: typeof commitGitChanges
  fetchGitRepository: typeof fetchGitRepository
  pullGitRepository: typeof pullGitRepository
  pushGitRepository: typeof pushGitRepository
  syncGitRepository: typeof syncGitRepository
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
      const unavailable: WorkspaceGitDiffResult = { additions: 0, deletions: 0, available: false }
      try {
        const { rootPath, configuredRepositoryPaths } = await getConfig(workspaceId)
        const discoveredRepositories = await dependencies.discoverGitRepositories(rootPath, 1)
        const repositoryPaths = [...new Set([
          ...configuredRepositoryPaths,
          ...discoveredRepositories.map(({ relativePath }) => relativePath),
        ])]
        if (repositoryPaths.length === 0) return { ...unavailable, repositoryCount: 0 }

        const seenRepositoryPaths = new Set<string>()
        let additions = 0
        let deletions = 0
        for (const repositoryPath of repositoryPaths) {
          // Automatic discovery only expands this read. Mutations still require configured paths.
          const repository = await dependencies.resolveConfiguredGitRepository(rootPath, repositoryPaths, repositoryPath)
          const canonicalPath = process.platform === 'win32' ? repository.absolutePath.toLowerCase() : repository.absolutePath
          if (seenRepositoryPaths.has(canonicalPath)) continue
          seenRepositoryPaths.add(canonicalPath)
          const result = await dependencies.getGitDiffSummary(repository.absolutePath)
          if (!result.available
            || !Number.isSafeInteger(result.additions)
            || !Number.isSafeInteger(result.deletions)
            || result.additions < 0
            || result.deletions < 0) {
            return unavailable
          }
          additions += result.additions
          deletions += result.deletions
          if (!Number.isSafeInteger(additions) || !Number.isSafeInteger(deletions)) return unavailable
        }

        return { additions, deletions, available: true }
      } catch {
        return unavailable
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
    'git:stage': async (_event: unknown, workspaceId: string, repositoryPath: string, relativePath: string, originalPath?: string) => {
      await dependencies.stageGitFiles(await resolveRepository(workspaceId, repositoryPath), mutationPaths(relativePath, originalPath))
    },
    'git:unstage': async (_event: unknown, workspaceId: string, repositoryPath: string, relativePath: string, originalPath?: string) => {
      await dependencies.unstageGitFiles(await resolveRepository(workspaceId, repositoryPath), mutationPaths(relativePath, originalPath))
    },
    'git:stageChanges': async (_event: unknown, workspaceId: string, repositoryPath: string, changes: GitFileChange[]) => {
      await dependencies.stageGitFiles(await resolveRepository(workspaceId, repositoryPath), changePaths(changes))
    },
    'git:unstageChanges': async (_event: unknown, workspaceId: string, repositoryPath: string, changes: GitFileChange[]) => {
      await dependencies.unstageGitFiles(await resolveRepository(workspaceId, repositoryPath), changePaths(changes))
    },
    'git:discard': async (_event: unknown, workspaceId: string, repositoryPath: string, changes: GitFileChange[]) => {
      await (dependencies.discardGitChanges ?? discardGitChanges)(await resolveRepository(workspaceId, repositoryPath), discardPaths(changes))
    },
    'git:commit': async (_event: unknown, workspaceId: string, repositoryPath: string, message: string) => {
      await dependencies.commitGitChanges(await resolveRepository(workspaceId, repositoryPath), message)
    },
    'git:sync': async (_event: unknown, workspaceId: string, repositoryPath: string) => {
      await dependencies.syncGitRepository(await resolveRepository(workspaceId, repositoryPath))
    },
    'git:fetch': async (_event: unknown, workspaceId: string, repositoryPath: string) => {
      await dependencies.fetchGitRepository(await resolveRepository(workspaceId, repositoryPath))
    },
    'git:pull': async (_event: unknown, workspaceId: string, repositoryPath: string) => {
      await dependencies.pullGitRepository(await resolveRepository(workspaceId, repositoryPath))
    },
    'git:push': async (_event: unknown, workspaceId: string, repositoryPath: string) => {
      await dependencies.pushGitRepository(await resolveRepository(workspaceId, repositoryPath))
    },
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
}

export function registerGitIPC(
  ipcMainInstance: GitIPCMain = ipcMain,
  dependencies: GitIPCDependencies = defaultGitIPCDependencies,
): void {
  const handlers = createGitIPCHandlers(dependencies)
  for (const [channel, handler] of Object.entries(handlers)) ipcMainInstance.handle(channel, handler)
}
