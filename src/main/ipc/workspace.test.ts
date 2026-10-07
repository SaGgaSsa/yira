import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentProvider, Workspace } from '@shared/types'
import { normalizeWorkspaceConfig } from '@shared/workspaceConfig'

type WorkspaceModule = typeof import('./workspace')

type Handler = (event: unknown, ...args: unknown[]) => unknown

class FakeIpcMain {
  readonly handlers = new Map<string, Handler>()

  handle(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler)
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
    return handler({}, ...args)
  }
}

function loadWorkspaceModule(ipcMain: FakeIpcMain): WorkspaceModule {
  const nodeRequire = createRequire(import.meta.url)
  const nodeModule = nodeRequire('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
  }
  const originalLoad = nodeModule._load
  nodeModule._load = function(request, parent, isMain) {
    if (request === 'electron') return { ipcMain, dialog: {}, BrowserWindow: {} }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    return nodeRequire('./workspace.ts') as WorkspaceModule
  } finally {
    nodeModule._load = originalLoad
  }
}

const previousYiraHome = process.env.YIRA_HOME
const ipcConfigRoot = await mkdtemp(join(tmpdir(), 'yira-workspace-ipc-'))
process.env.YIRA_HOME = ipcConfigRoot
const ipcMain = new FakeIpcMain()
const workspaceModule = loadWorkspaceModule(ipcMain)
const { createWorkspaceFromInput, getWorkspaceRemoteTerminalById, normalizeWorkspace, updateWorkspace } = workspaceModule

test.after(async () => {
  await rm(ipcConfigRoot, { recursive: true, force: true })
  if (previousYiraHome === undefined) delete process.env.YIRA_HOME
  else process.env.YIRA_HOME = previousYiraHome
})

type SourceControlConfig = Workspace['config'] & {
  sourceControlRepositoryPaths: string[]
}

function sourceControlPaths(workspace: Workspace): string[] {
  return (workspace.config as SourceControlConfig).sourceControlRepositoryPaths
}

function workspace(id: string, agentProvider?: AgentProvider, rootFolderPath?: string): Workspace {
  return {
    id,
    name: id,
    path: `/tmp/yira/workspaces/${id}`,
    config: normalizeWorkspaceConfig({ agentProvider, rootFolderPath }),
  }
}

test('persists workspace agent provider through load, create, and update normalization', () => {
  const loaded = normalizeWorkspace({
    id: 'loaded',
    name: ' Loaded ',
    path: '/repo',
    config: normalizeWorkspaceConfig({ agentProvider: 'claude' }),
  })
  assert.equal(loaded.config.agentProvider, 'claude')

  const created = createWorkspaceFromInput({ name: 'Created', agentProvider: 'codex' })
  assert.equal(created.config.agentProvider, 'codex')

  const preserved = updateWorkspace(workspace('preserved', 'claude'), { config: { workspacePanelOpen: false } })
  assert.equal(preserved.config.agentProvider, 'claude')

  const cleared = updateWorkspace(workspace('cleared', 'claude'), { config: { agentProvider: undefined } })
  assert.equal(cleared.config.agentProvider, undefined)
})

test('preserves, creates, replaces, and clears custom workspace scripts', () => {
  const customScripts = [
    { id: 'local-dev', name: 'Local dev', command: 'npm run dev' },
  ]
  const loaded = normalizeWorkspace({
    id: 'custom-scripts-loaded',
    name: 'Loaded',
    config: normalizeWorkspaceConfig({ customScripts }),
  })
  assert.deepEqual(loaded.config.customScripts, customScripts)

  const createInput = { name: 'Custom scripts created', customScripts }
  const created = createWorkspaceFromInput(createInput)
  assert.deepEqual(created.config.customScripts, customScripts)

  const existing = workspace('custom-scripts-updated')
  existing.config = normalizeWorkspaceConfig({ customScripts })
  const preserved = updateWorkspace(existing, { config: { workspacePanelOpen: false } })
  assert.deepEqual(preserved.config.customScripts, customScripts)

  const replaced = updateWorkspace(preserved, {
    config: { customScripts: [{ id: 'test', name: 'Test', command: 'npm test' }] },
  })
  assert.deepEqual(replaced.config.customScripts, [{ id: 'test', name: 'Test', command: 'npm test' }])

  const clearedWithEmptyList = updateWorkspace(replaced, { config: { customScripts: [] } })
  assert.equal(clearedWithEmptyList.config.customScripts, undefined)

  const clearedWithUndefined = updateWorkspace(preserved, { config: { customScripts: undefined } })
  assert.equal(clearedWithUndefined.config.customScripts, undefined)
})

test('normalizes and preserves workspace selection metadata', () => {
  const loaded = normalizeWorkspace({
    id: 'selection-loaded',
    name: 'Loaded',
    pinned: true,
    lastSelectedAt: 456,
  })
  assert.equal(loaded.pinned, true)
  assert.equal(loaded.lastSelectedAt, 456)

  const corrupt = normalizeWorkspace({
    id: 'selection-corrupt',
    name: 'Corrupt',
    pinned: 'yes' as unknown as boolean,
    lastSelectedAt: Number.NaN,
  })
  assert.equal(corrupt.pinned, undefined)
  assert.equal(corrupt.lastSelectedAt, undefined)

  const existing = workspace('selection-preserved')
  existing.pinned = true
  existing.lastSelectedAt = 789
  const updated = updateWorkspace(existing, { name: 'Renamed' })
  assert.equal(updated.pinned, true)
  assert.equal(updated.lastSelectedAt, 789)
})

test('persists selection and pin mutations through concurrent IPC calls', async () => {
  await workspaceModule.initWorkspaces()
  workspaceModule.registerWorkspaceIPC()

  const alpha = await ipcMain.invoke('workspace:create', { name: 'Alpha' }) as Workspace
  const beta = await ipcMain.invoke('workspace:create', { name: 'Beta' }) as Workspace

  const originalNow = Date.now
  Date.now = () => 1_700_000_000_000
  try {
    await Promise.all([
      ipcMain.invoke('workspace:recordSelection', alpha.id),
      ipcMain.invoke('workspace:setPinned', alpha.id, true),
      ipcMain.invoke('workspace:setActive', beta.id),
      ipcMain.invoke('settings:set', { snapToGrid: false }),
    ])

    const firstSelection = (await ipcMain.invoke('workspace:list') as Workspace[])
      .find((workspace) => workspace.id === alpha.id)?.lastSelectedAt
    assert.equal(firstSelection, 1_700_000_000_000)

    const selectedAgain = await ipcMain.invoke('workspace:recordSelection', beta.id) as Workspace
    assert.equal(selectedAgain.lastSelectedAt, 1_700_000_000_001)

    const activeWithoutSelection = await ipcMain.invoke('workspace:setActive', alpha.id)
    assert.equal(activeWithoutSelection, undefined)
    const afterSetActive = (await ipcMain.invoke('workspace:list') as Workspace[])
      .find((workspace) => workspace.id === alpha.id)
    assert.equal(afterSetActive?.lastSelectedAt, firstSelection)

    const unpinned = await ipcMain.invoke('workspace:setPinned', alpha.id, false) as Workspace
    assert.equal(unpinned.pinned, false)
    assert.equal(unpinned.lastSelectedAt, firstSelection)

    const persisted = JSON.parse(await readFile(join(ipcConfigRoot, 'config.json'), 'utf8')) as {
      workspaces: Workspace[]
      settings: { snapToGrid: boolean }
    }
    const persistedAlpha = persisted.workspaces.find((workspace) => workspace.id === alpha.id)
    assert.equal(persistedAlpha?.pinned, false)
    assert.equal(persistedAlpha?.lastSelectedAt, firstSelection)
    assert.equal(persisted.settings.snapToGrid, false)
  } finally {
    Date.now = originalNow
  }
})

test('persists Wake-on-LAN through workspace creation and update normalization', () => {
  const created = createWorkspaceFromInput({
    name: 'Wake-on-LAN created',
    remoteTerminal: {
      host: '192.168.1.40',
      user: 'dev',
      wakeOnLan: {
        enabled: true,
        macAddress: 'aa-bb-cc-dd-ee-ff',
      },
    },
  })

  assert.equal(created.config.remoteTerminal?.wakeOnLan?.enabled, true)
  assert.equal(created.config.remoteTerminal?.wakeOnLan?.macAddress, 'AA:BB:CC:DD:EE:FF')
  assert.equal(created.config.remoteTerminal?.wakeOnLan?.broadcastAddress, '255.255.255.255')
  assert.equal(created.config.remoteTerminal?.wakeOnLan?.port, 9)

  const existing = workspace('wake-on-lan')
  const updated = updateWorkspace(existing, {
    config: {
      remoteTerminal: {
        host: '192.168.1.40',
        user: 'dev',
        wakeOnLan: {
          enabled: true,
          macAddress: 'AA:BB:CC:DD:EE:FF',
        },
      },
    },
  })

  assert.equal(updated.config.remoteTerminal?.wakeOnLan?.enabled, true)
  assert.equal(updated.config.remoteTerminal?.wakeOnLan?.port, 9)
})

test('returns no remote terminal for a missing workspace', async () => {
  assert.equal(await getWorkspaceRemoteTerminalById('__missing-wake-on-lan-workspace__'), null)
})

test('clears an initial command when the update explicitly omits its value', () => {
  const existing = workspace('clear-initial-command')
  existing.config = normalizeWorkspaceConfig({
    initialCommand: 'npm run dev',
    terminalHistoryEnabled: false,
    remoteTerminal: { host: 'dev.example.test', user: 'dev' },
  })

  const updated = updateWorkspace(existing, {
    config: { initialCommand: undefined },
  })

  assert.equal(updated.config.initialCommand, undefined)
  assert.equal(updated.config.terminalHistoryEnabled, false)
  assert.deepEqual(updated.config.remoteTerminal, { host: 'dev.example.test', user: 'dev' })
})

test('normalizes selected repositories through workspace creation and update', () => {
  const created = createWorkspaceFromInput({
    name: 'Created',
    rootFolderPath: '/repo',
    sourceControlRepositoryPaths: ['.', './packages//web/', 'packages/./web', '/absolute'],
  } as Parameters<typeof createWorkspaceFromInput>[0])
  assert.deepEqual(sourceControlPaths(created), ['.', 'packages/web'])

  const preserved = workspace('preserved-selection', undefined, '/repo')
  ;(preserved.config as SourceControlConfig).sourceControlRepositoryPaths = ['apps/web']
  const unchanged = updateWorkspace(preserved, {
    config: { rootFolderPath: ' /repo ', sourceControlRepositoryPaths: ['src/./app', 'src//app'] },
  } as Parameters<typeof updateWorkspace>[1])
  assert.deepEqual(sourceControlPaths(unchanged), ['src/app'])

  const changed = updateWorkspace(unchanged, {
    config: { rootFolderPath: '/other-repo', sourceControlRepositoryPaths: ['still/unsafe?'] },
  } as Parameters<typeof updateWorkspace>[1])
  assert.deepEqual(sourceControlPaths(changed), ['still/unsafe?'])

  const cleared = updateWorkspace(changed, {
    config: { rootFolderPath: undefined },
  } as Parameters<typeof updateWorkspace>[1])
  assert.equal(cleared.config.rootFolderPath, undefined)
  assert.deepEqual(sourceControlPaths(cleared), [])
})

test('awaits beforeDelete and preserves workspace state when it fails', async () => {
  const callbackOrder: string[] = []
  const removable = await ipcMain.invoke('workspace:create', { name: 'Callback removable' }) as Workspace

  workspaceModule.registerWorkspaceIPC({
    beforeDelete: async (workspaceId) => {
      callbackOrder.push(`start:${workspaceId}`)
      await new Promise((resolve) => setTimeout(resolve, 10))
      callbackOrder.push(`end:${workspaceId}`)
    },
  })

  await ipcMain.invoke('workspace:delete', removable.id)
  assert.deepEqual(callbackOrder, [`start:${removable.id}`, `end:${removable.id}`])
  assert.equal((await ipcMain.invoke('workspace:list') as Workspace[]).some((workspace) => workspace.id === removable.id), false)

  const preserved = await ipcMain.invoke('workspace:create', { name: 'Callback preserved' }) as Workspace
  const callbackError = new Error('terminal cleanup failed')
  workspaceModule.registerWorkspaceIPC({
    beforeDelete: async (workspaceId) => {
      assert.equal(workspaceId, preserved.id)
      throw callbackError
    },
  })

  await assert.rejects(ipcMain.invoke('workspace:delete', preserved.id), callbackError)
  assert.equal((await ipcMain.invoke('workspace:list') as Workspace[]).some((workspace) => workspace.id === preserved.id), true)
  await access(preserved.path)
})

test('calls beforeDelete for exact management removals only', async () => {
  const created = await ipcMain.invoke('workspace:create', { name: 'Management callback target' }) as Workspace
  const callbackIds: string[] = []
  workspaceModule.registerWorkspaceIPC({
    beforeDelete: async (workspaceId) => {
      callbackIds.push(workspaceId)
    },
  })

  await ipcMain.invoke('workspace:rename', created.id, 'Management callback renamed')
  await ipcMain.invoke('workspace:commitManagementChanges', {
    workspaces: (await ipcMain.invoke('workspace:list') as Workspace[])
      .map((workspace) => ({ id: workspace.id, name: workspace.name }))
      .reverse(),
  })
  assert.deepEqual(callbackIds, [])

  const current = await ipcMain.invoke('workspace:list') as Workspace[]
  const result = await ipcMain.invoke('workspace:commitManagementChanges', {
    workspaces: current
      .filter((workspace) => workspace.id !== created.id)
      .map((workspace) => ({ id: workspace.id, name: workspace.name })),
  }) as { removedWorkspaceIds: string[] }

  assert.deepEqual(result.removedWorkspaceIds, [created.id])
  assert.deepEqual(callbackIds, [created.id])
})

test('preserves management state when beforeDelete fails', async () => {
  const preserved = await ipcMain.invoke('workspace:create', { name: 'Management callback preserved' }) as Workspace
  const callbackError = new Error('management terminal cleanup failed')
  workspaceModule.registerWorkspaceIPC({
    beforeDelete: async (workspaceId) => {
      assert.equal(workspaceId, preserved.id)
      throw callbackError
    },
  })

  const current = await ipcMain.invoke('workspace:list') as Workspace[]
  await assert.rejects(ipcMain.invoke('workspace:commitManagementChanges', {
    workspaces: current
      .filter((workspace) => workspace.id !== preserved.id)
      .map((workspace) => ({ id: workspace.id, name: workspace.name })),
  }), callbackError)

  assert.equal((await ipcMain.invoke('workspace:list') as Workspace[]).some((workspace) => workspace.id === preserved.id), true)
  await access(preserved.path)
})

async function readStoredConfig(): Promise<string | null> {
  try {
    return await readFile(join(ipcConfigRoot, 'config.json'), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function restoreStoredConfig(previous: string | null): Promise<void> {
  const configPath = join(ipcConfigRoot, 'config.json')
  if (previous === null) await rm(configPath, { force: true })
  else await writeFile(configPath, previous, 'utf8')
}

test('keeps an unparsable config byte for byte instead of rewriting it', async () => {
  const configPath = join(ipcConfigRoot, 'config.json')
  const corrupt = '{"workspaces":[{"id":"broken"'
  const previous = await readStoredConfig()
  await writeFile(configPath, corrupt, 'utf8')

  try {
    await assert.rejects(workspaceModule.initWorkspaces())
    assert.deepEqual(await readFile(configPath), Buffer.from(corrupt, 'utf8'))

    await assert.rejects(ipcMain.invoke('workspace:list'))
    assert.deepEqual(await readFile(configPath), Buffer.from(corrupt, 'utf8'))

    await assert.rejects(ipcMain.invoke('workspace:create', { name: 'Must not persist' }))
    assert.deepEqual(await readFile(configPath), Buffer.from(corrupt, 'utf8'))
  } finally {
    await restoreStoredConfig(previous)
  }
})

test('creates an empty config file on first run', async () => {
  const configPath = join(ipcConfigRoot, 'config.json')
  const previous = await readStoredConfig()
  await rm(configPath, { force: true })

  try {
    await workspaceModule.initWorkspaces()

    const created = JSON.parse(await readFile(configPath, 'utf8')) as {
      workspaces: unknown[]
      activeWorkspaceId: string
    }
    assert.deepEqual(created.workspaces, [])
    assert.equal(created.activeWorkspaceId, '')
  } finally {
    await restoreStoredConfig(previous)
  }
})
