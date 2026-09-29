import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

async function source(relativePath: string): Promise<string> {
  return readFile(resolve(repositoryRoot, relativePath), 'utf8')
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
