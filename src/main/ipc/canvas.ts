import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { getWorkspacePathById } from './workspace'
import { YIRA_HOME } from '../paths'

function assertSafeId(id: string): void {
  if (/[\/\\]|\.\./.test(id)) throw new Error(`Unsafe ID: ${id}`)
}

function canvasStatePath(workspaceId: string): string {
  assertSafeId(workspaceId)
  return join(YIRA_HOME, 'workspaces', workspaceId, '.yira', 'canvas-state.json')
}

export function registerCanvasIPC(): void {
  ipcMain.handle('canvas:load', async (_, workspaceId: string) => {
    const path = canvasStatePath(workspaceId)
    try {
      const raw = await fs.readFile(path, 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('canvas:save', async (_, workspaceId: string, state: unknown) => {
    const path = canvasStatePath(workspaceId)
    const dir = join(YIRA_HOME, 'workspaces', workspaceId, '.yira')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path, JSON.stringify(state, null, 2))
  })
}
