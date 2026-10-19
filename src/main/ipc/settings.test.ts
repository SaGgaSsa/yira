import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { DEFAULT_USER_SETTINGS } from '@shared/types'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

async function source(relativePath: string): Promise<string> {
  return readFile(resolve(repositoryRoot, relativePath), 'utf8')
}

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown

class FakeIpcMain {
  readonly handlers = new Map<string, IpcHandler>()

  handle(channel: string, handler: IpcHandler): void {
    this.handlers.set(channel, handler)
  }

  call(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
    return Promise.resolve(handler({}, ...args))
  }
}

function loadSettingsIPC(ipcMain: FakeIpcMain): typeof import('./settings') {
  const nodeRequire = createRequire(import.meta.url)
  const nodeModule = nodeRequire('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
    _cache: Record<string, unknown>
  }
  const originalLoad = nodeModule._load
  const modulePath = nodeRequire.resolve('./settings.ts')
  const fakeElectron = {
    app: { getLocale: () => 'en' },
    ipcMain,
  }

  nodeModule._load = function(request, parent, isMain) {
    if (request === 'electron') return fakeElectron
    if (request === '@electron-toolkit/utils') return { is: { dev: true } }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    delete nodeModule._cache[modulePath]
    return nodeRequire(modulePath) as typeof import('./settings')
  } finally {
    nodeModule._load = originalLoad
  }
}

test('exposes managed Claude statusLine setup alongside ordinary agent hooks', async () => {
  const settings = await source('src/main/ipc/settings.ts')
  const preload = await source('src/preload/index.ts')
  const declaration = await source('src/renderer/src/electron.d.ts')
  const panel = await source('src/renderer/src/components/SettingsPanel.tsx')
  assert.match(settings, /agentHooks:configure/)
  assert.match(settings, /agentHooks:uninstall/)
  assert.match(settings, /claudeStatusLine:status/)
  assert.match(settings, /claudeStatusLine:install/)
  assert.match(settings, /claudeStatusLine:uninstall/)
  assert.match(settings, /CLAUDE_CONFIG_DIR/)
  assert.match(settings, /language: hasLanguage \? parsed\.language : resolveSupportedLanguage\(app\.getLocale\(\)\)/)
  assert.match(settings, /setMainLanguage\(defaults\.language\)/)
  assert.match(settings, /normalizeShortcutSettings\(rawSettings\.shortcuts\)/)
  assert.match(settings, /CONFIGURABLE_SHORTCUT_IDS\.some\(\(id\) => parsed\?\.shortcuts\?\.\[id\] !== normalized\.shortcuts\[id\]\)/)
  assert.doesNotMatch(settings, /function normalizeShortcut\(/)
  assert.doesNotMatch(settings, /if \(value === ''\)/)
  assert.match(preload, /configureAgentHooks/)
  assert.match(preload, /uninstallAgentHooks/)
  assert.match(preload, /getClaudeStatusLineStatus/)
  assert.match(preload, /installClaudeStatusLine/)
  assert.match(preload, /uninstallClaudeStatusLine/)
  assert.match(declaration, /configureAgentHooks/)
  assert.match(declaration, /uninstallAgentHooks/)
  assert.match(declaration, /ClaudeStatusLineState/)
  assert.match(declaration, /ClaudeStatusLineMutationResult/)
  assert.match(panel, /configureAgentHooks/)
  assert.match(panel, /uninstallAgentHooks/)
  assert.doesNotMatch(panel, /Claude usage status line/)
})

test('notifies onSave only when agent provider settings change', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-settings-'))
  const previousHome = process.env.YIRA_HOME
  process.env.YIRA_HOME = directory
  try {
    const ipcMain = new FakeIpcMain()
    const { registerSettingsIPC } = loadSettingsIPC(ipcMain)
    let saves = 0
    registerSettingsIPC({ onSave: () => { saves += 1 } })

    const settings = {
      ...DEFAULT_USER_SETTINGS,
      agents: { claude: { enabled: true }, codex: { enabled: true } },
    }
    await ipcMain.call('settings:save', settings)
    assert.equal(saves, 1)

    await ipcMain.call('settings:save', { ...settings, interfaceFontSizePx: 18 })
    assert.equal(saves, 1)

    await ipcMain.call('settings:save', {
      ...settings,
      agents: { claude: { enabled: true }, codex: { enabled: false } },
    })
    assert.equal(saves, 2)
  } finally {
    if (previousHome === undefined) delete process.env.YIRA_HOME
    else process.env.YIRA_HOME = previousHome
    await rm(directory, { recursive: true, force: true })
  }
})
