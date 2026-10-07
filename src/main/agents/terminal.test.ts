import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'

import { AgentSessionRegistry } from './registry'
import {
  buildAgentTerminalLaunch,
  createAgentTerminalExitGate,
  classifyAgentInput,
  createAgentTerminalLifecycle,
  isTerminalProtocolReply,
} from './terminal'

test('builds a new agent launch from the fixed provider command and workspace root', () => {
  assert.deepEqual(buildAgentTerminalLaunch({
    tileId: 'tile-1',
    workspaceId: 'workspace-1',
    workspaceRoot: '/workspace/project',
    fallbackCwd: '/fallback',
    providerConfig: { enabled: true, args: ['--model', 'sonnet'] },
    agent: { provider: 'claude' },
  }), {
    provider: 'claude',
    command: 'claude',
    args: ['--model', 'sonnet'],
    cwd: resolve('/workspace/project'),
    sessionId: 'tile-1',
  })
})

test('builds a safe resume launch in the history workspace-relative cwd', () => {
  assert.deepEqual(buildAgentTerminalLaunch({
    tileId: 'tile-2',
    workspaceId: 'workspace-1',
    workspaceRoot: '/workspace/project',
    fallbackCwd: '/fallback',
    providerConfig: { enabled: true, args: ['--profile', 'work'] },
    agent: { provider: 'codex', sessionId: 'session-123', cwd: 'packages/app' },
  }), {
    provider: 'codex',
    command: 'codex',
    args: ['--profile', 'work', 'resume', 'session-123'],
    cwd: resolve('/workspace/project', 'packages/app'),
    sessionId: 'session-123',
  })
})

test('rejects agent launch paths that escape the workspace', () => {
  assert.throws(() => buildAgentTerminalLaunch({
    tileId: 'tile-3',
    workspaceId: 'workspace-1',
    workspaceRoot: '/workspace/project',
    fallbackCwd: '/fallback',
    agent: { provider: 'claude', sessionId: 'session-123', cwd: '../outside' },
  }), /agent cwd/i)
})

test('rejects disabled providers and invalid resume identifiers before a PTY can spawn', () => {
  assert.throws(() => buildAgentTerminalLaunch({
    tileId: 'tile-3a',
    workspaceId: 'workspace-1',
    workspaceRoot: '/workspace/project',
    fallbackCwd: '/fallback',
    providerConfig: { enabled: false, args: [] },
    agent: { provider: 'claude' },
  }), /disabled/i)
  assert.throws(() => buildAgentTerminalLaunch({
    tileId: 'tile-3b',
    workspaceId: 'workspace-1',
    workspaceRoot: '/workspace/project',
    fallbackCwd: '/fallback',
    agent: { provider: 'codex', sessionId: '../outside' },
  }), /resume id/i)
})

test('maps agent alerts, input, and PTY exit into runtime lifecycle without marking focus done', () => {
  const registry = new AgentSessionRegistry()
  registry.register({
    sessionId: 'session-1',
    tileId: 'tile-4',
    workspaceId: 'workspace-1',
    provider: 'codex',
  })
  const lifecycle = createAgentTerminalLifecycle({
    registry,
    tileId: 'tile-4',
    workspaceId: 'workspace-1',
  })

  assert.equal(lifecycle.onAlert({ provider: 'codex', event: 'completed', tileId: 'tile-4' }), true)
  assert.equal(registry.get('workspace-1', 'tile-4')?.status, 'done')
  assert.equal(lifecycle.onFocus(), true)
  assert.equal(registry.get('workspace-1', 'tile-4')?.status, 'done')
  assert.equal(lifecycle.onInput('\u001b[I'), false)
  assert.equal(registry.get('workspace-1', 'tile-4')?.status, 'done')
  assert.equal(lifecycle.onInput('yes\r'), true)
  assert.equal(registry.get('workspace-1', 'tile-4')?.status, 'working')
  assert.equal(lifecycle.onExit(), true)
  assert.equal(registry.get('workspace-1', 'tile-4')?.status, 'exited')
  assert.equal(lifecycle.onInput('late input'), false)
})

test('defers an immediate PTY exit until the runtime session registration is complete', () => {
  const registry = new AgentSessionRegistry()
  registry.register({
    sessionId: 'session-5',
    tileId: 'tile-5',
    workspaceId: 'workspace-1',
    provider: 'claude',
  })
  const lifecycle = createAgentTerminalLifecycle({
    registry,
    tileId: 'tile-5',
    workspaceId: 'workspace-1',
  })
  const gate = createAgentTerminalExitGate(() => lifecycle.onExit())
  let registered = false
  const term = {
    onExit: (callback: () => void) => {
      callback()
      assert.equal(registered, false)
    },
  }

  term.onExit(gate.handle)
  assert.equal(registry.get('workspace-1', 'tile-5')?.status, 'working')
  registered = true
  gate.markRegistered()
  assert.equal(registry.get('workspace-1', 'tile-5')?.status, 'exited')
})

test('normalizes padded workspace and tile IDs before lifecycle registry calls', () => {
  const registry = new AgentSessionRegistry()
  registry.register({
    sessionId: 'session-6',
    tileId: 'tile-6',
    workspaceId: 'workspace-1',
    provider: 'codex',
  })
  const lifecycle = createAgentTerminalLifecycle({
    registry,
    tileId: ' tile-6 ',
    workspaceId: ' workspace-1 ',
  })

  assert.equal(lifecycle.onAlert({ provider: 'codex', event: 'permission', tileId: ' tile-6 ' }), true)
  assert.equal(registry.get('workspace-1', 'tile-6')?.status, 'needs-input')
  assert.equal(lifecycle.onInput('yes\r'), true)
  assert.equal(registry.get('workspace-1', 'tile-6')?.status, 'working')
})

test('recognizes terminal protocol replies but not typed input', () => {
  const replies = [
    '\u001b[I',
    '\u001b[O',
    '\u001b[24;80R',
    '\u001b[0n',
    '\u001b[?62;22c',
    '\u001b[>0;276;0c',
    '\u001b[?1u',
    '\u001b[?2004;1$y',
    '\u001b[8;24;80t',
    '\u001b[<0;10;5M',
    '\u001b]11;rgb:0000/0000/0000\u0007',
    '\u001b]10;rgb:ffff/ffff/ffff\u001b\\',
    '\u001bP1$r0m\u001b\\',
    '\u001b[O\u001b[I',
  ]
  for (const reply of replies) assert.equal(isTerminalProtocolReply(reply), true, JSON.stringify(reply))

  const typed = ['a', 'yes\r', '\r', '\u001b', '\u001b[A', '\u001b[1;5C', '\u001b[200~text\u001b[201~', '\u001b[Ix', '\u0003']
  for (const input of typed) assert.equal(isTerminalProtocolReply(input), false, JSON.stringify(input))
})

test('classifies agent input so only a submitted line starts a turn', () => {
  assert.equal(classifyAgentInput(''), null)
  assert.equal(classifyAgentInput('\u001b[I'), null)
  assert.equal(classifyAgentInput('a'), 'typing')
  assert.equal(classifyAgentInput('\u001b[A'), 'typing')
  assert.equal(classifyAgentInput('\u001b\r'), 'typing')
  assert.equal(classifyAgentInput('\u001b[200~line one\rline two\u001b[201~'), 'typing')
  assert.equal(classifyAgentInput('\r'), 'submit')
  assert.equal(classifyAgentInput('\u001b[200~pasted\u001b[201~\r'), 'submit')
  assert.equal(classifyAgentInput('\u001b'), 'interrupt')
  assert.equal(classifyAgentInput('\u0003'), 'interrupt')
})
