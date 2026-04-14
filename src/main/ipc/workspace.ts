import { ipcMain, dialog, BrowserWindow } from 'electron'
import { promises as fs, readFileSync } from 'fs'
import { basename, join } from 'path'
import type { Config, Workspace, AppSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { YIRA_HOME, CONFIG_PATH, WORKSPACES_DIR } from '../paths'

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

async function readConfig(): Promise<Config> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    }
  } catch {
    return { workspaces: [], activeWorkspaceId: '', settings: { ...DEFAULT_SETTINGS } }
  }
}

export function readSettingsSync(): AppSettings {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

async function writeConfig(config: Config): Promise<void> {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2))
}

export async function getWorkspacePathById(workspaceId: string): Promise<string | null> {
  const config = await readConfig()
  return config.workspaces.find(w => w.id === workspaceId)?.path ?? null
}

export async function initWorkspaces(): Promise<void> {
  await ensureDir(YIRA_HOME)
  await ensureDir(WORKSPACES_DIR)
  let config = await readConfig()

  // Create default workspace if none exist
  if (config.workspaces.length === 0) {
    const defaultId = 'default'
    const defaultPath = join(WORKSPACES_DIR, defaultId)
    await ensureDir(defaultPath)
    config = {
      workspaces: [{ id: defaultId, name: 'Default', path: defaultPath }],
      activeWorkspaceId: defaultId,
      settings: { ...DEFAULT_SETTINGS },
    }
    await writeConfig(config)
  }

  // Ensure all workspace dirs exist
  for (const ws of config.workspaces) {
    await ensureDir(ws.path)
  }
}

export function registerWorkspaceIPC(): void {
  ipcMain.handle('workspace:list', async () => {
    const config = await readConfig()
    return config.workspaces
  })

  ipcMain.handle('workspace:getActive', async () => {
    const config = await readConfig()
    return config.workspaces.find(w => w.id === config.activeWorkspaceId) ?? config.workspaces[0] ?? null
  })

  ipcMain.handle('workspace:create', async (_, name: string) => {
    const config = await readConfig()
    const id = `ws-${Date.now()}`
    const wsPath = join(WORKSPACES_DIR, id)
    await ensureDir(wsPath)
    const workspace: Workspace = { id, name, path: wsPath }
    config.workspaces.push(workspace)
    config.activeWorkspaceId = id
    await writeConfig(config)
    return workspace
  })

  ipcMain.handle('workspace:delete', async (_, id: string) => {
    const config = await readConfig()
    const workspace = config.workspaces.find((w) => w.id === id)
    if (!workspace) return

    config.workspaces = config.workspaces.filter((w) => w.id !== id)

    if (workspace.path.startsWith(WORKSPACES_DIR)) {
      try {
        await fs.rm(workspace.path, { recursive: true, force: true })
      } catch {
        // ignore delete failures for local workspace dir cleanup
      }
    }

    if (config.workspaces.length === 0) {
      const defaultId = 'default'
      const defaultPath = join(WORKSPACES_DIR, defaultId)
      await ensureDir(defaultPath)
      config.workspaces = [{ id: defaultId, name: 'Default', path: defaultPath }]
      config.activeWorkspaceId = defaultId
    } else if (config.activeWorkspaceId === id) {
      config.activeWorkspaceId = config.workspaces[0].id
    }

    await writeConfig(config)
  })

  ipcMain.handle('workspace:openFolder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Open Project Folder',
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const folderPath = result.filePaths[0]
    const config = await readConfig()
    const existing = config.workspaces.find(w => w.path === folderPath)
    if (existing) {
      config.activeWorkspaceId = existing.id
      await writeConfig(config)
      return existing
    }

    const id = `ws-${Date.now()}`
    const name = basename(folderPath)
    const workspace: Workspace = { id, name, path: folderPath }
    config.workspaces.push(workspace)
    config.activeWorkspaceId = id
    await writeConfig(config)
    return workspace
  })

  ipcMain.handle('workspace:setActive', async (_, id: string) => {
    const config = await readConfig()
    if (config.workspaces.some(w => w.id === id)) {
      config.activeWorkspaceId = id
      await writeConfig(config)
    }
  })

  ipcMain.handle('settings:get', async () => {
    const config = await readConfig()
    return config.settings
  })

  ipcMain.handle('settings:set', async (_, settings: AppSettings) => {
    const config = await readConfig()
    config.settings = { ...DEFAULT_SETTINGS, ...settings }
    await writeConfig(config)
    return config.settings
  })
}
