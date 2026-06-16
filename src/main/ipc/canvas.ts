import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { YIRA_HOME } from '../paths'

function assertSafeId(id: string): void {
  if (/[\/\\]|\.\./.test(id)) throw new Error(`Unsafe ID: ${id}`)
}

function workspaceStatePath(workspaceId: string, workspaceType?: string): string {
  assertSafeId(workspaceId)
  const filename = workspaceType === 'grid' ? 'grid-state.json' : 'canvas-state.json'
  return join(YIRA_HOME, 'workspaces', workspaceId, '.yira', filename)
}

export function registerCanvasIPC(): void {
  ipcMain.handle('canvas:load', async (_, workspaceId: string, workspaceType?: string) => {
    const path = workspaceStatePath(workspaceId, workspaceType)
    try {
      const raw = await fs.readFile(path, 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('canvas:save', async (_, workspaceId: string, state: unknown, workspaceType?: string) => {
    const path = workspaceStatePath(workspaceId, workspaceType)
    const dir = join(YIRA_HOME, 'workspaces', workspaceId, '.yira')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path, JSON.stringify(state, null, 2))
  })
}
