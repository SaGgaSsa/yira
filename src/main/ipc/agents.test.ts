import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

async function source(relativePath: string): Promise<string> {
  return readFile(resolve(repositoryRoot, relativePath), 'utf8')
}

test('registers restricted agent availability, snapshot/subscription, and history channels', async () => {
  const text = await source('src/main/ipc/agents.ts')
  assert.match(text, /ipcMain\.handle\('agents:availability'/)
  assert.match(text, /ipcMain\.handle\('agents:sessions:snapshot'/)
  assert.match(text, /ipcMain\.handle\('agents:sessions:subscribe'/)
  assert.match(text, /ipcMain\.handle\('agents:sessions:unsubscribe'/)
  assert.match(text, /ipcMain\.handle\('agents:history'/)
  assert.match(text, /normalizeAgentHistoryQuery/)
  assert.match(text, /getWorkspaceRootFolderById/)
  assert.match(text, /try\s*\{[\s\S]*sender\.send\(/)
  assert.match(text, /removeListener\('destroyed'/)
  assert.doesNotMatch(text, /rootPath:\s*(?:query|input)/)
})

test('exposes only normalized agent contracts through preload', async () => {
  const text = await source('src/preload/index.ts')
  assert.match(text, /agents:\s*\{/)
  assert.match(text, /ipcRenderer\.invoke\('agents:availability'/)
  assert.match(text, /ipcRenderer\.invoke\('agents:sessions:snapshot'/)
  assert.match(text, /ipcRenderer\.invoke\('agents:history'/)
  assert.match(text, /agents:sessions:changed/)
  assert.doesNotMatch(text, /agents[^\n]*readFile|agents[^\n]*rootPath/)
})

test('declares the agent bridge and registers it from main', async () => {
  const declaration = await source('src/renderer/src/electron.d.ts')
  const preload = await source('src/preload/index.ts')
  const main = await source('src/main/index.ts')
  assert.match(declaration, /agents:\s*\{/)
  assert.match(declaration, /AgentSessionHistoryResult/)
  assert.match(declaration, /onSessionsChanged/)
  assert.match(preload, /AgentSessionHistoryResult/)
  assert.match(main, /registerAgentsIPC\(\)/)
})
