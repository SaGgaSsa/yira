import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildAgentHistoryQuery,
  canLaunchAgent,
  formatAgentAge,
  sanitizeAgentCwd,
} from './agentPanel'
import type { AgentProviderAvailabilitySnapshot, AgentProvidersConfig } from '@shared/types'

const providerConfig: AgentProvidersConfig = {
  claude: { enabled: true, args: [] },
  codex: { enabled: true, args: [] },
}

const providerAvailability: AgentProviderAvailabilitySnapshot = {
  claude: { provider: 'claude', command: 'claude', configured: true, available: true },
  codex: { provider: 'codex', command: 'codex', configured: true, available: false },
}

test('buildAgentHistoryQuery scopes workspace history and omits blank search text', () => {
  assert.deepEqual(buildAgentHistoryQuery('workspace', 'workspace-1', '  release notes  '), {
    workspaceId: 'workspace-1',
    search: 'release notes',
  })
  assert.deepEqual(buildAgentHistoryQuery('workspace', 'workspace-1', '   '), {
    workspaceId: 'workspace-1',
  })
})

test('buildAgentHistoryQuery leaves workspaceId out for all-local history', () => {
  assert.deepEqual(buildAgentHistoryQuery('all', 'workspace-1', 'fix auth'), {
    search: 'fix auth',
  })
})

test('canLaunchAgent gates new and resumed sessions by provider configuration and availability', () => {
  assert.equal(canLaunchAgent('claude', providerConfig, providerAvailability, true), true)
  assert.equal(canLaunchAgent('codex', providerConfig, providerAvailability, true), false)
  assert.equal(canLaunchAgent('claude', { ...providerConfig, claude: { enabled: false, args: [] } }, providerAvailability, true), false)
  assert.equal(canLaunchAgent('claude', providerConfig, providerAvailability, false), false)
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
