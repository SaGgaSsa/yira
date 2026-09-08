import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createWorkspaceGitDiffRequestController,
  hasConfiguredWorkspaceGitDiff,
} from './useWorkspaceGitDiff'

test('requires a root folder and at least one configured repository', () => {
  assert.equal(hasConfiguredWorkspaceGitDiff(undefined, ['.']), false)
  assert.equal(hasConfiguredWorkspaceGitDiff('/workspace', []), false)
  assert.equal(hasConfiguredWorkspaceGitDiff('/workspace', ['  ']), false)
  assert.equal(hasConfiguredWorkspaceGitDiff('  /workspace  ', ['  repo  ']), true)
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
