import assert from 'node:assert/strict'
import test from 'node:test'
import { getEffectiveAgentProvider, getEnabledAgentProviders } from './effectiveAgent'

test('treats a disabled workspace agent as absent', () => {
  const config = { agentProvider: 'claude' as const }
  assert.equal(getEffectiveAgentProvider(config, { claude: { enabled: false }, codex: { enabled: true } }), undefined)
  assert.equal(getEffectiveAgentProvider(config, { claude: { enabled: true }, codex: { enabled: false } }), 'claude')
})

test('returns only globally enabled providers for Activity filters', () => {
  assert.deepEqual(
    getEnabledAgentProviders({ claude: { enabled: false }, codex: { enabled: true } }),
    ['codex'],
  )
})
