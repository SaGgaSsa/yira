import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyTerminalProcesses,
  detectAgent,
  isDelegatedAgentRun,
  TerminalProcessActivityMonitor,
  type TerminalProcessRoot,
} from './terminalProcessActivity'
import type { ProcessInfo } from './processTree'

const root: TerminalProcessRoot = { workspaceId: 'workspace', tileId: 'terminal', pid: 1 }

function proc(pid: number, ppid: number, name: string, args: string): ProcessInfo {
  return { pid, ppid, name, args }
}

function classify(processes: ProcessInfo[]) {
  return classifyTerminalProcesses(processes, [root])
}

test('detects native and Node-based agents on Windows and Linux', () => {
  assert.equal(detectAgent(proc(2, 1, 'claude.exe', 'claude.exe')), 'claude')
  assert.equal(detectAgent(proc(3, 1, 'node', 'node /home/user/node_modules/@openai/codex/bin/codex.js')), 'codex')
  assert.equal(detectAgent(proc(4, 1, 'node.exe', 'node.exe C:\\tools\\opencode-ai\\cli.js')), 'opencode')
  assert.equal(detectAgent(proc(5, 1, 'codex-x86_64-unknown-linux-musl', 'codex')), 'codex')
})

test('recognizes delegated subcommands without matching incidental path text', () => {
  assert.equal(isDelegatedAgentRun(proc(2, 1, 'codex.exe', 'codex.exe exec task'), 'codex'), true)
  assert.equal(isDelegatedAgentRun(proc(2, 1, 'codex', 'codex e task'), 'codex'), true)
  assert.equal(isDelegatedAgentRun(proc(2, 1, 'opencode', 'opencode run task'), 'opencode'), true)
  assert.equal(isDelegatedAgentRun(proc(2, 1, 'claude', 'claude --print task'), 'claude'), true)
  assert.equal(isDelegatedAgentRun(proc(2, 1, 'codex', '/tools/exec-wrapper/codex'), 'codex'), false)
})

test('an interactive Claude terminal without a delegated run does not count', () => {
  assert.deepEqual(classify([
    proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'claude.exe', 'claude'),
  ]), [])
})

test('counts delegated runs and keeps the first agent in the subtree', () => {
  assert.deepEqual(classify([
    proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'claude.exe', 'claude'),
    proc(3, 2, 'codex.exe', 'codex.exe exec task'),
  ]), [{ workspaceId: 'workspace', tileId: 'terminal', agent: 'claude' }])
  assert.equal(classify([proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'codex.exe', 'codex exec task')])[0]?.agent, 'codex')
})

test('omits idle agent trees and non-agent roots, and detects nested delegated agents', () => {
  assert.deepEqual(classify([
    proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'claude.exe', 'claude'),
    proc(3, 2, 'Pane.exe', 'Pane.exe --mcp'), proc(4, 2, 'bash.exe', 'bash -c helper'),
  ]), [])

  assert.deepEqual(classify([proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'node', 'node @openai/codex')]), [])
  assert.deepEqual(classify([
    proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'node', 'node @openai/codex/bin/codex.js'),
    proc(3, 2, 'codex.exe', 'codex.exe'), proc(4, 3, 'opencode.exe', 'opencode run task'),
  ]), [{ workspaceId: 'workspace', tileId: 'terminal', agent: 'codex' }])
  assert.deepEqual(classify([proc(1, 0, 'powershell.exe', '')]), [])
})

test('monitor emits only changes and emits an empty snapshot when roots disappear', async () => {
  let roots: TerminalProcessRoot[] = [root]
  let processes: ProcessInfo[] = [proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'codex.exe', 'codex exec task')]
  const changes: Array<{ terminals: unknown[] }> = []
  const monitor = new TerminalProcessActivityMonitor({
    listRoots: () => roots,
    listProcesses: async () => processes,
    onChange: (snapshot) => changes.push(snapshot as { terminals: unknown[] }),
  })

  await monitor.pollNow()
  await monitor.pollNow()
  assert.equal(changes.length, 1)
  assert.deepEqual(monitor.snapshot().terminals, [{ workspaceId: 'workspace', tileId: 'terminal', agent: 'codex' }])
  roots = []
  await monitor.pollNow()
  assert.equal(changes.length, 2)
  assert.deepEqual(monitor.snapshot(), { terminals: [] })
})

test('reported working terminals publish immediately and clear when the agent stops', () => {
  const changes: Array<{ terminals: unknown[] }> = []
  const monitor = new TerminalProcessActivityMonitor({
    listRoots: () => [],
    listProcesses: async () => [],
    onChange: (snapshot) => changes.push(snapshot as { terminals: unknown[] }),
  })
  const terminal = { workspaceId: 'workspace', tileId: 'terminal' }

  monitor.setReportedWorking(terminal, 'claude', true)
  assert.equal(changes.length, 1)
  assert.deepEqual(changes[0], { terminals: [{ ...terminal, agent: 'claude' }] })

  monitor.setReportedWorking(terminal, 'claude', false)
  assert.equal(changes.length, 2)
  assert.deepEqual(changes[1], { terminals: [] })
})

test('forgetTerminal removes a reported terminal', () => {
  const monitor = new TerminalProcessActivityMonitor({
    listRoots: () => [],
    listProcesses: async () => [],
    onChange: () => undefined,
  })
  const terminal = { workspaceId: 'workspace', tileId: 'terminal' }
  monitor.setReportedWorking(terminal, 'claude', true)

  monitor.forgetTerminal(terminal)

  assert.deepEqual(monitor.snapshot(), { terminals: [] })
})

test('a delegated run and a report for the same terminal do not duplicate it', async () => {
  const terminal = { workspaceId: 'workspace', tileId: 'terminal' }
  const monitor = new TerminalProcessActivityMonitor({
    listRoots: () => [{ ...terminal, pid: 1 }],
    listProcesses: async () => [proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'codex.exe', 'codex exec task')],
    onChange: () => undefined,
  })
  monitor.setReportedWorking(terminal, 'claude', true)

  await monitor.pollNow()

  assert.deepEqual(monitor.snapshot().terminals, [{ ...terminal, agent: 'codex' }])
})

test('a poll does not erase reported working terminals', async () => {
  const terminal = { workspaceId: 'workspace', tileId: 'terminal' }
  const monitor = new TerminalProcessActivityMonitor({
    listRoots: () => [],
    listProcesses: async () => [],
    onChange: () => undefined,
  })
  monitor.setReportedWorking(terminal, 'claude', true)

  await monitor.pollNow()

  assert.deepEqual(monitor.snapshot().terminals, [{ ...terminal, agent: 'claude' }])
})
