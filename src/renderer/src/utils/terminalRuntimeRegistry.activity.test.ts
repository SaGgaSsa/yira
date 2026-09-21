import assert from 'node:assert/strict'
import test from 'node:test'
import { TerminalRuntimeRegistry, type TerminalRuntimeHandle } from './terminalRuntimeRegistry'
import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'

interface FakeRuntime extends TerminalRuntimeHandle {
  readonly disposals: boolean[]
}

function target(workspaceId: string, tileId: string): TerminalSessionTarget {
  return { workspaceId, tileId }
}

function createFakeRuntime(runtimeTarget: TerminalSessionTarget): FakeRuntime {
  const disposals: boolean[] = []

  return {
    target: runtimeTarget,
    park: () => {},
    disposals,
    dispose: async (destroyPty) => {
      disposals.push(destroyPty)
    },
  }
}

test('counts live terminals per workspace when runtimes are acquired', async () => {
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  await registry.acquire(target('a', 't1'), async (entry) => createFakeRuntime(entry))
  await registry.acquire(target('a', 't2'), async (entry) => createFakeRuntime(entry))
  await registry.acquire(target('b', 't1'), async (entry) => createFakeRuntime(entry))

  assert.deepEqual(registry.countTerminalsByWorkspace(), { a: 2, b: 1 })
})

test('does not duplicate counts when the same target is acquired twice', async () => {
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  const first = await registry.acquire(target('a', 't1'), async (entry) => createFakeRuntime(entry))
  const second = await registry.acquire(target('a', 't1'), async (entry) => createFakeRuntime(entry))

  assert.equal(first, second)
  assert.deepEqual(registry.countTerminalsByWorkspace(), { a: 1 })
})

test('updates counts when runtimes are destroyed without polling', async () => {
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  const revisions: number[] = []
  const unsubscribe = registry.subscribe(() => {
    revisions.push(registry.getRevision())
  })

  await registry.acquire(target('a', 't1'), async (entry) => createFakeRuntime(entry))
  await registry.acquire(target('a', 't2'), async (entry) => createFakeRuntime(entry))
  const notifiedAfterAcquire = revisions.length
  assert.ok(notifiedAfterAcquire > 0)

  await registry.destroy(target('a', 't1'))
  assert.deepEqual(registry.countTerminalsByWorkspace(), { a: 1 })
  assert.ok(revisions.length > notifiedAfterAcquire)

  await registry.destroyWorkspace('a')
  assert.deepEqual(registry.countTerminalsByWorkspace(), {})

  unsubscribe()
  const revisionBeforeSilent = registry.getRevision()
  await registry.acquire(target('b', 't1'), async (entry) => createFakeRuntime(entry))
  assert.equal(revisions.length, notifiedAfterAcquire + 2)
  assert.equal(registry.getRevision(), revisionBeforeSilent + 2)
})

test('counts a pending creation once and keeps a single count after it resolves', async () => {
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  let release!: (value: FakeRuntime) => void
  const gate = new Promise<FakeRuntime>((resolve) => {
    release = resolve
  })
  const pending = registry.acquire(target('a', 't1'), () => gate)

  assert.deepEqual(registry.countTerminalsByWorkspace(), { a: 1 })

  release(createFakeRuntime(target('a', 't1')))
  await pending
  assert.deepEqual(registry.countTerminalsByWorkspace(), { a: 1 })
})
