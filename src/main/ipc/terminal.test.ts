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

test('routes terminal creation through the persistent daemon and uses daemon identity', async () => {
  const text = await source('src/main/ipc/terminal.ts')

  assert.match(text, /PersistentTerminalSessions/)
  assert.match(text, /connectTerminalDaemon\(options\)/)
  assert.match(text, /TERMINAL_DAEMON_DIRECTORY = join\(YIRA_HOME, 'terminal-runtime'\)/)
  assert.match(text, /directory:\s*TERMINAL_DAEMON_DIRECTORY/)
  assert.match(text, /executable:\s*process\.execPath/)
  assert.match(text, /entryPath:\s*join\(__dirname, 'terminalDaemon\.js'\)/)
  assert.match(text, /process\.platform !== 'linux'/)
  assert.match(text, /process\.env\.APPDIR !== dirname\(process\.execPath\)/)
  assert.match(text, /appImagePath: appImagePathForDaemon\(\)/)
  assert.match(text, /persistentTerminalSessions\.create\(/)
  assert.match(text, /persistentTerminalSessions\.rendererAttach\(/)
  assert.doesNotMatch(text, /pty\.spawn\(/)
  assert.doesNotMatch(text, /TerminalSessionManager/)
  assert.doesNotMatch(text, /TerminalDelivery/)
})

test('checks daemon attach before launch preparation and never attaches a renderer on create', async () => {
  const text = await source('src/main/persistentTerminalSessions.ts')
  const createStart = text.indexOf('create(')
  const attachIndex = text.indexOf("client.request('attach', target)", createStart)
  const buildIndex = text.indexOf('const spawn = await build()', createStart)

  assert.ok(createStart >= 0)
  assert.ok(attachIndex >= 0 && attachIndex < buildIndex)
  assert.doesNotMatch(text.slice(createStart, buildIndex), /rendererAttach/)
})

test('keeps remote preparation and WOL progress handlers in the main process', async () => {
  const text = await source('src/main/ipc/terminal.ts')

  assert.match(text, /terminal:prepareRemote/)
  assert.match(text, /ensureRemoteSshReady\(remoteTerminal, \{/)
  assert.match(text, /onProgress:\s*\(status\) => publishRemotePreparationProgress/)
  assert.match(text, /buildRemoteSshLaunch\(options\.remoteTerminal!/)
  assert.match(text, /remoteStartupCommand/)
})

test('passes startup and history commands only to a new local regular shell', async () => {
  const text = await source('src/main/ipc/terminal.ts')

  assert.match(text, /const initialCommand = agentShellCommand\?\.initialCommand\s*\?\?\s*\(!isRemoteSsh && !isAgent && options\.initialCommand\?\.trim\(\)/)
  assert.match(text, /historySetup = profile && !isAgent/)
  assert.match(text, /prependCommand: historySetup\.prependCommand/)
  assert.match(text, /local: !isRemoteSsh/)
})

test('launches agent tiles through the compatible shell and exits with the agent', async () => {
  const text = await source('src/main/ipc/terminal.ts')

  assert.match(text, /const agentShellProfile = isAgent \? resolveCompatibleAgentShellProfile\(\) : undefined/)
  assert.match(text, /shellProfileId: agentShellProfile!\.id[\s\S]*?exitWithAgent: true/)
  assert.match(text, /executable: isRemoteSsh \? sshClient! : agentShellProfile \? agentShellProfile\.shell : profile!\.shell/)
  assert.match(text, /: agentShellProfile\s+\? agentShellArgs\(agentShellProfile, agentShellCommand\)/)
  assert.match(text, /if \(launch\?\.replaceProfileArgs\) return \[\.\.\.\(launch\.shellArgs \?\? \[\]\)\]/)
  assert.match(text, /env: agentShellCommand \? \{ \.\.\.spawnEnv, \.\.\.agentShellCommand\.env \} : spawnEnv/)
  assert.match(text, /initialCommand = agentShellCommand\?\.initialCommand/)
  assert.match(text, /cwd: agentLaunch\?\.cwd \?\? terminalRoot\?\.cwd \?\? process\.cwd\(\)/)
  assert.match(text, /if \(terminalRoot && !agentLaunch\) args\.push\(\.\.\.terminalRoot\.spawnArgs\)/)
  assert.match(text, /historySetup = profile && !isAgent/)
})

test('launches Agents view sessions with exit behavior and PowerShell startup args', async () => {
  const text = await source('src/main/ipc/terminal.ts')
  const start = text.indexOf('export async function createAgentsViewSession')
  const end = text.indexOf('export function destroyAgentsViewSession', start)
  const agentsViewSession = text.slice(start, end)

  assert.ok(start >= 0 && end > start)
  assert.match(agentsViewSession, /platform: process\.platform,[\s\S]*?exitWithAgent: true,/)
  assert.match(agentsViewSession, /args: agentShellArgs\(shellProfile, launch\)/)
  assert.match(agentsViewSession, /\.\.\.\(launch\.initialCommand !== undefined \? \{ initialCommand: launch\.initialCommand \} : \{\}\)/)
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

test('registers workspace deletion before config removal and disconnects after close preparation', async () => {
  const workspace = await source('src/main/index.ts')
  assert.match(workspace, /registerWorkspaceIPC\(\{ beforeDelete: destroyWorkspaceTerminalSessions \}\)/)
  assert.match(workspace, /await shutdownTerminalSessions\(\)/)
  assert.match(workspace, /void hydrateTerminalSessions\(\)\.catch/)
})
