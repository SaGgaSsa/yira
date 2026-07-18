import { ipcMain } from 'electron'
import type { GitStatusResult } from '@shared/types'
import { commitGitChanges, getGitStatus, stageGitFiles, syncGitRepository, unstageGitFiles } from '../git/runner'
import { getWorkspaceRootFolderById } from './workspace'

async function getWorkspaceGitRoot(workspaceId: string): Promise<string> {
  if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('Workspace is required')
  const rootPath = await getWorkspaceRootFolderById(workspaceId)
  if (!rootPath) throw new Error('Workspace root folder is unavailable')
  return rootPath
}

function mutationPaths(relativePath: string, originalPath?: string): string[] {
  if (typeof relativePath !== 'string') throw new Error('Path must be a string')
  if (originalPath !== undefined && typeof originalPath !== 'string') throw new Error('Original path must be a string')
  return originalPath && originalPath !== relativePath ? [relativePath, originalPath] : [relativePath]
}

export function registerGitIPC(): void {
  ipcMain.handle('git:status', async (_event, workspaceId: string): Promise<GitStatusResult> => {
    try {
      return await getGitStatus(await getWorkspaceGitRoot(workspaceId))
    } catch (error) {
      return {
        isRepository: false,
        branch: null,
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        error: error instanceof Error ? error.message : 'Workspace root folder is unavailable',
      }
    }
  })

  ipcMain.handle('git:stage', async (_event, workspaceId: string, relativePath: string, originalPath?: string) => {
    await stageGitFiles(await getWorkspaceGitRoot(workspaceId), mutationPaths(relativePath, originalPath))
  })

  ipcMain.handle('git:unstage', async (_event, workspaceId: string, relativePath: string, originalPath?: string) => {
    await unstageGitFiles(await getWorkspaceGitRoot(workspaceId), mutationPaths(relativePath, originalPath))
  })

  ipcMain.handle('git:commit', async (_event, workspaceId: string, message: string) => {
    await commitGitChanges(await getWorkspaceGitRoot(workspaceId), message)
  })

  ipcMain.handle('git:sync', async (_event, workspaceId: string) => {
    await syncGitRepository(await getWorkspaceGitRoot(workspaceId))
  })
}
