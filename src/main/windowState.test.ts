import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadWindowState, saveWindowState } from './windowState'

async function run(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'yira-window-state-'))
  const statePath = join(directory, 'window-state.json')

  try {
    const firstLaunchState = await loadWindowState(statePath)
    if (!firstLaunchState.maximized) {
      throw new Error('first launch must default to maximized')
    }

    await saveWindowState(statePath, { maximized: false })
    const restoredState = await loadWindowState(statePath)
    if (restoredState.maximized) {
      throw new Error('saved restored state must be loaded')
    }

    await saveWindowState(statePath, { maximized: true })
    const maximizedState = await loadWindowState(statePath)
    if (!maximizedState.maximized) {
      throw new Error('saved maximized state must be loaded')
    }

    await writeFile(statePath, JSON.stringify({ maximized: 'yes' }))
    const malformedState = await loadWindowState(statePath)
    if (!malformedState.maximized) {
      throw new Error('invalid saved state must use the maximized default')
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

void run()
