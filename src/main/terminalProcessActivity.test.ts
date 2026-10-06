import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  classifyTerminalProcesses,
  createClaudeSessionReader,
  detectAgent,
  isDelegatedAgentRun,
  TerminalProcessActivityMonitor,
  type ClassifyOptions,
  type TerminalProcessRoot,
} from './terminalProcessActivity'
import type { ProcessInfo } from './processTree'

const root: TerminalProcessRoot = { workspaceId: 'workspace', tileId: 'terminal', pid: 1 }
const emptyOptions: ClassifyOptions = {
  readClaudeSession: () => null,
  hasRecentClaudeSubagentActivity: () => false,
}

function proc(pid: number, ppid: number, name: string, args: string): ProcessInfo {
  return { pid, ppid, name, args }
}

function classify(processes: ProcessInfo[], options = emptyOptions) {
  return classifyTerminalProcesses(processes, [root], options)
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

test('classifies Claude busy, shell, and delegated child activity', () => {
  const busy = classify([proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'claude.exe', 'claude')], {
    ...emptyOptions,
    readClaudeSession: () => ({ status: 'busy' }),
  })
  assert.deepEqual(busy, [{ workspaceId: 'workspace', tileId: 'terminal', state: 'working', agent: 'claude' }])

  const shell = classify([proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'claude.exe', 'claude')], {
    ...emptyOptions,
    readClaudeSession: () => ({ status: 'shell' }),
  })
  assert.equal(shell[0]?.state, 'background')

  const delegated = classify([
    proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'claude.exe', 'claude'),
    proc(3, 2, 'codex.exe', 'codex.exe exec task'),
  ], {
    ...emptyOptions,
    readClaudeSession: () => ({ status: 'shell' }),
  })
  assert.equal(delegated[0]?.state, 'working')
})

test('omits idle agent trees and non-agent roots, and detects nested delegated agents', () => {
  assert.deepEqual(classify([
    proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'claude.exe', 'claude'),
    proc(3, 2, 'Pane.exe', 'Pane.exe --mcp'), proc(4, 2, 'bash.exe', 'bash -c helper'),
  ], { ...emptyOptions, readClaudeSession: () => ({ status: 'idle' }) }), [])

  assert.deepEqual(classify([proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'node', 'node @openai/codex')]), [])
  assert.equal(classify([
    proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'node', 'node @openai/codex/bin/codex.js'),
    proc(3, 2, 'codex.exe', 'codex.exe'), proc(4, 3, 'opencode.exe', 'opencode run task'),
  ])[0]?.state, 'working')
  assert.equal(classify([proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'codex.exe', 'codex exec task')])[0]?.agent, 'codex')
  assert.deepEqual(classify([proc(1, 0, 'powershell.exe', '')]), [])
})

test('recent Claude subagent activity makes an idle session working', () => {
  const result = classify([proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'claude.exe', 'claude')], {
    ...emptyOptions,
    readClaudeSession: () => ({ status: 'idle', sessionId: '889ff946-65d2-478f-b782-91c3bae95a85' }),
    hasRecentClaudeSubagentActivity: () => true,
  })
  assert.equal(result[0]?.state, 'working')
})

test('reports the conversation each Claude terminal is running, even when idle', () => {
  const reported: Array<{ tileId: string; sessionId: string }> = []
  const result = classify([proc(1, 0, 'bash', ''), proc(2, 1, 'claude', 'claude')], {
    ...emptyOptions,
    readClaudeSession: () => ({ status: 'idle', sessionId: '889ff946-65d2-478f-b782-91c3bae95a85' }),
    onClaudeSession: (sessionRoot, sessionId) => reported.push({ tileId: sessionRoot.tileId, sessionId }),
  })
  assert.deepEqual(result, [])
  assert.deepEqual(reported, [{ tileId: 'terminal', sessionId: '889ff946-65d2-478f-b782-91c3bae95a85' }])
})

test('reads bounded Claude session files and finds recent project subagent files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-claude-reader-'))
  const sessionId = '889ff946-65d2-478f-b782-91c3bae95a85'
  const now = Date.now()
  try {
    await mkdir(join(directory, 'sessions'), { recursive: true })
    await mkdir(join(directory, 'projects', 'project-slug', sessionId, 'subagents'), { recursive: true })
    await writeFile(join(directory, 'sessions', '88.json'), JSON.stringify({ pid: 88, status: 'busy', sessionId }))
    const transcript = join(directory, 'projects', 'project-slug', sessionId, 'subagents', 'agent-1.jsonl')
    await writeFile(transcript, '{}\n')
    await utimes(transcript, now / 1000, now / 1000)

    const reader = createClaudeSessionReader({ claudeDir: directory, now: () => now })
    assert.deepEqual(reader.readClaudeSession(88), { status: 'busy', sessionId })
    assert.equal(reader.readClaudeSession(89), null)
    assert.equal(reader.hasRecentClaudeSubagentActivity(sessionId), true)
    assert.equal(reader.hasRecentClaudeSubagentActivity('../unsafe'), false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('monitor emits only changes and emits an empty snapshot when roots disappear', async () => {
  let roots: TerminalProcessRoot[] = [root]
  let processes: ProcessInfo[] = [proc(1, 0, 'powershell.exe', ''), proc(2, 1, 'codex.exe', 'codex exec task')]
  const changes: Array<{ terminals: unknown[] }> = []
  const monitor = new TerminalProcessActivityMonitor({
    listRoots: () => roots,
    listProcesses: async () => processes,
    reader: emptyOptions,
    onChange: (snapshot) => changes.push(snapshot as { terminals: unknown[] }),
  })

  await monitor.pollNow()
  await monitor.pollNow()
  assert.equal(changes.length, 1)
  assert.equal(monitor.snapshot().terminals[0]?.state, 'working')
  roots = []
  await monitor.pollNow()
  assert.equal(changes.length, 2)
  assert.deepEqual(monitor.snapshot(), { terminals: [] })
})
