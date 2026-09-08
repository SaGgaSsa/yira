import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TerminalRuntimeRegistry,
  terminalRuntimeKey,
  type TerminalRuntimeHandle,
} from './terminalRuntimeRegistry'
import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'

interface FakeRuntime extends TerminalRuntimeHandle {
  readonly parks: Array<HTMLElement | null>
  readonly disposals: boolean[]
}

function target(workspaceId: string, tileId = 'terminal'): TerminalSessionTarget {
  return { workspaceId, tileId }
}

function createFakeRuntime(runtimeTarget: TerminalSessionTarget): FakeRuntime {
  const parks: Array<HTMLElement | null> = []
  const disposals: boolean[] = []

  return {
    target: runtimeTarget,
    parks,
    disposals,
    park: (parkingRoot) => {
      parks.push(parkingRoot)
    },
    dispose: async (destroyPty) => {
      disposals.push(destroyPty)
    },
  }
}

test('uses a canonical key for workspace and tile IDs', () => {
  assert.equal(terminalRuntimeKey(target('workspace-a', 'tile-a')), '[\"workspace-a\",\"tile-a\"]')
  assert.notEqual(
    terminalRuntimeKey(target('workspace-a', 'tile-a')),
    terminalRuntimeKey(target('workspace-b', 'tile-a')),
  )
})

test('acquires one runtime for each workspace and tile target', async () => {
  let creations = 0
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  const factory = async (runtimeTarget: TerminalSessionTarget): Promise<FakeRuntime> => {
    creations += 1
    return createFakeRuntime(runtimeTarget)
  }

  const first = await registry.acquire(target('workspace-a'), factory)
  const second = await registry.acquire(target('workspace-a'), factory)
  const other = await registry.acquire(target('workspace-b'), factory)

  assert.equal(first, second)
  assert.notEqual(first, other)
  assert.equal(creations, 2)
  assert.equal(registry.get(target('workspace-a')), first)
  assert.equal(registry.get(target('workspace-b')), other)
})

test('shares an in-flight runtime creation', async () => {
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  let resolvePending!: (runtime: FakeRuntime) => void
  const pending = new Promise<FakeRuntime>((resolve) => {
    resolvePending = resolve
  })
  let creations = 0

  const factory = async (): Promise<FakeRuntime> => {
    creations += 1
    return pending
  }
  const first = registry.acquire(target('workspace-a'), factory)
  const second = registry.acquire(target('workspace-a'), factory)
  const runtime = createFakeRuntime(target('workspace-a'))
  resolvePending(runtime)

  assert.equal(await first, runtime)
  assert.equal(await second, runtime)
  assert.equal(creations, 1)
})

test('removes a rejected creation so a later acquisition can retry', async () => {
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  const runtimeTarget = target('workspace-a')
  let attempts = 0

  await assert.rejects(
    registry.acquire(runtimeTarget, async () => {
      attempts += 1
      throw new Error('creation failed')
    }),
    /creation failed/,
  )

  const runtime = await registry.acquire(runtimeTarget, async (createdTarget) => {
    attempts += 1
    return createFakeRuntime(createdTarget)
  })

  assert.equal(attempts, 2)
  assert.equal(registry.get(runtimeTarget), runtime)
})

test('parks a runtime in the configured parking root without disposing it', async () => {
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  const runtimeTarget = target('workspace-a')
  const runtime = createFakeRuntime(runtimeTarget)
  const parkingRoot = {} as HTMLElement

  registry.setParkingRoot(parkingRoot)
  await registry.acquire(runtimeTarget, async () => runtime)
  registry.park(runtimeTarget)

  assert.deepEqual(runtime.parks, [parkingRoot])
  assert.deepEqual(runtime.disposals, [])
})

test('parks a runtime when its creation finishes after the park request', async () => {
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  const runtimeTarget = target('workspace-a')
  const parkingRoot = {} as HTMLElement
  let resolvePending!: (runtime: FakeRuntime) => void
  const pending = new Promise<FakeRuntime>((resolve) => {
    resolvePending = resolve
  })
  const runtime = createFakeRuntime(runtimeTarget)

  registry.setParkingRoot(parkingRoot)
  const acquisition = registry.acquire(runtimeTarget, async () => pending)
  registry.park(runtimeTarget)
  resolvePending(runtime)

  await acquisition

  assert.deepEqual(runtime.parks, [parkingRoot])
})

test('destroys only the requested target and honors the destroyPty flag', async () => {
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  const firstTarget = target('workspace-a', 'tile-a')
  const secondTarget = target('workspace-a', 'tile-b')
  const otherWorkspaceTarget = target('workspace-b', 'tile-a')
  const first = await registry.acquire(firstTarget, async (createdTarget) => createFakeRuntime(createdTarget))
  const second = await registry.acquire(secondTarget, async (createdTarget) => createFakeRuntime(createdTarget))
  const otherWorkspace = await registry.acquire(
    otherWorkspaceTarget,
    async (createdTarget) => createFakeRuntime(createdTarget),
  )

  await registry.destroy(firstTarget)
  await registry.destroy(secondTarget, false)

  assert.deepEqual(first.disposals, [true])
  assert.deepEqual(second.disposals, [false])
  assert.deepEqual(otherWorkspace.disposals, [])
  assert.equal(registry.get(firstTarget), undefined)
  assert.equal(registry.get(secondTarget), undefined)
  assert.equal(registry.get(otherWorkspaceTarget), otherWorkspace)
})

test('prunes only unretained tiles from the selected workspace', async () => {
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  const retainedTarget = target('workspace-a', 'retained')
  const removedTarget = target('workspace-a', 'removed')
  const otherWorkspaceTarget = target('workspace-b', 'removed')
  const retained = await registry.acquire(
    retainedTarget,
    async (createdTarget) => createFakeRuntime(createdTarget),
  )
  const removed = await registry.acquire(
    removedTarget,
    async (createdTarget) => createFakeRuntime(createdTarget),
  )
  const otherWorkspace = await registry.acquire(
    otherWorkspaceTarget,
    async (createdTarget) => createFakeRuntime(createdTarget),
  )

  await registry.pruneWorkspace('workspace-a', ['retained'])

  assert.equal(registry.get(retainedTarget), retained)
  assert.equal(registry.get(removedTarget), undefined)
  assert.equal(registry.get(otherWorkspaceTarget), otherWorkspace)
  assert.deepEqual(retained.disposals, [])
  assert.deepEqual(removed.disposals, [true])
  assert.deepEqual(otherWorkspace.disposals, [])
})

test('destroys every runtime in one workspace and leaves other workspaces active', async () => {
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  const firstTarget = target('workspace-a', 'tile-a')
  const secondTarget = target('workspace-a', 'tile-b')
  const otherWorkspaceTarget = target('workspace-b', 'tile-a')
  const first = await registry.acquire(firstTarget, async (createdTarget) => createFakeRuntime(createdTarget))
  const second = await registry.acquire(secondTarget, async (createdTarget) => createFakeRuntime(createdTarget))
  const otherWorkspace = await registry.acquire(
    otherWorkspaceTarget,
    async (createdTarget) => createFakeRuntime(createdTarget),
  )

  await registry.destroyWorkspace('workspace-a')

  assert.deepEqual(first.disposals, [true])
  assert.deepEqual(second.disposals, [true])
  assert.deepEqual(otherWorkspace.disposals, [])
  assert.equal(registry.get(otherWorkspaceTarget), otherWorkspace)
})

test('disposes every runtime without destroying PTYs', async () => {
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  const firstTarget = target('workspace-a', 'tile-a')
  const secondTarget = target('workspace-b', 'tile-b')
  const first = await registry.acquire(firstTarget, async (createdTarget) => createFakeRuntime(createdTarget))
  const second = await registry.acquire(secondTarget, async (createdTarget) => createFakeRuntime(createdTarget))

  await registry.dispose()

  assert.deepEqual(first.disposals, [false])
  assert.deepEqual(second.disposals, [false])
  assert.equal(registry.get(firstTarget), undefined)
  assert.equal(registry.get(secondTarget), undefined)
})
