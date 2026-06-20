import { promises as fs } from 'fs'
import { dirname } from 'path'

export interface WindowState {
  maximized: boolean
}

const DEFAULT_WINDOW_STATE: WindowState = {
  maximized: true,
}

let pendingWrite = Promise.resolve()

export async function loadWindowState(path: string): Promise<WindowState> {
  try {
    const raw = await fs.readFile(path, 'utf8')
    const parsed: unknown = JSON.parse(raw)

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Partial<WindowState>).maximized === 'boolean'
    ) {
      return { maximized: (parsed as WindowState).maximized }
    }
  } catch {
    // First launches and malformed state both use the maximized default.
  }

  return { ...DEFAULT_WINDOW_STATE }
}

export function saveWindowState(path: string, state: WindowState): Promise<void> {
  pendingWrite = pendingWrite.then(async () => {
    await fs.mkdir(dirname(path), { recursive: true })
    await fs.writeFile(path, JSON.stringify({ maximized: state.maximized }, null, 2))
  })

  return pendingWrite
}
