import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { YIRA_HOME } from '../paths'

function assertSafeId(id: string): void {
  if (/[\/\\]|\.\./.test(id)) throw new Error(`Unsafe ID: ${id}`)
}

// Note data is stored per workspace (current active workspace)
// We use a global notes directory: YIRA_HOME/notes/{tileId}.json
function noteDataPath(tileId: string): string {
  assertSafeId(tileId)
  const dir = join(YIRA_HOME, 'notes')
  return join(dir, `${tileId}.json`)
}

export interface NoteData {
  color?: string
  font?: string
  content?: string
}

export function registerNotesIPC(): void {
  ipcMain.handle('note:save', async (_, tileId: string, data: NoteData): Promise<void> => {
    const path = noteDataPath(tileId)
    const dir = join(YIRA_HOME, 'notes')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path, JSON.stringify(data, null, 2))
  })

  ipcMain.handle('note:load', async (_, tileId: string): Promise<NoteData | null> => {
    const path = noteDataPath(tileId)
    try {
      const raw = await fs.readFile(path, 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('note:delete', async (_, tileId: string): Promise<void> => {
    const path = noteDataPath(tileId)
    try {
      await fs.unlink(path)
    } catch {
      // ignore if doesn't exist
    }
  })
}
