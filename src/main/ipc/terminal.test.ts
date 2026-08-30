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
  assert.match(text, /delivery\.dispose\(\)/)

  const detachStart = text.indexOf("ipcMain.handle('terminal:detach'")
  assert.ok(detachStart >= 0, 'terminal:detach handler must remain available')
  const detachBlock = text.slice(detachStart)
  assert.match(detachBlock, /delivery\.detach\(/)
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

test('uses workspace-scoped terminal targets and delivery-owned state', async () => {
  const text = await source('src/main/ipc/terminal.ts')

  assert.match(text, /TerminalSessionTarget/)
  assert.match(text, /terminalSessionLookupKey/)
  assert.match(text, /TerminalDelivery<WebContents>/)
  assert.match(text, /terminalSessionManager\.get\(terminalSessionLookupKey\(/)
  assert.match(text, /delivery\.append\(data\)/)
  assert.match(text, /delivery\.recordExit\(exitEvent\)/)
  assert.match(text, /delivery\.snapshot\(\)/)
  assert.doesNotMatch(text, /listeners:\s*Set<WebContents>/)
  assert.doesNotMatch(text, /buffer:\s*string/)
  assert.doesNotMatch(text, /exitEvent\?:\s*TerminalExitEvent/)
  assert.doesNotMatch(text, /new TerminalExitState/)
  assert.doesNotMatch(text, /terminal:data:\$\{runtimeTileId\}/)
})

test('validates targets and assigns a new generation after destruction', async () => {
  const text = await source('src/main/ipc/terminal.ts')
  const createStart = text.indexOf("ipcMain.handle('terminal:create'")
  const createBlock = text.slice(createStart)

  assert.match(createBlock, /target:\s*TerminalSessionTarget/)
  assert.match(text, /normalizeAgentOpaqueId/)
  assert.match(text, /Invalid terminal workspace id/)
  assert.match(text, /terminalSessionGenerations/)
  assert.match(text, /generation\s*[:=]/)
})

test('uses explicit workspace targets for every terminal action', async () => {
  const text = await source('src/main/ipc/terminal.ts')

  const createStart = text.indexOf("ipcMain.handle('terminal:create'")
  assert.ok(createStart >= 0, 'terminal:create handler must be registered')
  assert.match(text.slice(createStart, createStart + 1_200), /target:\s*TerminalSessionTarget/)

  for (const channel of [
    'terminal:write',
    'terminal:resize',
    'terminal:destroy',
    'terminal:detach',
    'terminal:acknowledgeAgentAlert',
  ]) {
    const start = text.indexOf(`ipcMain.handle('${channel}'`)
    assert.ok(start >= 0, `${channel} handler must be registered`)
    const block = text.slice(start, start + 1_200)
    assert.match(block, /identity:\s*TerminalSessionIdentity/, `${channel} must accept the complete session identity`)
  }
})

test('detaches listeners by identity and disposes delivery only on destruction', async () => {
  const text = await source('src/main/ipc/terminal.ts')

  assert.match(text, /delivery\.detach\(runtimeIdentity, event\.sender\)/)
  assert.match(text, /session\.delivery\.dispose\(\)/)
  assert.match(text, /onProcessExit/)
  assert.match(text, /onDispose/)
})

test('rejects stale terminal identities before any session action', async () => {
  const text = await source('src/main/ipc/terminal.ts')

  assert.match(text, /sameTerminalSessionIdentity/)
  assert.match(text, /getTerminalSession\((?:identity|runtimeIdentity)\)/)
  for (const channel of [
    'terminal:write',
    'terminal:resize',
    'terminal:destroy',
    'terminal:detach',
    'terminal:acknowledgeAgentAlert',
  ]) {
    const start = text.indexOf(`ipcMain.handle('${channel}'`)
    assert.ok(start >= 0, `${channel} handler must be registered`)
    const block = text.slice(start, start + 1_200)
    assert.match(block, /identity:\s*TerminalSessionIdentity/, `${channel} must use complete identity`)
    assert.match(block, /getTerminalSession\((?:identity|runtimeIdentity)\)/, `${channel} must verify identity before action`)
  }
})

test('cleans every attached renderer with the delivery identity', async () => {
  const text = await source('src/main/ipc/terminal.ts')

  assert.match(text, /function attachTerminalListener\(/)
  assert.match(text, /sender\.once\('destroyed'/)
  assert.match(text, /delivery\.detach\(identity, sender\)/)
})

test('defers renderer attachment until terminal:attach verifies the complete identity', async () => {
  const text = await source('src/main/ipc/terminal.ts')
  const createStart = text.indexOf("ipcMain.handle('terminal:create'")
  const attachStart = text.indexOf("ipcMain.handle('terminal:attach'")

  assert.ok(createStart >= 0, 'terminal:create must be registered')
  assert.ok(attachStart > createStart, 'terminal:attach must be registered after terminal:create')

  const createBlock = text.slice(createStart, attachStart)
  assert.doesNotMatch(createBlock, /attachTerminalListener\(/)
  assert.doesNotMatch(createBlock, /alertListeners:\s*new Set\(\[event\.sender\]\)/)

  const attachBlock = text.slice(attachStart, attachStart + 1_400)
  assert.match(attachBlock, /identity:\s*TerminalSessionIdentity/)
  assert.match(attachBlock, /normalizeTerminalSessionIdentity\(identity\)/)
  assert.match(attachBlock, /getTerminalSession\(runtimeIdentity\)/)
  assert.match(attachBlock, /attachTerminalListener\(/)
  assert.match(attachBlock, /delivery\.snapshot\(\)/)
})

test('keeps user-requested current destruction separate from generation-checked lifecycle destruction', async () => {
  const text = await source('src/main/ipc/terminal.ts')
  const currentDestroyStart = text.indexOf("ipcMain.handle('terminal:destroyCurrent'")
  assert.ok(currentDestroyStart >= 0, 'terminal:destroyCurrent must be registered')

  const currentDestroyBlock = text.slice(currentDestroyStart, currentDestroyStart + 1_200)
  assert.match(currentDestroyBlock, /target:\s*TerminalSessionTarget/)
  assert.match(currentDestroyBlock, /normalizeTerminalSessionTarget\(target, false\)/)
  assert.match(currentDestroyBlock, /getTerminalSession\(runtimeTarget\)/)
  assert.match(currentDestroyBlock, /destroyTerminalSession\(runtimeTarget\)/)

  const destroyHelperStart = text.indexOf('function destroyTerminalSession(')
  assert.ok(destroyHelperStart >= 0, 'current terminal destruction must have a shared kill path')
  const destroyHelperBlock = text.slice(destroyHelperStart, destroyHelperStart + 500)
  assert.match(destroyHelperBlock, /terminalSessionManager\.delete\(terminalSessionLookupKey\(target\)\)/)
  assert.match(destroyHelperBlock, /\.pty\.kill\(\)/)

  const identityDestroyStart = text.indexOf("ipcMain.handle('terminal:destroy'")
  assert.ok(identityDestroyStart >= 0, 'terminal:destroy must remain registered')
  const identityDestroyBlock = text.slice(identityDestroyStart, currentDestroyStart)
  assert.match(identityDestroyBlock, /identity:\s*TerminalSessionIdentity/)
  assert.match(identityDestroyBlock, /getTerminalSession\(runtimeIdentity\)/)
})
