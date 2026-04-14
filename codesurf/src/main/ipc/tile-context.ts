import { ipcMain, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { CONTEX_HOME } from '../paths'
import { bus } from '../event-bus'

function assertSafeId(id: string): void {
  if (/[\/\\]|\.\./.test(id)) throw new Error(`Unsafe ID: ${id}`)
}

function tileStatePath(workspaceId: string, tileId: string): string {
  assertSafeId(workspaceId)
  assertSafeId(tileId)
  return join(CONTEX_HOME, 'workspaces', workspaceId, '.contex', `tile-state-${tileId}.json`)
}

interface TileState {
  _context?: Record<string, { key: string; value: unknown; updatedAt: number; source: string }>
  [k: string]: unknown
}

async function loadTileState(workspaceId: string, tileId: string): Promise<TileState> {
  try {
    const raw = await fs.readFile(tileStatePath(workspaceId, tileId), 'utf8')
    return JSON.parse(raw) as TileState
  } catch {
    return {}
  }
}

async function saveTileState(workspaceId: string, tileId: string, state: TileState): Promise<void> {
  const dir = join(CONTEX_HOME, 'workspaces', workspaceId, '.contex')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(tileStatePath(workspaceId, tileId), JSON.stringify(state, null, 2))
}

function publishContextChanged(tileId: string, key: string, value: unknown): void {
  const evt = bus.publish({
    channel: `ctx:${tileId}`,
    type: 'data',
    source: `tile:${tileId}`,
    payload: { action: 'context_changed', key, value, tileId },
  })
  // Forward to renderer
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('tileContext:changed', { tileId, key, value })
  })
}

export function registerTileContextIPC(): void {
  // Get a single context entry
  ipcMain.handle('tileContext:get', async (_, workspaceId: string, tileId: string, key?: string) => {
    const state = await loadTileState(workspaceId, tileId)
    const ctx = state._context ?? {}
    if (key) return ctx[key] ?? null
    return ctx
  })

  // Get all context entries, optionally filtered by tag prefix
  ipcMain.handle('tileContext:getAll', async (_, workspaceId: string, tileId: string, tagPrefix?: string) => {
    const state = await loadTileState(workspaceId, tileId)
    const ctx = state._context ?? {}
    if (!tagPrefix) return Object.values(ctx)
    return Object.values(ctx).filter(e => e.key.startsWith(tagPrefix))
  })

  // Set a context entry
  ipcMain.handle('tileContext:set', async (_, workspaceId: string, tileId: string, key: string, value: unknown) => {
    const state = await loadTileState(workspaceId, tileId)
    if (!state._context) state._context = {}
    state._context[key] = { key, value, updatedAt: Date.now(), source: tileId }
    await saveTileState(workspaceId, tileId, state)
    publishContextChanged(tileId, key, value)
    return true
  })

  // Delete a context entry
  ipcMain.handle('tileContext:delete', async (_, workspaceId: string, tileId: string, key: string) => {
    const state = await loadTileState(workspaceId, tileId)
    if (state._context) {
      delete state._context[key]
      await saveTileState(workspaceId, tileId, state)
      publishContextChanged(tileId, key, null)
    }
    return true
  })
}
