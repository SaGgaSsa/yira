import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { DeferredTerminalStartupCommand } from '../terminalStartupCommand'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

async function source(relativePath: string): Promise<string> {
  return readFile(resolve(repositoryRoot, relativePath), 'utf8')
}

test('owns terminal sessions through a singleton manager and exposes app shutdown', async () => {
  const text = await source('src/main/ipc/terminal.ts')

  assert.match(text, /TerminalSessionManager/)
  assert.match(text, /new TerminalSessionManager\(\)/)
  assert.match(text, /export function shutdownTerminalSessions\(\): Promise<TerminalShutdownResult>/)
  assert.match(text, /terminalSessionManager\.shutdownAll\(\)/)
  assert.match(text, /terminalSessionManager\.isAcceptingSessions\(\)/)
})

test('gates spawning and cleans renderer listeners while detach never kills the PTY', async () => {
  const text = await source('src/main/ipc/terminal.ts')
  const spawnIndex = text.indexOf('pty.spawn(')
  const gateIndex = text.lastIndexOf('terminalSessionManager.isAcceptingSessions()', spawnIndex)

  assert.ok(spawnIndex >= 0, 'terminal:create must spawn through node-pty')
  assert.ok(gateIndex >= 0 && gateIndex < spawnIndex, 'shutdown gate must run before pty.spawn')
  assert.match(text, /listeners\.clear\(\)/)

  const detachStart = text.indexOf("ipcMain.handle('terminal:detach'")
  assert.ok(detachStart >= 0, 'terminal:detach handler must remain available')
  const detachBlock = text.slice(detachStart)
  assert.match(detachBlock, /listeners\.delete\(event\.sender\)/)
  assert.doesNotMatch(detachBlock, /\.kill\s*\(/)
})

test('reattaches existing sessions before rejecting new sessions during shutdown', async () => {
  const text = await source('src/main/ipc/terminal.ts')
  const createStart = text.indexOf("ipcMain.handle('terminal:create'")
  const existingIndex = text.indexOf('const existing = getTerminalSession', createStart)
  const rejectionIndex = text.indexOf("throw new Error('Terminal sessions are shutting down')", createStart)
  const spawnIndex = text.indexOf('pty.spawn(', createStart)
  const gateIndex = text.lastIndexOf('terminalSessionManager.isAcceptingSessions()', spawnIndex)

  assert.ok(createStart >= 0, 'terminal:create handler must be registered')
  assert.ok(existingIndex >= 0, 'terminal:create must look up an existing session')
  assert.ok(rejectionIndex > existingIndex, 'existing-session lookup must precede shutdown rejection')
  assert.ok(gateIndex >= 0 && gateIndex < spawnIndex, 'shutdown gate must remain before pty.spawn')
})

test('writes a startup command once after shell output becomes quiet', async () => {
  const writes: string[] = []
  const command = new DeferredTerminalStartupCommand({
    command: 'npm run dev',
    write: (data) => writes.push(data),
    quietPeriodMs: 10,
    fallbackMs: 100,
  })

  command.onOutput('loading profile')
  await delay(5)
  command.onOutput('prompt')
  await delay(5)
  assert.deepEqual(writes, [])

  await delay(10)
  assert.deepEqual(writes, ['npm run dev\r'])

  command.onOutput('later output')
  await delay(15)
  assert.deepEqual(writes, ['npm run dev\r'])
})

test('writes a startup command after the fallback when the shell stays silent', async () => {
  const writes: string[] = []
  const command = new DeferredTerminalStartupCommand({
    command: 'pwd',
    write: (data) => writes.push(data),
    quietPeriodMs: 5,
    fallbackMs: 10,
  })

  await delay(15)

  assert.deepEqual(writes, ['pwd\r'])
})
