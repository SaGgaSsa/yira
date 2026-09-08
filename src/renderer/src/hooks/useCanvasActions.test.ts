import assert from 'node:assert/strict'
import test from 'node:test'
import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'
import { removeTileAfterTerminalRuntimeCleanup } from './useCanvasActions'

test('removeTileAfterTerminalRuntimeCleanup waits before removing the terminal tile', async () => {
  const events: string[] = []
  let releaseCleanup = (): void => {}
  const cleanupReleased = new Promise<void>((resolve) => {
    releaseCleanup = () => resolve()
  })

  const removal = removeTileAfterTerminalRuntimeCleanup({
    tile: { id: 'terminal-a', type: 'terminal' },
    workspaceId: 'workspace-a',
    destroyTerminalRuntime: async (target: TerminalSessionTarget) => {
      events.push(`destroy:${target.workspaceId}/${target.tileId}`)
      await cleanupReleased
      events.push('destroyed')
    },
    removeTile: (tileId: string) => events.push(`remove:${tileId}`),
  })

  await Promise.resolve()
  assert.deepEqual(events, ['destroy:workspace-a/terminal-a'])

  releaseCleanup()
  await removal
  assert.deepEqual(events, [
    'destroy:workspace-a/terminal-a',
    'destroyed',
    'remove:terminal-a',
  ])
})

test('removeTileAfterTerminalRuntimeCleanup preserves non-terminal tile removal', async () => {
  const events: string[] = []

  await removeTileAfterTerminalRuntimeCleanup({
    tile: { id: 'note-a', type: 'note' },
    workspaceId: 'workspace-a',
    destroyTerminalRuntime: async () => {
      events.push('destroy')
    },
    removeTile: (tileId: string) => events.push(`remove:${tileId}`),
  })

  assert.deepEqual(events, ['remove:note-a'])
})
