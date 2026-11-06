import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWorkspaceGitDiffChangeHub,
  createWorkspaceGitDiffRequestController,
  canReadWorkspaceGitDiff,
  type WorkspaceGitDiffWatchBridge,
} from './useWorkspaceGitDiff'

test('requires only a root folder to discover workspace repositories automatically', () => {
  assert.equal(canReadWorkspaceGitDiff(undefined), false)
  assert.equal(canReadWorkspaceGitDiff('  '), false)
  assert.equal(canReadWorkspaceGitDiff('/workspace'), true)
  assert.equal(canReadWorkspaceGitDiff('  /workspace  '), true)
})

test('coalesces refreshes while one workspace diff request is pending', async () => {
  let readCount = 0
  let resolveRead: ((result: { additions: number; deletions: number; available: boolean }) => void) | null = null
  const results: Array<{ additions: number; deletions: number; available: boolean }> = []
  const controller = createWorkspaceGitDiffRequestController({
    workspaceId: 'workspace-a',
    read: async (workspaceId) => {
      assert.equal(workspaceId, 'workspace-a')
      readCount += 1
      return new Promise((resolve) => {
        resolveRead = resolve
      })
    },
    onResult: (result) => results.push(result),
  })

  const firstRefresh = controller.refresh()
  const secondRefresh = controller.refresh()
  await Promise.resolve()
  assert.equal(readCount, 1)
  assert.strictEqual(firstRefresh, secondRefresh)

  const resolveFirstRead = resolveRead as unknown as ((result: { additions: number; deletions: number; available: boolean }) => void)
  resolveFirstRead({ additions: 12, deletions: 3, available: true })
  await firstRefresh
  assert.deepEqual(results, [{ additions: 12, deletions: 3, available: true }])
})

test('starts a new request after a successful request resolves', async () => {
  let readCount = 0
  const results: Array<{ additions: number; deletions: number; available: boolean }> = []
  const controller = createWorkspaceGitDiffRequestController({
    workspaceId: 'workspace-a',
    read: async () => {
      readCount += 1
      return { additions: readCount, deletions: 0, available: true }
    },
    onResult: (result) => results.push(result),
  })

  await controller.refresh()
  await controller.refresh()

  assert.equal(readCount, 2)
  assert.deepEqual(results, [
    { additions: 1, deletions: 0, available: true },
    { additions: 2, deletions: 0, available: true },
  ])
})

test('discards a result after the request owner is disposed', async () => {
  let resolveRead: ((result: { additions: number; deletions: number; available: boolean }) => void) | null = null
  const results: Array<{ additions: number; deletions: number; available: boolean }> = []
  const controller = createWorkspaceGitDiffRequestController({
    workspaceId: 'workspace-a',
    read: async () => new Promise((resolve) => {
      resolveRead = resolve
    }),
    onResult: (result) => results.push(result),
  })

  const pendingRefresh = controller.refresh()
  await Promise.resolve()
  controller.dispose()
  const resolveDisposedRead = resolveRead as unknown as ((result: { additions: number; deletions: number; available: boolean }) => void)
  resolveDisposedRead({ additions: 2, deletions: 1, available: true })
  await pendingRefresh

  assert.deepEqual(results, [])
})

test('maps a failed request to an unavailable result', async () => {
  const results: Array<{ additions: number; deletions: number; available: boolean }> = []
  const controller = createWorkspaceGitDiffRequestController({
    workspaceId: 'workspace-a',
    read: async () => {
      throw new Error('git unavailable')
    },
    onResult: (result) => results.push(result),
  })

  await controller.refresh()
  assert.deepEqual(results, [{ additions: 0, deletions: 0, available: false }])
})

test('allows a retry after a synchronous reader failure', async () => {
  let shouldFail = true
  const results: Array<{ additions: number; deletions: number; available: boolean }> = []
  const controller = createWorkspaceGitDiffRequestController({
    workspaceId: 'workspace-a',
    read: () => {
      if (shouldFail) {
        shouldFail = false
        throw new Error('git unavailable')
      }
      return Promise.resolve({ additions: 4, deletions: 2, available: true })
    },
    onResult: (result) => results.push(result),
  })

  await controller.refresh()
  await controller.refresh()

  assert.deepEqual(results, [
    { additions: 0, deletions: 0, available: false },
    { additions: 4, deletions: 2, available: true },
  ])
})

test('reads once when invalidated without a pending request', async () => {
  let readCount = 0
  const results: Array<{ additions: number; deletions: number; available: boolean }> = []
  const controller = createWorkspaceGitDiffRequestController({
    workspaceId: 'workspace-a',
    read: async () => {
      readCount += 1
      return { additions: 3, deletions: 1, available: true }
    },
    onResult: (result) => results.push(result),
  })

  controller.invalidate()
  await flushTasks()

  assert.equal(readCount, 1)
  assert.deepEqual(results, [{ additions: 3, deletions: 1, available: true }])
})

test('rereads once after a pending request when invalidated twice', async () => {
  const resolvers: Array<(result: { additions: number; deletions: number; available: boolean }) => void> = []
  let readCount = 0
  const results: Array<{ additions: number; deletions: number; available: boolean }> = []
  const controller = createWorkspaceGitDiffRequestController({
    workspaceId: 'workspace-a',
    read: async () => {
      readCount += 1
      return new Promise((resolve) => {
        resolvers.push(resolve)
      })
    },
    onResult: (result) => results.push(result),
  })

  const firstRefresh = controller.refresh()
  await Promise.resolve()
  controller.invalidate()
  controller.invalidate()
  assert.equal(readCount, 1)

  resolvers[0]({ additions: 1, deletions: 0, available: true })
  await firstRefresh
  await flushTasks()

  assert.equal(readCount, 2)
  resolvers[1]({ additions: 2, deletions: 1, available: true })
  await flushTasks()

  assert.deepEqual(results, [
    { additions: 1, deletions: 0, available: true },
    { additions: 2, deletions: 1, available: true },
  ])
})

test('does not reread when invalidated during a request and then disposed', async () => {
  let resolveRead: ((result: { additions: number; deletions: number; available: boolean }) => void) | null = null
  let readCount = 0
  const results: Array<{ additions: number; deletions: number; available: boolean }> = []
  const controller = createWorkspaceGitDiffRequestController({
    workspaceId: 'workspace-a',
    read: async () => {
      readCount += 1
      return new Promise((resolve) => {
        resolveRead = resolve
      })
    },
    onResult: (result) => results.push(result),
  })

  const pendingRefresh = controller.refresh()
  await Promise.resolve()
  controller.invalidate()
  controller.dispose()
  const resolveDisposedRead = resolveRead as unknown as ((result: { additions: number; deletions: number; available: boolean }) => void)
  resolveDisposedRead({ additions: 2, deletions: 1, available: true })
  await pendingRefresh
  await flushTasks()

  assert.equal(readCount, 1)
  assert.deepEqual(results, [])
})

interface TestWorkspaceGitDiffWatchBridge {
  bridge: WorkspaceGitDiffWatchBridge
  watchCalls: string[]
  unwatchCalls: string[]
  changeListenerCount: number
  activeChangeListeners: Set<(workspaceId: string) => void>
  emitWorkspaceDiffChanged: (workspaceId: string) => void
}

function createTestWorkspaceGitDiffWatchBridge(
  watch: (workspaceId: string) => Promise<void> = async () => {},
): TestWorkspaceGitDiffWatchBridge {
  const watchCalls: string[] = []
  const unwatchCalls: string[] = []
  const activeChangeListeners = new Set<(workspaceId: string) => void>()
  let changeListenerCount = 0
  const bridge: WorkspaceGitDiffWatchBridge = {
    watchWorkspaceDiff: (workspaceId) => {
      watchCalls.push(workspaceId)
      return watch(workspaceId)
    },
    unwatchWorkspaceDiff: (workspaceId) => {
      unwatchCalls.push(workspaceId)
      return Promise.resolve()
    },
    onWorkspaceDiffChanged: (callback) => {
      changeListenerCount += 1
      activeChangeListeners.add(callback)
      return () => {
        activeChangeListeners.delete(callback)
      }
    },
  }

  return {
    bridge,
    watchCalls,
    unwatchCalls,
    get changeListenerCount() {
      return changeListenerCount
    },
    activeChangeListeners,
    emitWorkspaceDiffChanged: (workspaceId) => {
      for (const callback of [...activeChangeListeners]) callback(workspaceId)
    },
  }
}

test('watches each workspace once and shares a single change subscription', () => {
  const testBridge = createTestWorkspaceGitDiffWatchBridge()
  const hub = createWorkspaceGitDiffChangeHub(testBridge.bridge)

  const unsubscribeFirst = hub.subscribe('workspace-a', () => {})
  const unsubscribeSecond = hub.subscribe('workspace-a', () => {})

  assert.deepEqual(testBridge.watchCalls, ['workspace-a'])
  assert.equal(testBridge.changeListenerCount, 1)
  assert.equal(testBridge.activeChangeListeners.size, 1)

  unsubscribeFirst()
  unsubscribeSecond()
})

test('notifies only the listeners of the changed workspace', () => {
  const testBridge = createTestWorkspaceGitDiffWatchBridge()
  const hub = createWorkspaceGitDiffChangeHub(testBridge.bridge)
  let workspaceACount = 0
  let workspaceBCount = 0
  const unsubscribeA = hub.subscribe('workspace-a', () => {
    workspaceACount += 1
  })
  const unsubscribeB = hub.subscribe('workspace-b', () => {
    workspaceBCount += 1
  })

  testBridge.emitWorkspaceDiffChanged('workspace-a')
  assert.equal(workspaceACount, 1)
  assert.equal(workspaceBCount, 0)

  testBridge.emitWorkspaceDiffChanged('workspace-c')
  assert.equal(workspaceACount, 1)
  assert.equal(workspaceBCount, 0)

  unsubscribeA()
  unsubscribeB()
})

test('keeps notifying the remaining listeners when one unsubscribes during a change', () => {
  const testBridge = createTestWorkspaceGitDiffWatchBridge()
  const hub = createWorkspaceGitDiffChangeHub(testBridge.bridge)
  let remainingCount = 0
  const unsubscribeFirst = hub.subscribe('workspace-a', () => unsubscribeFirst())
  const unsubscribeSecond = hub.subscribe('workspace-a', () => {
    remainingCount += 1
  })

  testBridge.emitWorkspaceDiffChanged('workspace-a')

  assert.equal(remainingCount, 1)
  unsubscribeSecond()
})

test('unwatches only when the last workspace listener leaves', () => {
  const testBridge = createTestWorkspaceGitDiffWatchBridge()
  const hub = createWorkspaceGitDiffChangeHub(testBridge.bridge)
  const unsubscribeFirst = hub.subscribe('workspace-a', () => {})
  const unsubscribeSecond = hub.subscribe('workspace-a', () => {})
  const unsubscribeOther = hub.subscribe('workspace-b', () => {})

  unsubscribeFirst()
  assert.deepEqual(testBridge.unwatchCalls, [])
  assert.equal(testBridge.activeChangeListeners.size, 1)

  unsubscribeSecond()
  assert.deepEqual(testBridge.unwatchCalls, ['workspace-a'])
  assert.equal(testBridge.activeChangeListeners.size, 1)

  unsubscribeOther()
  assert.deepEqual(testBridge.unwatchCalls, ['workspace-a', 'workspace-b'])
  assert.equal(testBridge.activeChangeListeners.size, 0)
})

test('does not release a workspace twice when unsubscribed twice', () => {
  const testBridge = createTestWorkspaceGitDiffWatchBridge()
  const hub = createWorkspaceGitDiffChangeHub(testBridge.bridge)
  const unsubscribeFirst = hub.subscribe('workspace-a', () => {})
  const unsubscribeSecond = hub.subscribe('workspace-a', () => {})

  unsubscribeFirst()
  unsubscribeFirst()
  assert.deepEqual(testBridge.unwatchCalls, [])
  assert.equal(testBridge.activeChangeListeners.size, 1)

  unsubscribeSecond()
  assert.deepEqual(testBridge.unwatchCalls, ['workspace-a'])
  assert.equal(testBridge.activeChangeListeners.size, 0)
})

test('keeps notifying when the workspace watch request rejects', async () => {
  const activeChangeListeners = new Set<(workspaceId: string) => void>()
  let watchCount = 0
  const hub = createWorkspaceGitDiffChangeHub({
    watchWorkspaceDiff: () => {
      watchCount += 1
      return Promise.reject(new Error('watch unavailable'))
    },
    unwatchWorkspaceDiff: async () => {},
    onWorkspaceDiffChanged: (callback) => {
      activeChangeListeners.add(callback)
      return () => {
        activeChangeListeners.delete(callback)
      }
    },
  })
  let listenerCount = 0
  const unsubscribe = hub.subscribe('workspace-a', () => {
    listenerCount += 1
  })

  await flushTasks()
  for (const callback of activeChangeListeners) callback('workspace-a')
  assert.equal(watchCount, 1)
  assert.equal(listenerCount, 1)

  unsubscribe()
})

function flushTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
