import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { writeFileAtomic } from '@shared/atomicWrite'
import { createSerialTaskQueue, type SerialTaskQueue } from '@shared/serialTaskQueue'
import { YIRA_HOME } from '../paths'

const lastSavedContentByPath = new Map<string, string>()
const saveQueuesByPath = new Map<string, SerialTaskQueue>()

function saveQueueForPath(path: string): SerialTaskQueue {
  let queue = saveQueuesByPath.get(path)
  if (!queue) {
    queue = createSerialTaskQueue()
    saveQueuesByPath.set(path, queue)
  }
  return queue
}

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
    const serialized = JSON.stringify(state, null, 2)

    // Autosave repeats unchanged states; keep writes ordered per file and skip identical ones.
    await saveQueueForPath(path).run(async () => {
      if (lastSavedContentByPath.get(path) === serialized) return

      await fs.mkdir(dir, { recursive: true })
      await writeFileAtomic(path, serialized)
      lastSavedContentByPath.set(path, serialized)
    })
  })
}
