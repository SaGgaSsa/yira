import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentActiveSession, TileState } from '@shared/types'
import {
  buildAgentTextSendTargets,
  waitForAgentTerminalRuntime,
  type AgentTerminalRuntime,
  type AgentTerminalRuntimeRegistry,
} from './agentTextSend'

function session(overrides: Partial<AgentActiveSession> = {}): AgentActiveSession {
  return {
    sessionId: 'session-a',
    tileId: 'agent-a',
    workspaceId: 'workspace-a',
    provider: 'claude',
    status: 'working',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function tile(id: string, overrides: Partial<TileState> = {}): TileState {
  return {
    id,
    type: 'terminal',
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    zIndex: 1,
    ...overrides,
  }
}

test('builds workspace agent targets with labels and filters unavailable sessions', () => {
  const targets = buildAgentTextSendTargets({
    workspaceId: 'workspace-a',
    sessions: [
      session({ tileId: 'named-agent', title: 'Session title' }),
      session({ tileId: 'live-agent', provider: 'codex', liveTitle: 'Live title' }),
      session({ tileId: 'agents-view', surface: 'agents-view', title: 'Agents view title' }),
      session({ tileId: 'provider-fallback', surface: 'agents-view', provider: 'codex' }),
      session({ tileId: 'missing-tile' }),
      session({ tileId: 'detached-agent' }),
      session({ tileId: 'exited-agent', status: 'exited' }),
      session({ tileId: 'other-workspace', workspaceId: 'workspace-b' }),
    ],
    tiles: [
      tile('named-agent', { label: 'Manual title' }),
      tile('live-agent', { agent: { provider: 'codex' } }),
      tile('detached-agent', { floating: { detached: true } }),
    ],
    terminalTitles: { 'live-agent': 'Terminal title' },
    agentTitles: { 'live-agent': 'Agent live title' },
  })

  assert.deepEqual(targets.map(({ id, label, surface }) => ({ id, label, surface })), [
    { id: 'agents-view', label: 'Agents view title', surface: 'agents-view' },
    { id: 'live-agent', label: 'Agent live title', surface: 'tile' },
    { id: 'named-agent', label: 'Manual title', surface: 'tile' },
    { id: 'provider-fallback', label: 'Codex', surface: 'agents-view' },
  ])
})

test('can omit the source terminal from the destination list', () => {
  const targets = buildAgentTextSendTargets({
    workspaceId: 'workspace-a',
    sessions: [session({ tileId: 'source' }), session({ tileId: 'other' })],
    tiles: [tile('source'), tile('other')],
    terminalTitles: {},
    agentTitles: {},
    sourceTileId: 'source',
  })

  assert.deepEqual(targets.map((target) => target.id), ['other'])
})

class FakeRegistry implements AgentTerminalRuntimeRegistry<AgentTerminalRuntime> {
  private runtime: AgentTerminalRuntime | undefined
  private readonly listeners = new Set<() => void>()

  get(): AgentTerminalRuntime | undefined {
    return this.runtime
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setRuntime(runtime: AgentTerminalRuntime): void {
    this.runtime = runtime
    for (const listener of this.listeners) listener()
  }
}

test('waits for an agent runtime that appears before the timeout', async () => {
  const registry = new FakeRegistry()
  const runtime: AgentTerminalRuntime = { focus: () => {}, paste: () => {} }
  const pending = waitForAgentTerminalRuntime(registry, { workspaceId: 'workspace-a', tileId: 'agent-a' }, 100)
  setTimeout(() => registry.setRuntime(runtime), 5)

  assert.equal(await pending, runtime)
})

test('returns null when an agent runtime does not appear before the timeout', async () => {
  const registry = new FakeRegistry()

  assert.equal(
    await waitForAgentTerminalRuntime(registry, { workspaceId: 'workspace-a', tileId: 'agent-a' }, 10),
    null,
  )
})
