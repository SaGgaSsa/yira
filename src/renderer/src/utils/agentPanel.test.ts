import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_HISTORY_PAGE_SIZE,
  buildAgentHistoryQuery,
  canLaunchAgent,
  canResumeAgent,
  createAgentHistoryRefreshScheduler,
  filterAgentSessions,
  formatAgentAge,
  getAgentHistoryRefreshDelay,
  sanitizeAgentCwd,
  shouldShowAgentHistoryPager,
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
    offset: 0,
    limit: AGENT_HISTORY_PAGE_SIZE,
  })
  assert.deepEqual(buildAgentHistoryQuery('workspace-1', 'claude', '   '), {
    workspaceId: 'workspace-1',
    provider: 'claude',
    offset: 0,
    limit: AGENT_HISTORY_PAGE_SIZE,
  })
})

test('buildAgentHistoryQuery requests one fixed page of newest-first sessions', () => {
  assert.equal(AGENT_HISTORY_PAGE_SIZE, 10)
  assert.deepEqual(buildAgentHistoryQuery('workspace-1', 'claude', '', 3), {
    workspaceId: 'workspace-1',
    provider: 'claude',
    offset: 30,
    limit: 10,
  })
  assert.deepEqual(buildAgentHistoryQuery('workspace-1', 'codex', ' release notes ', 2), {
    workspaceId: 'workspace-1',
    provider: 'codex',
    search: 'release notes',
    offset: 20,
    limit: 10,
  })
  assert.deepEqual(buildAgentHistoryQuery('workspace-1', 'claude', '', -2), {
    workspaceId: 'workspace-1',
    provider: 'claude',
    offset: 0,
    limit: 10,
  })
  assert.deepEqual(buildAgentHistoryQuery('workspace-1', 'claude', '', 1.5), {
    workspaceId: 'workspace-1',
    provider: 'claude',
    offset: 10,
    limit: 10,
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
  if (getAgentHistoryRefreshDelay('release notes') !== 600) {
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

test('agent history pager shows while paging results load or a neighboring page exists', () => {
  assert.equal(shouldShowAgentHistoryPager('idle', 0, true), false)
  assert.equal(shouldShowAgentHistoryPager('idle', 2, true), false)
  assert.equal(shouldShowAgentHistoryPager('loading', 0, true), true)
  assert.equal(shouldShowAgentHistoryPager('loading', 0, false), false)
  assert.equal(shouldShowAgentHistoryPager('loading', 2, false), true)
  assert.equal(shouldShowAgentHistoryPager('ready', 0, true), true)
  assert.equal(shouldShowAgentHistoryPager('ready', 0, false), false)
  assert.equal(shouldShowAgentHistoryPager('ready', 2, false), true)
  assert.equal(shouldShowAgentHistoryPager('error', 2, true), false)
})
