import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PhaseTimeoutError,
  coordinateWindowClose,
  type CloseFailureDecision,
  type ClosePreparationPhase,
} from './windowCloseCoordinator'

test('flushes renderers before persisting the primary workspace', async () => {
  const calls: string[] = []

  const result = await coordinateWindowClose({
    flushRenderers: async () => { calls.push('flush') },
    persistPrimary: async () => { calls.push('persist') },
    promptFailure: async () => {
      throw new Error('prompt should not be shown')
    },
    timeoutMs: 50,
  })

  assert.equal(result, 'proceed')
  assert.deepEqual(calls, ['flush', 'persist'])
})

test('times out a renderer flush and allows cancellation', async () => {
  let promptedPhase: ClosePreparationPhase | null = null
  let promptedError: unknown

  const result = await coordinateWindowClose({
    flushRenderers: () => new Promise<void>(() => undefined),
    persistPrimary: async () => undefined,
    promptFailure: async ({ phase, error }) => {
      promptedPhase = phase
      promptedError = error
      return 'cancel'
    },
    timeoutMs: 5,
  })

  assert.equal(result, 'cancel')
  assert.equal(promptedPhase, 'flush')
  assert.ok(promptedError instanceof PhaseTimeoutError)
})

test('retry reruns both phases after persistence fails', async () => {
  const calls: string[] = []
  let persistAttempts = 0

  const result = await coordinateWindowClose({
    flushRenderers: async () => { calls.push('flush') },
    persistPrimary: async () => {
      calls.push('persist')
      persistAttempts += 1
      if (persistAttempts === 1) throw new Error('disk unavailable')
    },
    promptFailure: async (): Promise<CloseFailureDecision> => 'retry',
    timeoutMs: 50,
  })

  assert.equal(result, 'proceed')
  assert.deepEqual(calls, ['flush', 'persist', 'flush', 'persist'])
})

test('discard proceeds without running later phases', async () => {
  let persisted = false

  const result = await coordinateWindowClose({
    flushRenderers: async () => { throw new Error('renderer unavailable') },
    persistPrimary: async () => { persisted = true },
    promptFailure: async () => 'discard',
    timeoutMs: 50,
  })

  assert.equal(result, 'proceed')
  assert.equal(persisted, false)
})

test('cancel keeps the application open after persistence fails', async () => {
  const result = await coordinateWindowClose({
    flushRenderers: async () => undefined,
    persistPrimary: async () => { throw new Error('write failed') },
    promptFailure: async () => 'cancel',
    timeoutMs: 50,
  })

  assert.equal(result, 'cancel')
})
