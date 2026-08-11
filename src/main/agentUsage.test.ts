import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  AgentUsageProviderSnapshot,
  AgentUsageSnapshot,
} from '@shared/types'

import {
  AgentUsageService,
  type CodexAppServerClient,
  normalizeCodexRateLimits,
} from './agentUsage'

const FIRST_RESET = 1_800_000_000
const SECOND_RESET = 1_800_010_000

function fullRateLimits(primaryUsedPercent = 25, secondaryUsedPercent = 60): unknown {
  return {
    rateLimits: {
      primary: {
        usedPercent: primaryUsedPercent,
        windowDurationMins: 300,
        resetsAt: FIRST_RESET,
      },
      secondary: {
        usedPercent: secondaryUsedPercent,
        windowDurationMins: 10_080,
        resetsAt: SECOND_RESET,
      },
    },
  }
}

function withoutUpdatedAt(snapshot: AgentUsageProviderSnapshot): Omit<AgentUsageProviderSnapshot, 'updatedAt'> {
  const { updatedAt: _updatedAt, ...rest } = snapshot
  return rest
}

class FakeCodexClient implements CodexAppServerClient {
  readonly methods: string[] = []

  readonly requestParams: unknown[] = []

  private readonly listeners = new Set<(notification: { method: string; params?: unknown }) => void>()

  private readonly responses: unknown[]

  closed = false

  constructor(...responses: unknown[]) {
    this.responses = responses
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    this.methods.push(method)
    this.requestParams.push(params)
    return this.responses.shift() as T
  }

  onNotification(listener: (notification: { method: string; params?: unknown }) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async close(): Promise<void> {
    this.closed = true
  }

  emit(method: string, params?: unknown): void {
    for (const listener of this.listeners) listener({ method, params })
  }
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

test('normalizes Codex five-hour and weekly rate-limit windows into the safe contract', () => {
  const snapshot = normalizeCodexRateLimits(fullRateLimits(), { now: () => 1_700_000_000_000 })

  assert.deepEqual(withoutUpdatedAt(snapshot), {
    provider: 'codex',
    status: 'available',
    windows: [
      { kind: 'fiveHour', usedPercent: 25, resetsAt: new Date(FIRST_RESET * 1000).toISOString() },
      { kind: 'weekly', usedPercent: 60, resetsAt: new Date(SECOND_RESET * 1000).toISOString() },
    ],
  })
})

test('returns an available incomplete snapshot when one Codex window is missing', () => {
  const snapshot = normalizeCodexRateLimits({
    result: {
      rateLimits: {
        primary: {
          usedPercent: 10,
          windowDurationMins: 300,
          resetsAt: FIRST_RESET,
        },
        secondary: null,
      },
    },
  })

  assert.equal(snapshot.status, 'available')
  assert.deepEqual(snapshot.windows, [
    { kind: 'fiveHour', usedPercent: 10, resetsAt: new Date(FIRST_RESET * 1000).toISOString() },
  ])
})

test('rejects invalid percentages and timestamps without throwing or surfacing raw values', () => {
  const snapshot = normalizeCodexRateLimits({
    rateLimits: {
      primary: { usedPercent: Number.NaN, windowDurationMins: 300, resetsAt: FIRST_RESET },
      secondary: { usedPercent: 75, windowDurationMins: 10_080, resetsAt: 'not-a-timestamp' },
    },
  })

  assert.deepEqual(withoutUpdatedAt(snapshot), {
    provider: 'codex',
    status: 'unavailable',
    windows: [],
  })
})

test('merges a sparse Codex update before refreshing the complete snapshot', async () => {
  const client = new FakeCodexClient(fullRateLimits(), fullRateLimits(40, 65))
  const service = new AgentUsageService({
    getConfiguredProviders: () => ['codex'],
    codexClientFactory: async () => client,
    now: () => 1_700_000_000_000,
  })
  const received: AgentUsageSnapshot[] = []
  service.subscribe((snapshot) => received.push(snapshot))

  await service.start()
  assert.equal(client.methods.length, 1)

  client.emit('account/rateLimits/updated', {
    rateLimits: {
      primary: { usedPercent: 40, windowDurationMins: 300 },
    },
  })
  await flush()

  assert.equal(client.methods.length, 2)
  const codexSnapshots = received.map((snapshot) => snapshot.codex)
  assert.ok(codexSnapshots.some((snapshot) => snapshot.windows.some((window) => window.kind === 'fiveHour' && window.usedPercent === 40)))
  assert.deepEqual(codexSnapshots.at(-1)?.windows, [
    { kind: 'fiveHour', usedPercent: 40, resetsAt: new Date(FIRST_RESET * 1000).toISOString() },
    { kind: 'weekly', usedPercent: 65, resetsAt: new Date(SECOND_RESET * 1000).toISOString() },
  ])

  await service.stop()
})

test('ignores sparse Codex updates with unsupported durations', async () => {
  const client = new FakeCodexClient(fullRateLimits(), fullRateLimits(45, 65))
  const service = new AgentUsageService({
    getConfiguredProviders: () => ['codex'],
    codexClientFactory: async () => client,
  })
  const received: AgentUsageSnapshot[] = []
  service.subscribe((snapshot) => received.push(snapshot))

  await service.start()
  client.emit('account/rateLimits/updated', {
    rateLimits: {
      primary: {
        usedPercent: 99,
        windowDurationMins: 301,
        resetsAt: FIRST_RESET + 1,
      },
    },
  })
  await flush()

  assert.equal(client.methods.length, 2)
  assert.equal(received.some((snapshot) => snapshot.codex.windows.some((window) => window.usedPercent === 99)), false)
  assert.deepEqual(received.at(-1)?.codex.windows, [
    { kind: 'fiveHour', usedPercent: 45, resetsAt: new Date(FIRST_RESET * 1000).toISOString() },
    { kind: 'weekly', usedPercent: 65, resetsAt: new Date(SECOND_RESET * 1000).toISOString() },
  ])

  await service.stop()
})

test('deduplicates configured providers and never starts Codex when it is not configured', async () => {
  let factoryCalls = 0
  const client = new FakeCodexClient(fullRateLimits())
  const service = new AgentUsageService({
    getConfiguredProviders: () => ['codex', 'codex', 'claude', 'claude'],
    codexClientFactory: async () => {
      factoryCalls += 1
      return client
    },
  })

  await service.start()
  assert.equal(factoryCalls, 1)
  assert.equal(client.methods.length, 1)
  await service.stop()

  const unconfiguredClient = new FakeCodexClient(fullRateLimits())
  let unconfiguredFactoryCalls = 0
  const unconfigured = new AgentUsageService({
    getConfiguredProviders: () => ['claude', 'claude'],
    codexClientFactory: async () => {
      unconfiguredFactoryCalls += 1
      return unconfiguredClient
    },
  })
  await unconfigured.start()
  assert.equal(unconfiguredFactoryCalls, 0)
  assert.equal(unconfigured.getSnapshot().codex.status, 'unavailable')
  await unconfigured.stop()
})

test('passes the safe Claude snapshot from the passive reader through unchanged', async () => {
  const service = new AgentUsageService({
    getConfiguredProviders: () => ['claude'],
    providerReaders: {
      claude: () => ({
        status: 'available',
        windows: [
          { kind: 'fiveHour', usedPercent: 42.5, resetsAt: '2026-08-11T18:00:00.000Z' },
          { kind: 'weekly', usedPercent: 17, resetsAt: '2026-08-16T00:00:00.000Z' },
        ],
      }),
    },
  })

  await service.start()

  assert.deepEqual(service.getSnapshot().claude, {
    provider: 'claude',
    status: 'available',
    windows: [
      { kind: 'fiveHour', usedPercent: 42.5, resetsAt: '2026-08-11T18:00:00.000Z' },
      { kind: 'weekly', usedPercent: 17, resetsAt: '2026-08-16T00:00:00.000Z' },
    ],
  })

  await service.stop()
})

test('refreshes Codex on start, at the 60-second interval, and on update notifications', async () => {
  const client = new FakeCodexClient(fullRateLimits(), fullRateLimits(30, 70), fullRateLimits(35, 75))
  let scheduledRefresh: (() => void) | undefined
  let scheduledDelay: number | undefined
  const service = new AgentUsageService({
    getConfiguredProviders: () => ['codex'],
    codexClientFactory: async () => client,
    setIntervalFn: (callback, delay) => {
      scheduledRefresh = callback
      scheduledDelay = delay
      return Symbol('refresh')
    },
    clearIntervalFn: () => undefined,
  })

  await service.start()
  assert.equal(client.methods.length, 1)
  assert.equal(scheduledDelay, 60_000)

  scheduledRefresh?.()
  await flush()
  assert.equal(client.methods.length, 2)

  client.emit('account/rateLimits/updated', {
    rateLimits: {
      secondary: { usedPercent: 75, windowDurationMins: 10_080 },
    },
  })
  await flush()
  assert.equal(client.methods.length, 3)

  await service.stop()
  assert.equal(client.closed, true)
})
