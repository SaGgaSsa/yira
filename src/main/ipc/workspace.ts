import * as electron from 'electron'
import { promises as fs, readFileSync } from 'fs'
import { isAbsolute, join, relative, resolve } from 'path'
import type { AgentProvider, Config, Workspace, AppSettings, RemoteTerminalConfig, WorkspaceConfig, WorkspaceCreateInput, WorkspaceManagementCommitInput, WorkspaceOpenFolderResult, WorkspaceType, WorkspaceUpdatePatch } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import {
  mergeAgentProvidersConfig,
  normalizeWorkspaceConfig,
  normalizeWorkspaceRootFolderPath,
} from '@shared/workspaceConfig'
import { createSerialTaskQueue } from '@shared/serialTaskQueue'
import {
  latestWorkspaceSelectionTimestamp,
  normalizeWorkspaceSelectionMetadata,
  nextWorkspaceSelectionTimestamp,
} from '@shared/workspaceSelection'
import { applyWorkspaceManagementChanges, setWorkspaceType } from '@shared/workspaceManagement'
import { YIRA_HOME, CONFIG_PATH, WORKSPACES_DIR } from '../paths'
import { mainText } from '../i18n'
import {
  buildUnknownWorkspaceFolderResult,
  canonicalizeRootFolderPath,
  findWorkspaceByRootFolder,
} from '../workspace-root'

const { ipcMain, dialog, BrowserWindow } = electron
const configMutationQueue = createSerialTaskQueue()
let lastSelectionTimestamp = 0

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

function internalWorkspacePath(id: string): string {
  return join(WORKSPACES_DIR, id)
}

function isInsideWorkspacesDir(path: string): boolean {
  const resolvedPath = resolve(path)
  const resolvedWorkspacesDir = resolve(WORKSPACES_DIR)
  const relativePath = relative(resolvedWorkspacesDir, resolvedPath)

  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

export function normalizeWorkspace(workspace: Partial<Workspace> & { id: string; name?: string; path?: string }): Workspace {
  const storagePath = internalWorkspacePath(workspace.id)
  const migratedRootFolderPath =
    workspace.path && !isInsideWorkspacesDir(workspace.path)
      ? workspace.path
      : undefined
  const config = normalizeWorkspaceConfig({
    type: workspace.config?.type,
    rootFolderPath: workspace.config?.rootFolderPath ?? migratedRootFolderPath,
    sourceControlRepositoryPaths: workspace.config?.sourceControlRepositoryPaths,
    workspacePanelOpen: workspace.config?.workspacePanelOpen,
    sourceControlViewMode: workspace.config?.sourceControlViewMode,
    initialCommand: workspace.config?.initialCommand,
    terminalHistoryEnabled: workspace.config?.terminalHistoryEnabled,
    remoteTerminal: workspace.config?.remoteTerminal,
    agentProvider: workspace.config?.agentProvider,
    agentProviders: workspace.config?.agentProviders,
  })
  const selection = normalizeWorkspaceSelectionMetadata(workspace)

  return {
    id: workspace.id,
    name: workspace.name?.trim() || 'Untitled Workspace',
    path: storagePath,
    config,
    ...selection,
  }
}

function normalizeWorkspaceSelectionInPlace(workspace: Workspace): void {
  const selection = normalizeWorkspaceSelectionMetadata(workspace)

  if (selection.pinned === undefined) delete workspace.pinned
  else workspace.pinned = selection.pinned

  if (selection.lastSelectedAt === undefined) delete workspace.lastSelectedAt
  else workspace.lastSelectedAt = selection.lastSelectedAt
}

function nextSelectionTimestamp(workspaces: Workspace[]): number {
  lastSelectionTimestamp = Math.max(lastSelectionTimestamp, latestWorkspaceSelectionTimestamp(workspaces))
  lastSelectionTimestamp = nextWorkspaceSelectionTimestamp(lastSelectionTimestamp, Date.now())
  return lastSelectionTimestamp
}

async function readConfig(): Promise<Config> {
  let raw: string | null = null
  try {
    raw = await fs.readFile(CONFIG_PATH, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  if (raw === null) {
    return { workspaces: [], activeWorkspaceId: '', settings: { ...DEFAULT_SETTINGS } }
  }

  const parsed = JSON.parse(raw)
  const workspaces = Array.isArray(parsed.workspaces)
    ? parsed.workspaces.map(normalizeWorkspace)
    : []
  const activeWorkspaceId = workspaces.some((workspace: Workspace) => workspace.id === parsed.activeWorkspaceId)
    ? parsed.activeWorkspaceId
    : workspaces[0]?.id ?? ''

  return {
    ...parsed,
    workspaces,
    activeWorkspaceId,
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
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
  const temporaryPath = `${CONFIG_PATH}.tmp`
  await fs.writeFile(temporaryPath, JSON.stringify(config, null, 2))
  await fs.rename(temporaryPath, CONFIG_PATH)
}

export async function getWorkspacePathById(workspaceId: string): Promise<string | null> {
  const config = await readConfig()
  return config.workspaces.find(w => w.id === workspaceId)?.path ?? null
}

export async function getWorkspaceRootFolderById(workspaceId: string): Promise<string | null> {
  const config = await readConfig()
  return config.workspaces.find(w => w.id === workspaceId)?.config.rootFolderPath ?? null
}

export async function getWorkspaceRemoteTerminalById(workspaceId: string): Promise<RemoteTerminalConfig | null> {
  const config = await readConfig()
  return config.workspaces.find(w => w.id === workspaceId)?.config.remoteTerminal ?? null
}

/** Returns only the Git settings needed by the main-process Git IPC handlers. */
export async function getWorkspaceGitConfigById(workspaceId: string): Promise<Pick<WorkspaceConfig, 'rootFolderPath' | 'sourceControlRepositoryPaths'> | null> {
  const config = await readConfig()
  const workspace = config.workspaces.find(w => w.id === workspaceId)
  if (!workspace) return null

  return {
    rootFolderPath: workspace.config.rootFolderPath,
    sourceControlRepositoryPaths: workspace.config.sourceControlRepositoryPaths,
  }
}

/** Returns the selected providers once per workspace; callers own deduplication. */
export async function getConfiguredAgentProviders(): Promise<AgentProvider[]> {
  const config = await readConfig()
  return config.workspaces.flatMap((workspace) => workspace.config.agentProvider ? [workspace.config.agentProvider] : [])
}

export async function getWorkspaceRootFolders(): Promise<Array<{ id: string; rootFolderPath: string }>> {
  const config = await readConfig()
  return config.workspaces.flatMap((workspace) => workspace.config.rootFolderPath
    ? [{ id: workspace.id, rootFolderPath: workspace.config.rootFolderPath }]
    : [])
}

export async function initWorkspaces(): Promise<void> {
  await configMutationQueue.run(async () => {
    await ensureDir(YIRA_HOME)
    await ensureDir(WORKSPACES_DIR)
    const config = await readConfig()

    // Ensure all workspace dirs exist
    for (const ws of config.workspaces) {
      await ensureDir(ws.path)
    }

    await writeConfig(config)
  })
}

function parseWorkspaceCreateInput(input: string | WorkspaceCreateInput): WorkspaceCreateInput {
  if (typeof input === 'string') return { name: input }

  return input
}

export function createWorkspaceFromInput(input: WorkspaceCreateInput): Workspace {
  const trimmedName = input.name.trim()
  if (!trimmedName) {
    throw new Error('Workspace name cannot be empty')
  }

  const id = createWorkspaceId()

  return {
    id,
    name: trimmedName,
    path: internalWorkspacePath(id),
    config: normalizeWorkspaceConfig({
      type: input.type,
      rootFolderPath: input.rootFolderPath,
      sourceControlRepositoryPaths: input.sourceControlRepositoryPaths,
      workspacePanelOpen: input.workspacePanelOpen,
      sourceControlViewMode: input.sourceControlViewMode,
      initialCommand: input.initialCommand,
      terminalHistoryEnabled: input.terminalHistoryEnabled,
      remoteTerminal: input.remoteTerminal,
      agentProvider: input.agentProvider,
      agentProviders: input.agentProviders,
    }),
  }
}

export function updateWorkspace(workspace: Workspace, patch: WorkspaceUpdatePatch): Workspace {
  const nextName = patch.name === undefined ? workspace.name : patch.name.trim()
  if (!nextName) {
    throw new Error('Workspace name cannot be empty')
  }

  const hasAgentProviderPatch = patch.config !== undefined
    && patch.config !== null
    && Object.prototype.hasOwnProperty.call(patch.config, 'agentProvider')
  const hasRootFolderPathPatch = patch.config !== undefined
    && patch.config !== null
    && Object.prototype.hasOwnProperty.call(patch.config, 'rootFolderPath')
  const hasRepositoryPathsPatch = patch.config !== undefined
    && patch.config !== null
    && Object.prototype.hasOwnProperty.call(patch.config, 'sourceControlRepositoryPaths')
  const hasInitialCommandPatch = patch.config !== undefined
    && patch.config !== null
    && Object.prototype.hasOwnProperty.call(patch.config, 'initialCommand')
  const nextRootFolderPath = normalizeWorkspaceRootFolderPath(
    hasRootFolderPathPatch ? patch.config?.rootFolderPath : workspace.config.rootFolderPath,
  )
  const rootFolderPathChanged = nextRootFolderPath !== normalizeWorkspaceRootFolderPath(workspace.config.rootFolderPath)

  workspace.name = nextName
  workspace.config = normalizeWorkspaceConfig({
    type: workspace.config.type,
    rootFolderPath: hasRootFolderPathPatch ? patch.config?.rootFolderPath : workspace.config.rootFolderPath,
    sourceControlRepositoryPaths: hasRepositoryPathsPatch
      ? patch.config?.sourceControlRepositoryPaths
      : rootFolderPathChanged ? [] : workspace.config.sourceControlRepositoryPaths,
    workspacePanelOpen: patch.config?.workspacePanelOpen ?? workspace.config.workspacePanelOpen,
    sourceControlViewMode: patch.config?.sourceControlViewMode ?? workspace.config.sourceControlViewMode,
    initialCommand: hasInitialCommandPatch ? patch.config?.initialCommand : workspace.config.initialCommand,
    terminalHistoryEnabled: patch.config?.terminalHistoryEnabled ?? workspace.config.terminalHistoryEnabled,
    remoteTerminal: patch.config?.remoteTerminal ?? workspace.config.remoteTerminal,
    agentProvider: hasAgentProviderPatch ? patch.config?.agentProvider : workspace.config.agentProvider,
    agentProviders: mergeAgentProvidersConfig(workspace.config.agentProviders, patch.config?.agentProviders),
  })
  normalizeWorkspaceSelectionInPlace(workspace)

  return workspace
}

let workspaceIdCounter = 0

function createWorkspaceId(): string {
  workspaceIdCounter += 1
  return `ws-${Date.now()}-${workspaceIdCounter}`
}

export function registerWorkspaceIPC(
  options: { beforeDelete?: (workspaceId: string) => Promise<void> } = {},
): void {
  ipcMain.handle('workspace:list', async () => {
    const config = await readConfig()
    // Metadata only: selectors/editors need config rows, not canvas, boards, notes, or tile state.
    return config.workspaces
  })

  ipcMain.handle('workspace:getActive', async () => {
    const config = await readConfig()
    // Metadata only. The renderer decides when to restore the active workspace canvas.
    return config.workspaces.find(w => w.id === config.activeWorkspaceId) ?? config.workspaces[0] ?? null
  })

  ipcMain.handle('workspace:create', async (_, input: string | WorkspaceCreateInput) => {
    return configMutationQueue.run(async () => {
      const config = await readConfig()
      const workspace = createWorkspaceFromInput(parseWorkspaceCreateInput(input))
      await ensureDir(workspace.path)
      config.workspaces.push(workspace)
      config.activeWorkspaceId = workspace.id
      await writeConfig(config)
      return workspace
    })
  })

  ipcMain.handle('workspace:update', async (_, id: string, patch: WorkspaceUpdatePatch) => {
    return configMutationQueue.run(async () => {
      const config = await readConfig()
      const workspace = config.workspaces.find((w) => w.id === id)
      if (!workspace) return null

      const updated = updateWorkspace(workspace, patch)
      await writeConfig(config)
      return updated
    })
  })

  ipcMain.handle('workspace:rename', async (_, id: string, name: string) => {
    return configMutationQueue.run(async () => {
      const config = await readConfig()
      const workspace = config.workspaces.find((w) => w.id === id)
      if (!workspace) return null

      const updated = updateWorkspace(workspace, { name })
      await writeConfig(config)
      return updated
    })
  })

  ipcMain.handle('workspace:delete', async (_, id: string) => {
    return configMutationQueue.run(async () => {
      const config = await readConfig()
      const workspace = config.workspaces.find((w) => w.id === id)
      if (!workspace) return

      await options.beforeDelete?.(id)

      config.workspaces = config.workspaces.filter((w) => w.id !== id)

      if (workspace.path.startsWith(WORKSPACES_DIR)) {
        try {
          await fs.rm(workspace.path, { recursive: true, force: true })
        } catch {
          // ignore delete failures for local workspace dir cleanup
        }
      }

      if (config.workspaces.length === 0) {
        config.activeWorkspaceId = ''
      } else if (config.activeWorkspaceId === id) {
        config.activeWorkspaceId = config.workspaces[0].id
      }

      await writeConfig(config)
    })
  })

  ipcMain.handle('workspace:commitManagementChanges', async (_, input: WorkspaceManagementCommitInput) => {
    return configMutationQueue.run(async () => {
      const config = await readConfig()
      const result = applyWorkspaceManagementChanges({
        existingWorkspaces: config.workspaces,
        activeWorkspaceId: config.activeWorkspaceId,
        desiredWorkspaces: Array.isArray(input?.workspaces) ? input.workspaces : [],
        nextWorkspaceId: createWorkspaceId,
        internalWorkspacePath,
      })

      const existingById = new Map(config.workspaces.map((workspace) => [workspace.id, workspace]))

      for (const workspaceId of result.removedWorkspaceIds) {
        await options.beforeDelete?.(workspaceId)
      }

      for (const workspace of result.workspaces) {
        if (!existingById.has(workspace.id)) {
          await ensureDir(workspace.path)
        }
      }

      for (const workspaceId of result.removedWorkspaceIds) {
        const workspace = existingById.get(workspaceId)
        if (!workspace || !isInsideWorkspacesDir(workspace.path)) continue

        try {
          await fs.rm(workspace.path, { recursive: true, force: true })
        } catch {
          // ignore cleanup failures for internal workspace dirs
        }
      }

      config.workspaces = result.workspaces
      config.activeWorkspaceId = result.activeWorkspaceId
      await writeConfig(config)

      return result
    })
  })

  ipcMain.handle('workspace:openFolder', async (): Promise<WorkspaceOpenFolderResult> => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: mainText('openProjectFolder'),
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { workspace: null, canceled: true }
    }

    const folderPath = await canonicalizeRootFolderPath(result.filePaths[0])
    return configMutationQueue.run(async () => {
      const config = await readConfig()
      const existing = findWorkspaceByRootFolder(config.workspaces, folderPath)
      if (existing) {
        config.activeWorkspaceId = existing.id
        await writeConfig(config)
        return { workspace: existing, canceled: false }
      }

      return buildUnknownWorkspaceFolderResult(folderPath)
    })
  })

  ipcMain.handle('workspace:recordSelection', async (_, id: string) => {
    return configMutationQueue.run(async () => {
      const config = await readConfig()
      const workspace = config.workspaces.find((entry) => entry.id === id)
      if (!workspace) return null

      workspace.lastSelectedAt = nextSelectionTimestamp(config.workspaces)
      await writeConfig(config)
      return workspace
    })
  })

  ipcMain.handle('workspace:setPinned', async (_, id: string, pinned: boolean) => {
    return configMutationQueue.run(async () => {
      const config = await readConfig()
      const workspace = config.workspaces.find((entry) => entry.id === id)
      if (!workspace) return null

      workspace.pinned = pinned === true
      await writeConfig(config)
      return workspace
    })
  })

  ipcMain.handle('workspace:setActive', async (_, id: string) => {
    return configMutationQueue.run(async () => {
      const config = await readConfig()
      if (config.workspaces.some(w => w.id === id)) {
        config.activeWorkspaceId = id
        await writeConfig(config)
      }
    })
  })

  ipcMain.handle('workspace:setType', async (_, id: string, type: WorkspaceType) => {
    return configMutationQueue.run(async () => {
      const config = await readConfig()
      const workspaces = setWorkspaceType(config.workspaces, id, type)
      if (!workspaces) return null

      config.workspaces = workspaces
      await writeConfig(config)
      return config.workspaces.find((workspace) => workspace.id === id) ?? null
    })
  })

  ipcMain.handle('settings:get', async () => {
    const config = await readConfig()
    return config.settings
  })

  ipcMain.handle('settings:set', async (_, settings: AppSettings) => {
    return configMutationQueue.run(async () => {
      const config = await readConfig()
      config.settings = { ...DEFAULT_SETTINGS, ...settings }
      await writeConfig(config)
      return config.settings
    })
  })
}
