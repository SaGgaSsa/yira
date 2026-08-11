import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAgentHistoryQuery,
  canLaunchAgent,
  canResumeAgent,
  createAgentHistoryRefreshScheduler,
  filterAgentSessions,
  formatAgentAge,
  getAgentHistoryRefreshDelay,
  sanitizeAgentCwd,
  shouldShowAgentHistoryMore,
  shouldRequestAgentData,
} from './agentPanel'
import type { AgentActiveSessionSnapshot, AgentProviderAvailabilitySnapshot, AgentProvidersConfig } from '@shared/types'

const providerConfig: AgentProvidersConfig = {
  claude: { enabled: true, args: [] },
  codex: { enabled: true, args: [] },
}

const providerAvailability: AgentProviderAvailabilitySnapshot = {
  claude: { provider: 'claude', command: 'claude', configured: true, available: true },
  codex: { provider: 'codex', command: 'codex', configured: true, available: false },
}

test('buildAgentHistoryQuery includes the workspace provider and omits blank search text', () => {
  assert.deepEqual(buildAgentHistoryQuery('workspace-1', 'claude', ' release notes '), {
    workspaceId: 'workspace-1',
    provider: 'claude',
    search: 'release notes',
  })
  assert.deepEqual(buildAgentHistoryQuery('workspace-1', 'claude', '   '), {
    workspaceId: 'workspace-1',
    provider: 'claude',
  })
})

test('canLaunchAgent gates new and resumed sessions by provider configuration and availability', () => {
  assert.equal(canLaunchAgent('claude', providerConfig, providerAvailability, true), true)
  assert.equal(canLaunchAgent('codex', providerConfig, providerAvailability, true), false)
  assert.equal(canLaunchAgent('claude', { ...providerConfig, claude: { enabled: false, args: [] } }, providerAvailability, true), false)
  assert.equal(canLaunchAgent('claude', providerConfig, providerAvailability, false), false)
})

test('canResumeAgent only enables the selected provider with an available shell profile', () => {
  assert.equal(canResumeAgent('claude', 'claude', providerConfig, providerAvailability, true), true)
  assert.equal(canResumeAgent('codex', 'claude', providerConfig, providerAvailability, true), false)
  assert.equal(canResumeAgent('claude', undefined, providerConfig, providerAvailability, true), false)
  assert.equal(canResumeAgent('claude', 'claude', providerConfig, providerAvailability, false), false)
  assert.equal(canResumeAgent('claude', 'claude', {
    ...providerConfig,
    claude: { enabled: false, args: [] },
  }, providerAvailability, true), false)
  assert.equal(canResumeAgent('claude', 'claude', providerConfig, {
    ...providerAvailability,
    claude: { ...providerAvailability.claude, available: false },
  }, true), false)
})

test('agent data requests require a selected provider', () => {
  assert.equal(shouldRequestAgentData(undefined), false)
  assert.equal(shouldRequestAgentData('claude'), true)
})

test('filterAgentSessions keeps only the selected provider in the current workspace', () => {
  const snapshot: AgentActiveSessionSnapshot = {
    sessions: [
      {
        sessionId: 'claude-session',
        tileId: 'claude-tile',
        workspaceId: 'workspace-1',
        provider: 'claude',
        status: 'working',
        startedAt: '2026-08-10T12:00:00.000Z',
        lastActivityAt: '2026-08-10T12:01:00.000Z',
      },
      {
        sessionId: 'codex-session',
        tileId: 'codex-tile',
        workspaceId: 'workspace-1',
        provider: 'codex',
        status: 'working',
        startedAt: '2026-08-10T12:00:00.000Z',
        lastActivityAt: '2026-08-10T12:01:00.000Z',
      },
      {
        sessionId: 'other-workspace-session',
        tileId: 'other-workspace-tile',
        workspaceId: 'workspace-2',
        provider: 'claude',
        status: 'working',
        startedAt: '2026-08-10T12:00:00.000Z',
        lastActivityAt: '2026-08-10T12:01:00.000Z',
      },
    ],
  }

  assert.deepEqual(filterAgentSessions(snapshot, 'workspace-1', 'claude'), [snapshot.sessions[0]])
  assert.deepEqual(filterAgentSessions(snapshot, 'workspace-2', 'claude'), [snapshot.sessions[2]])
  assert.deepEqual(filterAgentSessions(snapshot, 'workspace-1', undefined), [])
})

test('sanitizeAgentCwd only returns safe workspace-relative paths', () => {
  assert.equal(sanitizeAgentCwd(undefined), null)
  assert.equal(sanitizeAgentCwd('.'), '.')
  assert.equal(sanitizeAgentCwd('packages\\app'), 'packages/app')
  assert.equal(sanitizeAgentCwd('/outside'), null)
  assert.equal(sanitizeAgentCwd('../outside'), null)
  assert.equal(sanitizeAgentCwd('packages/../outside'), null)
  assert.equal(sanitizeAgentCwd('packages/\u0000app'), null)
})

test('formatAgentAge handles invalid, future, and elapsed timestamps defensively', () => {
  const now = Date.parse('2026-08-10T12:00:00.000Z')
  assert.equal(formatAgentAge('not-a-date', now), 'Unknown age')
  assert.equal(formatAgentAge('2026-08-10T12:00:30.000Z', now), 'in a moment')
  assert.equal(formatAgentAge('2026-08-10T11:58:00.000Z', now), '2 minutes ago')
  assert.equal(formatAgentAge('2026-08-10T10:00:00.000Z', now), '2 hours ago')
})

test('agent history refresh delay is immediate for defaults and debounced for searches', () => {
  if (getAgentHistoryRefreshDelay('') !== 0) {
    throw new Error('default history must refresh immediately')
  }
  if (getAgentHistoryRefreshDelay('   ') !== 0) {
    throw new Error('cleared history search must refresh immediately')
  }
  if (getAgentHistoryRefreshDelay('release notes') !== 250) {
    throw new Error('history searches must wait briefly before refreshing')
  }
})

test('agent history refresh runNow cancels pending scheduled callbacks', () => {
  const callbacks = new Map<number, () => void>()
  let nextTimer = 0
  const scheduler = createAgentHistoryRefreshScheduler({
    setTimeout: (callback) => {
      const timer = ++nextTimer
      callbacks.set(timer, callback)
      return timer
    },
    clearTimeout: (timer) => callbacks.delete(timer),
  })
  let scheduledRuns = 0
  let immediateRuns = 0

  scheduler.schedule(250, () => {
    scheduledRuns += 1
  })
  scheduler.runNow(() => {
    immediateRuns += 1
  })

  for (const callback of callbacks.values()) callback()
  if (scheduledRuns !== 0 || immediateRuns !== 1) {
    throw new Error('an immediate history refresh must cancel delayed work')
  }
})

test('agent history more indicator stays visible while retained history is loading', () => {
  assert.equal(shouldShowAgentHistoryMore('idle', true), false)
  assert.equal(shouldShowAgentHistoryMore('loading', true), true)
  assert.equal(shouldShowAgentHistoryMore('ready', true), true)
  assert.equal(shouldShowAgentHistoryMore('error', true), false)
  assert.equal(shouldShowAgentHistoryMore('loading', false), false)
  assert.equal(shouldShowAgentHistoryMore('ready', false), false)
})
