import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  buildAgentTerminalLaunch,
  isAgentUserInput,
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
    args: ['--profile', 'work', 'resume', 'session-123', '--no-alt-screen'],
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

test('recognizes user input so typing can be recorded without changing the agent state', () => {
  assert.equal(isAgentUserInput(''), false)
  assert.equal(isAgentUserInput('\u001b[I'), false)
  assert.equal(isAgentUserInput('a'), true)
  assert.equal(isAgentUserInput('\u001b[A'), true)
  assert.equal(isAgentUserInput('\u001b\r'), true)
  assert.equal(isAgentUserInput('\u001b[200~line one\rline two\u001b[201~'), true)
  assert.equal(isAgentUserInput('\r'), true)
  assert.equal(isAgentUserInput('\u001b[200~pasted\u001b[201~\r'), true)
  assert.equal(isAgentUserInput('\u001b'), true)
  assert.equal(isAgentUserInput('\u0003'), true)
})

test('treats a mouse click as user input but ignores release, motion and wheel reports', () => {
  assert.equal(isAgentUserInput('\u001b[<0;12;5M'), true)
  assert.equal(isAgentUserInput('\u001b[<2;12;5M'), true)
  assert.equal(isAgentUserInput('\u001b[<0;12;5m'), false)
  assert.equal(isAgentUserInput('\u001b[<32;12;5M'), false)
  assert.equal(isAgentUserInput('\u001b[<64;12;5M'), false)
})
