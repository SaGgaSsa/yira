import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getClaudeStatusLineState,
  installClaudeStatusLine,
  uninstallClaudeStatusLine,
} from './claudeStatusLineConfiguration'

const clientCommand = 'node "/opt/yira/resources/claude-statusline-capture.mjs"'

function parse(text: string): Record<string, any> {
  return JSON.parse(text) as Record<string, any>
}

test('installs statusLine when none exists and removes it cleanly', () => {
  const installed = installClaudeStatusLine('{}', clientCommand)
  assert.equal(installed.status, 'installed')
  assert.equal(getClaudeStatusLineState(installed.text, clientCommand).status, 'active')
  const removed = uninstallClaudeStatusLine(installed.text, clientCommand)
  assert.equal(removed.status, 'uninstalled')
  assert.deepEqual(parse(removed.text), {})
})

test('chains and restores the complete user statusLine including padding', () => {
  const original = '{\n  "model": "sonnet",\n  "statusLine": {\n    "type": "command",\n    "command": "printf custom",\n    "padding": 7,\n    "refreshInterval": 12\n  }\n}\n'
  const installed = installClaudeStatusLine(original, clientCommand)
  assert.equal(getClaudeStatusLineState(original, clientCommand).status, 'chainable')
  assert.match(parse(installed.text).statusLine.command, /--yira-chain=/)
  const removed = uninstallClaudeStatusLine(installed.text, clientCommand)
  assert.equal(parse(removed.text).statusLine.padding, 7)
  assert.equal(parse(removed.text).statusLine.refreshInterval, 12)
  assert.equal(parse(removed.text).statusLine.command, 'printf custom')
  assert.deepEqual(parse(removed.text), parse(original))
})

test('reinstalling is idempotent and preserves the original chain', () => {
  const original = JSON.stringify({ statusLine: { type: 'command', command: 'custom', padding: 4 } }, null, 2)
  const installed = installClaudeStatusLine(original, clientCommand)
  const repeated = installClaudeStatusLine(installed.text, clientCommand)
  assert.equal(repeated.status, 'already-installed')
  assert.equal(repeated.changed, false)
  assert.equal(repeated.text, installed.text)
  assert.deepEqual(parse(uninstallClaudeStatusLine(repeated.text, clientCommand).text), parse(original))
})

test('repairs an outdated client command while retaining its chained statusLine', () => {
  const original = JSON.stringify({ statusLine: { type: 'command', command: 'custom', padding: 3 } }, null, 2)
  const old = installClaudeStatusLine(original, 'node old-client')
  assert.equal(getClaudeStatusLineState(old.text, clientCommand).status, 'outdated')
  const repaired = installClaudeStatusLine(old.text, clientCommand)
  assert.equal(repaired.status, 'installed')
  assert.equal(getClaudeStatusLineState(repaired.text, clientCommand).status, 'active')
  assert.deepEqual(parse(uninstallClaudeStatusLine(repaired.text, clientCommand).text), parse(original))
})

test('reports malformed JSON and unsupported statusLine values', () => {
  assert.equal(getClaudeStatusLineState('{', clientCommand).status, 'malformed')
  assert.equal(installClaudeStatusLine('{', clientCommand).status, 'malformed')
  assert.equal(getClaudeStatusLineState('{"statusLine": []}', clientCommand).status, 'unsupported')
  assert.equal(installClaudeStatusLine('{"statusLine": "custom"}', clientCommand).status, 'unsupported')
})

test('uninstall leaves a user-owned statusLine unchanged', () => {
  const original = JSON.stringify({ statusLine: { type: 'command', command: 'user-command' } })
  const result = uninstallClaudeStatusLine(original, clientCommand)
  assert.equal(result.status, 'already-uninstalled')
  assert.equal(result.text, original)
})
