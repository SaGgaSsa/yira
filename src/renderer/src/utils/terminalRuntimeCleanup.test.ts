import assert from 'node:assert/strict'
import test from 'node:test'
import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'
import {
  buildTerminalRuntimeTarget,
  destroyRemovedWorkspaceRuntimes,
  destroyTerminalRuntime,
  getPersistedTerminalTileIds,
  pruneWorkspaceTerminalRuntimes,
} from './terminalRuntimeCleanup'

type CleanupCall =
  | { kind: 'destroy'; target: TerminalSessionTarget; destroyPty: boolean }
  | { kind: 'destroyWorkspace'; workspaceId: string }
  | { kind: 'pruneWorkspace'; workspaceId: string; retainedTileIds: string[] }

function createFakeRegistry(options: { blockDestroy?: boolean } = {}) {
  const calls: CleanupCall[] = []
  let releaseDestroy = (): void => {}
  const destroyStarted = new Promise<void>((resolve) => {
    releaseDestroy = () => resolve()
  })

  return {
    calls,
    destroyStarted,
    releaseDestroy: () => releaseDestroy(),
    registry: {
      destroy: async (target: TerminalSessionTarget, destroyPty = true) => {
        calls.push({ kind: 'destroy', target, destroyPty })
        if (options.blockDestroy) await destroyStarted
      },
      destroyWorkspace: async (workspaceId: string) => {
        calls.push({ kind: 'destroyWorkspace', workspaceId })
      },
      pruneWorkspace: async (workspaceId: string, retainedTileIds: Iterable<string>) => {
        calls.push({ kind: 'pruneWorkspace', workspaceId, retainedTileIds: [...retainedTileIds] })
      },
    },
  }
}

test('destroyTerminalRuntime waits for the exact target and destroys its PTY', async () => {
  const fake = createFakeRegistry({ blockDestroy: true })
  const target = buildTerminalRuntimeTarget('workspace-a', 'terminal-a')
  const events: string[] = []

  const cleanup = destroyTerminalRuntime(fake.registry, target)
  await Promise.resolve()
  assert.deepEqual(fake.calls, [{
    kind: 'destroy',
    target: { workspaceId: 'workspace-a', tileId: 'terminal-a' },
    destroyPty: true,
  }])

  void cleanup.then(() => {
    events.push('after-destroy')
  })
  await Promise.resolve()
  assert.equal(events.length, 0)

  events.push('release-destroy')
  fake.releaseDestroy()
  await cleanup
  assert.deepEqual(events, ['release-destroy', 'after-destroy'])
})

test('destroyRemovedWorkspaceRuntimes destroys each normalized workspace id once', async () => {
  const fake = createFakeRegistry()

  await destroyRemovedWorkspaceRuntimes(fake.registry, ['removed-a', 'removed-a', '', 'removed-b', 'removed-b'])

  assert.deepEqual(fake.calls, [
    { kind: 'destroyWorkspace', workspaceId: 'removed-a' },
    { kind: 'destroyWorkspace', workspaceId: 'removed-b' },
  ])
})

test('pruneWorkspaceTerminalRuntimes retains only terminal tile ids for the exact workspace', async () => {
  const fake = createFakeRegistry()

  await pruneWorkspaceTerminalRuntimes(fake.registry, 'workspace-a', [
    { id: 'terminal-a', type: 'terminal' },
    { id: 'note-a', type: 'note' },
    { id: 'terminal-a', type: 'terminal' },
    { id: 'browser-a', type: 'browser' },
    { id: 'terminal-b', type: 'terminal' },
  ])

  assert.deepEqual(fake.calls, [{
    kind: 'pruneWorkspace',
    workspaceId: 'workspace-a',
    retainedTileIds: ['terminal-a', 'terminal-b'],
  }])
  assert.deepEqual(getPersistedTerminalTileIds([
    { id: 'terminal-a', type: 'terminal' },
    { id: 'terminal-a', type: 'terminal' },
    { id: 'note-a', type: 'note' },
  ]), ['terminal-a'])
})

test('buildTerminalRuntimeTarget rejects missing workspace or tile ids', () => {
  assert.deepEqual(buildTerminalRuntimeTarget('workspace-a', 'terminal-a'), {
    workspaceId: 'workspace-a',
    tileId: 'terminal-a',
  })
  assert.equal(buildTerminalRuntimeTarget('', 'terminal-a'), null)
  assert.equal(buildTerminalRuntimeTarget('workspace-a', ''), null)
})
