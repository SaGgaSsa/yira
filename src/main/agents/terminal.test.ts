import assert from 'node:assert/strict'
import test from 'node:test'

import { AgentSessionRegistry } from './registry'
import {
  buildAgentTerminalLaunch,
  createAgentTerminalExitGate,
  createAgentTerminalLifecycle,
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
    cwd: '/workspace/project',
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
    cwd: '/workspace/project/packages/app',
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
