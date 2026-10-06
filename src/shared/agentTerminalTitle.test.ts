import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_AGENT_TERMINAL_TITLE_LENGTH, normalizeAgentTerminalTitle } from './agentTerminalTitle'

test('keeps the agent terminal title as set, without control characters', () => {
  assert.equal(normalizeAgentTerminalTitle('✳ Fix the login flow'), '✳ Fix the login flow')
  assert.equal(normalizeAgentTerminalTitle('⠂ Fix the login flow'), '⠂ Fix the login flow')
  assert.equal(normalizeAgentTerminalTitle('Fix\u0007 the login flow '), 'Fix the login flow')
})

test('returns an empty title for blank or invalid values', () => {
  assert.equal(normalizeAgentTerminalTitle('  '), '')
  assert.equal(normalizeAgentTerminalTitle('\u001b'), '')
  assert.equal(normalizeAgentTerminalTitle(undefined), '')
  assert.equal(normalizeAgentTerminalTitle('x'.repeat(300)).length, MAX_AGENT_TERMINAL_TITLE_LENGTH)
})
