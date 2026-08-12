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
    drainTerminals: async () => undefined,
    promptFailure: async () => {
      throw new Error('prompt should not be shown')
    },
    timeoutMs: 50,
  })

  assert.equal(result, 'proceed')
  assert.deepEqual(calls, ['flush', 'persist'])
})

test('runs terminal draining after flushing and persisting', async () => {
  const calls: string[] = []

  const result = await coordinateWindowClose({
    flushRenderers: async () => { calls.push('flush') },
    persistPrimary: async () => { calls.push('persist') },
    drainTerminals: async () => { calls.push('terminals') },
    promptFailure: async () => {
      throw new Error('prompt should not be shown')
    },
    timeoutMs: 50,
  })

  assert.equal(result, 'proceed')
  assert.deepEqual(calls, ['flush', 'persist', 'terminals'])
})

test('retry reruns all phases after terminal draining fails', async () => {
  const calls: string[] = []
  let drainAttempts = 0

  const result = await coordinateWindowClose({
    flushRenderers: async () => { calls.push('flush') },
    persistPrimary: async () => { calls.push('persist') },
    drainTerminals: async () => {
      calls.push('terminals')
      drainAttempts += 1
      if (drainAttempts === 1) throw new Error('terminal shutdown failed')
    },
    promptFailure: async () => 'retry',
    timeoutMs: 50,
  })

  assert.equal(result, 'proceed')
  assert.deepEqual(calls, ['flush', 'persist', 'terminals', 'flush', 'persist', 'terminals'])
})

test('times out a terminal drain and allows cancellation', async () => {
  let promptedPhase: ClosePreparationPhase | null = null
  let promptedError: unknown

  const result = await coordinateWindowClose({
    flushRenderers: async () => undefined,
    persistPrimary: async () => undefined,
    drainTerminals: () => new Promise<void>(() => undefined),
    promptFailure: async ({ phase, error }) => {
      promptedPhase = phase
      promptedError = error
      return 'cancel'
    },
    timeoutMs: 5,
  })

  assert.equal(result, 'cancel')
  assert.equal(promptedPhase, 'terminals')
  assert.ok(promptedError instanceof PhaseTimeoutError)
})

test('times out a renderer flush and allows cancellation', async () => {
  let promptedPhase: ClosePreparationPhase | null = null
  let promptedError: unknown

  const result = await coordinateWindowClose({
    flushRenderers: () => new Promise<void>(() => undefined),
    persistPrimary: async () => undefined,
    drainTerminals: async () => undefined,
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
    drainTerminals: async () => undefined,
    promptFailure: async (): Promise<CloseFailureDecision> => 'retry',
    timeoutMs: 50,
  })

  assert.equal(result, 'proceed')
  assert.deepEqual(calls, ['flush', 'persist', 'flush', 'persist'])
})

test('discards a flush failure only after draining terminals', async () => {
  const calls: string[] = []

  const result = await coordinateWindowClose({
    flushRenderers: async () => {
      calls.push('flush')
      throw new Error('renderer unavailable')
    },
    persistPrimary: async () => { calls.push('persist') },
    drainTerminals: async () => { calls.push('terminals') },
    promptFailure: async () => 'discard',
    timeoutMs: 50,
  })

  assert.equal(result, 'proceed')
  assert.deepEqual(calls, ['flush', 'terminals'])
})

test('discards a persistence failure only after draining terminals', async () => {
  const calls: string[] = []

  const result = await coordinateWindowClose({
    flushRenderers: async () => { calls.push('flush') },
    persistPrimary: async () => {
      calls.push('persist')
      throw new Error('disk unavailable')
    },
    drainTerminals: async () => { calls.push('terminals') },
    promptFailure: async () => 'discard',
    timeoutMs: 50,
  })

  assert.equal(result, 'proceed')
  assert.deepEqual(calls, ['flush', 'persist', 'terminals'])
})

test('discard proceeds when terminal draining fails after an earlier failure', async () => {
  const calls: string[] = []
  let promptCalls = 0

  const result = await coordinateWindowClose({
    flushRenderers: async () => {
      calls.push('flush')
      throw new Error('renderer unavailable')
    },
    persistPrimary: async () => { calls.push('persist') },
    drainTerminals: async () => {
      calls.push('terminals')
      throw new Error('terminal shutdown failed')
    },
    promptFailure: async () => {
      promptCalls += 1
      return 'discard'
    },
    timeoutMs: 50,
  })

  assert.equal(result, 'proceed')
  assert.equal(promptCalls, 1)
  assert.deepEqual(calls, ['flush', 'terminals'])
})

test('discard proceeds without persisting after a flush failure', async () => {
  let persisted = false

  const result = await coordinateWindowClose({
    flushRenderers: async () => { throw new Error('renderer unavailable') },
    persistPrimary: async () => { persisted = true },
    drainTerminals: async () => undefined,
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
    drainTerminals: async () => undefined,
    promptFailure: async () => 'cancel',
    timeoutMs: 50,
  })

  assert.equal(result, 'cancel')
})
