import { ipcMain } from 'electron'
import type { GitCommitHistoryResult, GitRepository, GitStatusResult } from '@shared/types'
import { discoverGitRepositories, resolveConfiguredGitRepository } from '../git/repositories'
import { commitGitChanges, getGitCommitHistory, getGitStatus, stageGitFiles, syncGitRepository, unstageGitFiles } from '../git/runner'
import { getWorkspaceGitConfigById } from './workspace'

interface WorkspaceGitConfig {
  rootPath: string
  configuredRepositoryPaths: string[]
}

async function getWorkspaceGitConfig(workspaceId: string): Promise<WorkspaceGitConfig> {
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) throw new Error('Workspace is required')

  const workspaceConfig = await getWorkspaceGitConfigById(workspaceId)
  if (!workspaceConfig) throw new Error('Workspace is unavailable')
  if (!workspaceConfig.rootFolderPath) throw new Error('Workspace root folder is unavailable')

  return {
    rootPath: workspaceConfig.rootFolderPath,
    configuredRepositoryPaths: workspaceConfig.sourceControlRepositoryPaths,
  }
}

async function getWorkspaceGitRoot(workspaceId: string): Promise<string> {
  return (await getWorkspaceGitConfig(workspaceId)).rootPath
}

async function resolveWorkspaceGitRepository(workspaceId: string, repositoryPath: string): Promise<string> {
  const { rootPath, configuredRepositoryPaths } = await getWorkspaceGitConfig(workspaceId)
  const repository = await resolveConfiguredGitRepository(rootPath, configuredRepositoryPaths, repositoryPath)
  return repository.absolutePath
}

function mutationPaths(relativePath: string, originalPath?: string): string[] {
  if (typeof relativePath !== 'string') throw new Error('Path must be a string')
  if (originalPath !== undefined && typeof originalPath !== 'string') throw new Error('Original path must be a string')
  return originalPath && originalPath !== relativePath ? [relativePath, originalPath] : [relativePath]
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

export function registerGitIPC(): void {
  ipcMain.handle('git:discoverRepositories', async (_event, workspaceId: string): Promise<GitRepository[]> => {
    const repositories = await discoverGitRepositories(await getWorkspaceGitRoot(workspaceId))
    return repositories.map(({ relativePath, name }) => ({ relativePath, name }))
  })

  ipcMain.handle('git:status', async (_event, workspaceId: string, repositoryPath: string): Promise<GitStatusResult> => {
    try {
      const result = await getGitStatus(await resolveWorkspaceGitRepository(workspaceId, repositoryPath))
      return result.error ? { ...result, error: safeGitError(result.error) } : result
    } catch (error) {
      return {
        isRepository: false,
        branch: null,
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        error: safeGitError(error),
      }
    }
  })

  ipcMain.handle('git:history', async (_event, workspaceId: string, repositoryPath: string): Promise<GitCommitHistoryResult> => {
    try {
      const result = await getGitCommitHistory(await resolveWorkspaceGitRepository(workspaceId, repositoryPath))
      return result.error ? { ...result, error: safeGitError(result.error) } : result
    } catch (error) {
      return {
        outgoing: [],
        upstream: [],
        local: [],
        error: safeGitError(error),
      }
    }
  })

  ipcMain.handle('git:stage', async (_event, workspaceId: string, repositoryPath: string, relativePath: string, originalPath?: string) => {
    await stageGitFiles(await resolveWorkspaceGitRepository(workspaceId, repositoryPath), mutationPaths(relativePath, originalPath))
  })

  ipcMain.handle('git:unstage', async (_event, workspaceId: string, repositoryPath: string, relativePath: string, originalPath?: string) => {
    await unstageGitFiles(await resolveWorkspaceGitRepository(workspaceId, repositoryPath), mutationPaths(relativePath, originalPath))
  })

  ipcMain.handle('git:commit', async (_event, workspaceId: string, repositoryPath: string, message: string) => {
    await commitGitChanges(await resolveWorkspaceGitRepository(workspaceId, repositoryPath), message)
  })

  ipcMain.handle('git:sync', async (_event, workspaceId: string, repositoryPath: string) => {
    await syncGitRepository(await resolveWorkspaceGitRepository(workspaceId, repositoryPath))
  })
}
