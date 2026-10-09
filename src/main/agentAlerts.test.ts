import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeAgentAlert,
  SemanticAgentAlertState,
  type AgentAlert,
  type AgentAlertState,
} from './agentAlerts'

test('normalizes a minimal hook envelope and drops command, transcript, and arbitrary payload', () => {
  const normalized = normalizeAgentAlert({
    provider: ' CODEX ',
    event: ' Permission ',
    tileId: ' terminal-1 ',
    command: ['do-not-retain-this'],
    transcript: 'do-not-retain-this-either',
    hookPayload: { secret: 'do-not-retain-this-too' },
  })

  assert.deepEqual(normalized, {
    provider: 'codex',
    event: 'permission',
    tileId: 'terminal-1',
  })
  assert.equal(normalized && 'transcript' in normalized, false)
})

test('rejects non-envelope values and unknown providers or events', () => {
  assert.equal(normalizeAgentAlert('terminal output'), null)
  assert.equal(normalizeAgentAlert(null), null)
  assert.equal(normalizeAgentAlert({ provider: 'cursor', event: 'completed', tileId: 'terminal-1' }), null)
  assert.equal(normalizeAgentAlert({ provider: 'codex', event: 'output', tileId: 'terminal-1' }), null)
  assert.equal(normalizeAgentAlert({ provider: 'codex', event: 'completed', tileId: '' }), null)
})

test('deduplicates same-provider same-kind episodes and upgrades completion to intervention', () => {
  const changes: Array<{ tileId: string; state: AgentAlertState | null }> = []
  const state = new SemanticAgentAlertState({
    onChange: (tileId, next) => changes.push({ tileId, state: next }),
  })
  const completed: AgentAlert = { provider: 'codex', event: 'completed', tileId: 'terminal-1' }
  const permission: AgentAlert = { provider: 'codex', event: 'permission', tileId: 'terminal-1' }

  assert.equal(state.report(completed), true)
  assert.equal(state.report(completed), false)
  assert.deepEqual(state.get('terminal-1'), {
    ...completed,
    priority: 'normal',
  })

  assert.equal(state.report(permission), true)
  assert.equal(state.report(permission), false)
  assert.deepEqual(state.get('terminal-1'), {
    ...permission,
    priority: 'intervention',
  })
  assert.equal(changes.length, 2)
})

test('does not downgrade an intervention episode when completion arrives later', () => {
  const state = new SemanticAgentAlertState()

  assert.equal(state.report({ provider: 'claude', event: 'permission', tileId: 'terminal-2' }), true)
  assert.equal(state.report({ provider: 'claude', event: 'completed', tileId: 'terminal-2' }), false)
  assert.deepEqual(state.get('terminal-2'), {
    provider: 'claude',
    event: 'permission',
    tileId: 'terminal-2',
    priority: 'intervention',
  })
})

test('working clears a non-permission alert without retaining an alert episode', () => {
  const changes: Array<AgentAlertState | null> = []
  const state = new SemanticAgentAlertState({ onChange: (_tileId, next) => changes.push(next) })

  assert.equal(state.report({ provider: 'claude', event: 'input', tileId: 'working-tile' }), true)
  assert.equal(state.report({ provider: 'claude', event: 'working', tileId: 'working-tile' }), true)
  assert.equal(state.get('working-tile'), null)
  assert.deepEqual(changes.at(-1), null)
  assert.equal(state.report({ provider: 'claude', event: 'working', tileId: 'working-tile' }), false)
})

test('working does not clear a permission alert', () => {
  const state = new SemanticAgentAlertState()
  const permission: AgentAlert = { provider: 'claude', event: 'permission', tileId: 'permission-tile' }

  assert.equal(state.report(permission), true)
  assert.equal(state.report({ provider: 'claude', event: 'working', tileId: 'permission-tile' }), false)
  assert.deepEqual(state.get('permission-tile'), { ...permission, priority: 'intervention' })
})

test('focus, input, and destroy clear attention for a tile', () => {
  const state = new SemanticAgentAlertState()

  state.report({ provider: 'codex', event: 'completed', tileId: 'focus-tile' })
  assert.equal(state.clearOnFocus('focus-tile'), true)
  assert.equal(state.get('focus-tile'), null)

  state.report({ provider: 'codex', event: 'permission', tileId: 'input-tile' })
  assert.equal(state.clearOnInput('input-tile'), true)
  assert.equal(state.get('input-tile'), null)

  state.report({ provider: 'claude', event: 'input', tileId: 'destroy-tile' })
  assert.equal(state.clearOnDestroy('destroy-tile'), true)
  assert.equal(state.get('destroy-tile'), null)
})

test('disabled state clears retained alerts, emits clears, and ignores ordinary strings or PTY output', () => {
  const changes: Array<{ tileId: string; state: AgentAlertState | null }> = []
  const state = new SemanticAgentAlertState({
    enabled: false,
    onChange: (tileId, next) => changes.push({ tileId, state: next }),
  })

  assert.equal(state.report({ provider: 'codex', event: 'completed', tileId: 'disabled-tile' }), false)
  assert.equal(state.report('\u001b[31mordinary terminal output\u001b[0m' as unknown as AgentAlert), false)
  assert.equal(state.get('disabled-tile'), null)

  state.setEnabled(true)
  assert.equal(state.report({ provider: 'codex', event: 'input', tileId: 'disabled-tile' }), true)
  state.setEnabled(false)
  assert.equal(state.get('disabled-tile'), null)
  assert.deepEqual(changes.at(-1), { tileId: 'disabled-tile', state: null })
  assert.equal(state.report({ provider: 'codex', event: 'permission', tileId: 'disabled-tile' }), false)
})
