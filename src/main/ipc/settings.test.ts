import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

async function source(relativePath: string): Promise<string> {
  return readFile(resolve(repositoryRoot, relativePath), 'utf8')
}

test('exposes explicit Claude usage statusLine setup without replacing agent hooks', async () => {
  const settings = await source('src/main/ipc/settings.ts')
  const preload = await source('src/preload/index.ts')
  const declaration = await source('src/renderer/src/electron.d.ts')
  const panel = await source('src/renderer/src/components/SettingsPanel.tsx')

  assert.match(settings, /agentUsage:claudeStatusLine:install/)
  assert.match(settings, /agentUsage:claudeStatusLine:uninstall/)
  assert.match(settings, /installClaudeUsageStatusLineConfiguration/)
  assert.match(preload, /installClaudeUsageStatusLine/)
  assert.match(preload, /uninstallClaudeUsageStatusLine/)
  assert.match(declaration, /installClaudeUsageStatusLine/)
  assert.match(declaration, /uninstallClaudeUsageStatusLine/)
  assert.match(panel, /installClaudeUsageStatusLine/)
  assert.match(panel, /uninstallClaudeUsageStatusLine/)
  assert.doesNotMatch(settings, /installClaudeUsageStatusLineConfiguration\([^)]*agentHooks/)
})
