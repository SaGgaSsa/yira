import assert from 'node:assert/strict'
import test from 'node:test'

import { AgentSessionRegistry } from './registry'

const session = {
  sessionId: 'session-1',
  tileId: 'tile-1',
  workspaceId: 'workspace-1',
  provider: 'codex' as const,
}

test('tracks validated runtime sessions through working, input, done, and exited states', () => {
  let now = 1_000
  const registry = new AgentSessionRegistry({ now: () => now })
  const snapshots: string[] = []
  registry.subscribe((snapshot) => snapshots.push(snapshot.sessions.map((item) => item.status).join(',')))

  const created = registry.register(session)
  assert.equal(created.status, 'working')
  now += 100
  assert.equal(registry.markNeedsInput('workspace-1', 'tile-1'), true)
  now += 100
  assert.equal(registry.markWorking('workspace-1', 'tile-1'), true)
  now += 100
  assert.equal(registry.markDone('workspace-1', 'tile-1'), true)
  now += 100
  assert.equal(registry.markExited('workspace-1', 'tile-1'), true)

  const current = registry.snapshot()
  assert.equal(current.sessions[0].status, 'exited')
  assert.equal(current.sessions[0].startedAt, new Date(1_000).toISOString())
  assert.equal(current.sessions[0].lastActivityAt, new Date(1_400).toISOString())
  assert.deepEqual(snapshots, ['', 'working', 'needs-input', 'working', 'done', 'exited'])
})

test('joins semantic AgentAlert events to the tile/workspace session without retaining payloads', () => {
  const registry = new AgentSessionRegistry()
  registry.register(session)

  assert.equal(registry.reportAgentAlert({
    provider: 'codex',
    event: 'permission',
    tileId: 'tile-1',
    transcript: 'must not be retained',
  }), true)
  assert.equal(registry.snapshot().sessions[0].status, 'needs-input')
  assert.equal(registry.snapshot().sessions[0] && 'transcript' in registry.snapshot().sessions[0], false)

  assert.equal(registry.reportAgentAlert({ provider: 'codex', event: 'completed', tileId: 'tile-1' }), false)
  assert.equal(registry.snapshot().sessions[0].status, 'needs-input')
  assert.equal(registry.reportAgentAlert({ provider: 'codex', event: 'input', tileId: 'tile-1' }), true)
  assert.equal(registry.snapshot().sessions[0].status, 'needs-input')
})

test('keys sessions by workspace and tile and rejects unsafe identifiers', () => {
  const registry = new AgentSessionRegistry()
  registry.register(session)
  registry.register({ ...session, workspaceId: 'workspace-2', tileId: 'tile-1', sessionId: 'session-2' })
  assert.equal(registry.snapshot().sessions.length, 2)
  assert.equal(registry.snapshot('workspace-2').sessions[0].sessionId, 'session-2')
  assert.throws(() => registry.register({ ...session, sessionId: '../escape' }), /invalid session/i)
  assert.equal(registry.markDone('', 'tile-1'), false)
})

test('records activity for an already-working session without changing its state', () => {
  let now = 2_000
  const registry = new AgentSessionRegistry({ now: () => now })
  registry.register(session)
  now += 250
  assert.equal(registry.recordActivity('workspace-1', 'tile-1'), true)
  assert.equal(registry.get('workspace-1', 'tile-1')?.status, 'working')
  assert.equal(registry.get('workspace-1', 'tile-1')?.lastActivityAt, new Date(2_250).toISOString())
})

test('typing keeps the status, a submit starts a turn and an interrupt ends it', () => {
  const registry = new AgentSessionRegistry()
  registry.register({ ...session, initialStatus: 'done' })
  assert.equal(registry.get('workspace-1', 'tile-1')?.status, 'done')

  registry.recordActivity('workspace-1', 'tile-1', 'typing')
  assert.equal(registry.get('workspace-1', 'tile-1')?.status, 'done')
  registry.recordActivity('workspace-1', 'tile-1', 'submit')
  assert.equal(registry.get('workspace-1', 'tile-1')?.status, 'working')
  registry.recordActivity('workspace-1', 'tile-1', 'interrupt')
  assert.equal(registry.get('workspace-1', 'tile-1')?.status, 'done')
})

test('re-registering the same live session keeps its status', () => {
  const registry = new AgentSessionRegistry()
  registry.register(session)
  registry.markDone('workspace-1', 'tile-1')
  registry.register(session)
  assert.equal(registry.get('workspace-1', 'tile-1')?.status, 'done')
  registry.register({ ...session, sessionId: 'session-new' })
  assert.equal(registry.get('workspace-1', 'tile-1')?.status, 'working')
})

test('keeps exited sessions exited when late activity or hooks arrive', () => {
  const registry = new AgentSessionRegistry()
  registry.register(session)
  assert.equal(registry.markExited('workspace-1', 'tile-1'), true)

  assert.equal(registry.recordActivity('workspace-1', 'tile-1'), false)
  assert.equal(registry.markWorking('workspace-1', 'tile-1'), false)
  assert.equal(registry.markNeedsInput('workspace-1', 'tile-1'), false)
  assert.equal(registry.markDone('workspace-1', 'tile-1'), false)
  assert.equal(registry.reportAgentAlert({ provider: 'codex', event: 'permission', tileId: 'tile-1' }), false)
  assert.equal(registry.alerts.has('tile-1'), false)
  assert.equal(registry.get('workspace-1', 'tile-1')?.status, 'exited')
})

test('contains subscriber failures so registry lifecycle calls remain safe', () => {
  const registry = new AgentSessionRegistry()
  assert.doesNotThrow(() => registry.subscribe(() => { throw new Error('renderer teardown') }))
  assert.doesNotThrow(() => registry.register(session))
})

test('retains Agents View and worktree metadata in runtime snapshots', () => {
  const registry = new AgentSessionRegistry()
  const worktrees = [
    { path: 'C:\\worktrees\\agent-1\\repo-a', baseSha: '0'.repeat(40) },
    { path: 'C:\\worktrees\\agent-1\\repo-b', baseSha: '1'.repeat(40) },
  ]
  const created = registry.register({
    ...session,
    surface: 'agents-view',
    title: 'Fix the login flow',
    worktreeRoot: 'C:\\worktrees\\agent-1',
    worktreeBranch: 'agents/fix-login',
    worktrees,
  })

  assert.deepEqual({
    surface: created.surface,
    title: created.title,
    worktreeRoot: created.worktreeRoot,
    worktreeBranch: created.worktreeBranch,
    worktrees: created.worktrees,
  }, {
    surface: 'agents-view',
    title: 'Fix the login flow',
    worktreeRoot: 'C:\\worktrees\\agent-1',
    worktreeBranch: 'agents/fix-login',
    worktrees,
  })
  assert.throws(() => registry.register({ ...session, title: 'bad\ntitle' }), /invalid agent title/i)
  assert.throws(() => registry.register({ ...session, worktreeRoot: 'x'.repeat(4_097) }), /invalid agent worktree root/i)
  assert.throws(() => registry.register({ ...session, worktrees: Array.from({ length: 33 }, () => worktrees[0]) }), /invalid agent worktrees/i)

  created.worktrees![0].path = 'mutated'
  assert.equal(registry.get('workspace-1', 'tile-1')?.worktrees?.[0].path, worktrees[0].path)
})

test('updates the live terminal title only when its text changes', () => {
  const registry = new AgentSessionRegistry()
  const titles: Array<string | undefined> = []
  registry.register(session)
  registry.subscribe((snapshot) => titles.push(snapshot.sessions[0]?.liveTitle))

  assert.equal(registry.updateLiveTitle('workspace-1', 'tile-1', '⠂ Fix the login flow'), true)
  assert.equal(registry.updateLiveTitle('workspace-1', 'tile-1', '⠂ Fix the login flow'), false)
  assert.equal(registry.updateLiveTitle('workspace-1', 'tile-1', '✳ Fix the login flow'), true)
  assert.equal(registry.updateLiveTitle('workspace-1', 'tile-1', ' '), false)
  assert.equal(registry.updateLiveTitle('workspace-1', 'missing', 'Other'), false)
  assert.equal(registry.get('workspace-1', 'tile-1')?.liveTitle, '✳ Fix the login flow')
  assert.deepEqual(titles, [undefined, '⠂ Fix the login flow', '✳ Fix the login flow'])

  registry.markExited('workspace-1', 'tile-1')
  assert.equal(registry.updateLiveTitle('workspace-1', 'tile-1', 'Renamed'), false)
})
