import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { KanbanBoardState } from '@shared/types'
import { YIRA_HOME } from '../paths'

function assertSafeId(id: string): void {
  if (/[\/\\]|\.\./.test(id)) throw new Error(`Unsafe ID: ${id}`)
}

function boardDataPath(workspaceId: string, tileId: string): string {
  assertSafeId(workspaceId)
  assertSafeId(tileId)
  return join(YIRA_HOME, 'workspaces', workspaceId, '.yira', 'boards', `${tileId}.json`)
}

export function registerBoardsIPC(): void {
  ipcMain.handle('board:save', async (_, workspaceId: string, tileId: string, state: KanbanBoardState): Promise<void> => {
    const path = boardDataPath(workspaceId, tileId)
    await fs.mkdir(join(YIRA_HOME, 'workspaces', workspaceId, '.yira', 'boards'), { recursive: true })
    await fs.writeFile(path, JSON.stringify(state, null, 2))
  })

  ipcMain.handle('board:load', async (_, workspaceId: string, tileId: string): Promise<KanbanBoardState | null> => {
    const path = boardDataPath(workspaceId, tileId)
    try {
      const raw = await fs.readFile(path, 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('board:delete', async (_, workspaceId: string, tileId: string): Promise<void> => {
    const path = boardDataPath(workspaceId, tileId)
    try {
      await fs.unlink(path)
    } catch {
      // ignore if file does not exist
    }
  })
}
