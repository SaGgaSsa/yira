import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

async function source(relativePath: string): Promise<string> {
  return readFile(resolve(repositoryRoot, relativePath), 'utf8')
}

test('keeps ordinary agent hooks while hiding Yira-managed Claude statusLine setup', async () => {
  const settings = await source('src/main/ipc/settings.ts')
  const preload = await source('src/preload/index.ts')
  const declaration = await source('src/renderer/src/electron.d.ts')
  const panel = await source('src/renderer/src/components/SettingsPanel.tsx')
  const managedConfigurationImport = ['claudeUsage', 'StatusLineConfiguration'].join('')
  const managedStatusLineChannel = ['agentUsage:claudeStatus', 'Line:'].join('')

  assert.match(settings, /agentHooks:configure/)
  assert.match(settings, /agentHooks:uninstall/)
  assert.doesNotMatch(settings, new RegExp(managedConfigurationImport))
  assert.doesNotMatch(settings, new RegExp(managedStatusLineChannel))
  assert.match(preload, /configureAgentHooks/)
  assert.match(preload, /uninstallAgentHooks/)
  assert.doesNotMatch(preload, /ClaudeUsageStatusLine/)
  assert.match(declaration, /configureAgentHooks/)
  assert.match(declaration, /uninstallAgentHooks/)
  assert.doesNotMatch(declaration, /ClaudeUsageStatusLine/)
  assert.match(panel, /configureAgentHooks/)
  assert.match(panel, /uninstallAgentHooks/)
  assert.doesNotMatch(panel, /Claude usage status line/)
})
