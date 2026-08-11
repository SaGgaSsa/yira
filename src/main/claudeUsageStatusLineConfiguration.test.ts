import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  buildManagedClaudeUsageStatusLineCommand,
  installClaudeUsageStatusLineConfiguration,
  uninstallClaudeUsageStatusLineConfiguration,
  YIRA_CLAUDE_USAGE_STATUS_LINE_MARKER,
} from './claudeUsageStatusLineConfiguration'

const clientCommand = '/usr/bin/node /opt/yira/resources/claude-usage-status-line.mjs'

function parse(text: string): Record<string, any> {
  return JSON.parse(text) as Record<string, any>
}

const managedCommand = buildManagedClaudeUsageStatusLineCommand(clientCommand)

test('builds a clearly marked managed status-line command', () => {
  assert.equal(managedCommand, `${clientCommand} ${YIRA_CLAUDE_USAGE_STATUS_LINE_MARKER}`)
})

test('installs a managed statusLine while preserving unrelated settings', () => {
  const original = JSON.stringify({ model: 'sonnet', enabled: true }, null, 2) + '\n'
  const result = installClaudeUsageStatusLineConfiguration(original, clientCommand)

  assert.equal(result.ok, true)
  assert.equal(result.status, 'installed')
  assert.equal(result.changed, true)
  assert.deepEqual(parse(result.text), {
    model: 'sonnet',
    enabled: true,
    statusLine: { type: 'command', command: managedCommand },
  })
})

test('managed statusLine installation is idempotent', () => {
  const installed = installClaudeUsageStatusLineConfiguration('{}', clientCommand)
  const repeated = installClaudeUsageStatusLineConfiguration(installed.text, clientCommand)

  assert.equal(repeated.ok, true)
  assert.equal(repeated.status, 'already-installed')
  assert.equal(repeated.changed, false)
  assert.equal(repeated.text, installed.text)
})

test('uninstalls only the untouched managed statusLine and restores settings', () => {
  const original = JSON.stringify({ model: 'sonnet', enabled: true }, null, 2) + '\n'
  const installed = installClaudeUsageStatusLineConfiguration(original, clientCommand)
  const result = uninstallClaudeUsageStatusLineConfiguration(installed.text, clientCommand)

  assert.equal(result.ok, true)
  assert.equal(result.status, 'uninstalled')
  assert.equal(result.changed, true)
  assert.equal(result.text, original)
})

test('uninstall is idempotent when no statusLine is configured', () => {
  const original = '{\n  "model": "sonnet"\n}\n'
  const result = uninstallClaudeUsageStatusLineConfiguration(original, clientCommand)

  assert.equal(result.ok, true)
  assert.equal(result.status, 'already-uninstalled')
  assert.equal(result.changed, false)
  assert.equal(result.text, original)
})

test('foreign statusLine configuration is preserved and reported as a conflict', () => {
  const original = JSON.stringify({
    model: 'sonnet',
    statusLine: { type: 'command', command: 'other-status-line' },
  }, null, 2)

  const install = installClaudeUsageStatusLineConfiguration(original, clientCommand)
  assert.equal(install.ok, false)
  assert.equal(install.status, 'conflict')
  assert.equal(install.changed, false)
  assert.equal(install.text, original)

  const uninstall = uninstallClaudeUsageStatusLineConfiguration(original, clientCommand)
  assert.equal(uninstall.ok, false)
  assert.equal(uninstall.status, 'conflict')
  assert.equal(uninstall.changed, false)
  assert.equal(uninstall.text, original)
})

test('an altered managed command is reported as a conflict and never overwritten', () => {
  const installed = installClaudeUsageStatusLineConfiguration('{}', clientCommand)
  const changed = parse(installed.text)
  changed.statusLine.command = `${managedCommand} --changed`
  const original = JSON.stringify(changed, null, 2)

  const install = installClaudeUsageStatusLineConfiguration(original, clientCommand)
  assert.equal(install.ok, false)
  assert.equal(install.status, 'conflict')
  assert.equal(install.changed, false)
  assert.equal(install.text, original)

  const uninstall = uninstallClaudeUsageStatusLineConfiguration(original, clientCommand)
  assert.equal(uninstall.ok, false)
  assert.equal(uninstall.status, 'conflict')
  assert.equal(uninstall.changed, false)
  assert.equal(uninstall.text, original)
})

test('a managed marker on an incompatible statusLine shape is a conflict', () => {
  const original = JSON.stringify({
    statusLine: { type: 'script', command: managedCommand },
  }, null, 2)

  const result = installClaudeUsageStatusLineConfiguration(original, clientCommand)
  assert.equal(result.ok, false)
  assert.equal(result.status, 'conflict')
  assert.equal(result.text, original)
})

test('malformed or unsupported settings are reported without changing text', () => {
  const malformed = '{ "statusLine": '
  const malformedResult = installClaudeUsageStatusLineConfiguration(malformed, clientCommand)
  assert.equal(malformedResult.ok, false)
  assert.equal(malformedResult.status, 'malformed')
  assert.equal(malformedResult.text, malformed)

  const unsupported = '[]'
  const unsupportedResult = installClaudeUsageStatusLineConfiguration(unsupported, clientCommand)
  assert.equal(unsupportedResult.ok, false)
  assert.equal(unsupportedResult.status, 'unsupported')
  assert.equal(unsupportedResult.text, unsupported)
})

test('invalid client commands are rejected before configuration mutation', () => {
  const original = '{}'
  const result = installClaudeUsageStatusLineConfiguration(original, `  ${YIRA_CLAUDE_USAGE_STATUS_LINE_MARKER} `)

  assert.equal(result.ok, false)
  assert.equal(result.status, 'invalid')
  assert.equal(result.changed, false)
  assert.equal(result.text, original)
})

test('statusLine entries with unrelated extra fields are treated as conflicts', () => {
  const installed = installClaudeUsageStatusLineConfiguration('{}', clientCommand)
  const changed = parse(installed.text)
  changed.statusLine.refreshInterval = 10
  const original = JSON.stringify(changed, null, 2)

  const result = uninstallClaudeUsageStatusLineConfiguration(original, clientCommand)
  assert.equal(result.ok, false)
  assert.equal(result.status, 'conflict')
  assert.equal(result.text, original)
})
