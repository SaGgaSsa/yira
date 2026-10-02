import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  buildAgentCommand,
  buildAgentOverrideArgs,
  detectInstalledAgentProviders,
  normalizeResumeId,
} from './providers'

test('builds fixed provider commands from normalized arguments and safe resume ids', () => {
  assert.deepEqual(buildAgentCommand('claude', {
    enabled: true,
    args: [' --model ', '--permission-mode', 'acceptEdits', '', '--danger\n'],
  }), {
    provider: 'claude',
    command: 'claude',
    args: ['--model', '--permission-mode', 'acceptEdits'],
  })

  assert.deepEqual(buildAgentCommand('codex', {
    enabled: true,
    args: ['--profile', 'work'],
  }, 'session-123'), {
    provider: 'codex',
    command: 'codex',
    args: ['--profile', 'work', 'resume', 'session-123'],
  })
})

test('rejects resume identifiers that could be interpreted as paths or options', () => {
  assert.equal(normalizeResumeId(' session_01.A-9 '), 'session_01.A-9')
  for (const value of ['', '   ', '../secret', '/tmp/session', '-help', 'session id', 'session\\id', 'session\u0000id', 'a'.repeat(257), 42, null]) {
    assert.equal(normalizeResumeId(value), null, `expected ${String(value)} to be rejected`)
  }
})

test('builds validated provider override arguments in the provider option format', () => {
  assert.deepEqual(buildAgentOverrideArgs('claude', {
    model: 'claude-sonnet-4.5',
    permissionMode: 'acceptEdits',
  }), ['--model', 'claude-sonnet-4.5', '--permission-mode', 'acceptEdits'])
  assert.deepEqual(buildAgentOverrideArgs('claude', { permissionMode: 'default' }), [])
  assert.deepEqual(buildAgentOverrideArgs('codex', {
    model: 'gpt-5-codex',
    permissionMode: 'workspace-write',
  }), ['--model', 'gpt-5-codex', '--sandbox', 'workspace-write'])

  assert.throws(() => buildAgentOverrideArgs('claude', { model: '-unsafe' }), /invalid agent model/i)
  assert.throws(() => buildAgentOverrideArgs('claude', { permissionMode: 'workspace-write' }), /invalid Claude permission/i)
  assert.throws(() => buildAgentOverrideArgs('codex', { permissionMode: 'acceptEdits' }), /invalid Codex sandbox/i)
})

test('detects provider executables from PATH without invoking either provider', async () => {
  const root = await fs.mkdtemp(join(process.cwd(), '.tmp-agent-provider-'))
  try {
    await fs.writeFile(join(root, 'claude'), '#!/bin/sh\nexit 0', { mode: 0o755 })
    await fs.mkdir(join(root, 'codex'))
    const available = await detectInstalledAgentProviders({
      platform: 'linux',
      env: { PATH: root },
    })
    assert.deepEqual(available, { claude: true, codex: false })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
