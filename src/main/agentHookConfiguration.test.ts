import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  buildManagedAgentHookCommand,
  CLAUDE_HOOK_SPECS,
  CODEX_HOOK_SPECS,
  hasManagedAgentHooks,
  uninstallClaudeHookConfiguration,
  uninstallCodexHookConfiguration,
} from './agentHookConfiguration'
import type { ClaudeHookSpec, CodexHookSpec } from './agentHookConfiguration'

const clientCommand = '/opt/yira/resources/agent-hook-client.mjs'

type HookGroups = Record<string, unknown[]>

function managedEntry(provider: 'codex' | 'claude', spec: CodexHookSpec | ClaudeHookSpec): Record<string, unknown> {
  const hook = {
    type: 'command',
    command: buildManagedAgentHookCommand(clientCommand, provider, spec.normalizedEvent),
    ...('async' in spec && spec.async === true ? { async: true } : {}),
  }
  if (provider === 'codex') return { hooks: [hook] }
  const claudeSpec = spec as ClaudeHookSpec
  return claudeSpec.matcher === undefined ? { hooks: [hook] } : { matcher: claudeSpec.matcher, hooks: [hook] }
}

function withManagedHooks(provider: 'codex' | 'claude', existing: HookGroups = {}): HookGroups {
  const specs = provider === 'codex' ? CODEX_HOOK_SPECS : CLAUDE_HOOK_SPECS
  const hooks: HookGroups = {}
  for (const [key, entries] of Object.entries(existing)) hooks[key] = [...entries]
  for (const spec of specs) {
    hooks[spec.event] = [...(hooks[spec.event] ?? []), managedEntry(provider, spec)]
  }
  return hooks
}

function managedCodexConfig(extra: Record<string, unknown> = {}, existing: HookGroups = {}): string {
  return JSON.stringify({ ...extra, hooks: withManagedHooks('codex', existing) }, null, 2)
}

function managedClaudeConfig(extra: Record<string, unknown> = {}, existing: HookGroups = {}): string {
  return JSON.stringify({ ...extra, hooks: withManagedHooks('claude', existing) }, null, 2)
}

function parse(text: string): Record<string, any> {
  return JSON.parse(text) as Record<string, any>
}

test('managed hook detection is read-only and identifies Yira markers', () => {
  assert.equal(hasManagedAgentHooks(managedClaudeConfig(), 'claude'), true)
  assert.equal(hasManagedAgentHooks(managedCodexConfig(), 'codex'), true)
  assert.equal(hasManagedAgentHooks('{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"other"}]}]}}', 'codex'), false)
})

test('Codex uninstall restores unrelated content', () => {
  const original = {
    notify: ['desktop'],
    hooks: {
      notify: [{ type: 'command', command: 'other-client' }],
      Stop: [{ hooks: [{ type: 'command', command: 'existing-stop' }] }],
    },
  }
  const managed = { ...original, hooks: withManagedHooks('codex', original.hooks) }
  const result = uninstallCodexHookConfiguration(`${JSON.stringify(managed, null, 2)}\n`, clientCommand)

  assert.equal(result.ok, true)
  assert.equal(result.status, 'uninstalled')
  assert.equal(result.changed, true)
  assert.deepEqual(parse(result.text), original)
  assert.equal(result.text.endsWith('\n'), true)
})

test('Codex uninstall is a no-op when no managed entries exist', () => {
  const original = '{\n  "notify": ["desktop"]\n}\n'
  const result = uninstallCodexHookConfiguration(original, clientCommand)

  assert.equal(result.status, 'already-uninstalled')
  assert.equal(result.changed, false)
  assert.equal(result.text, original)
})

test('Codex malformed JSON is reported without overwriting text', () => {
  const original = '{ "hooks": '
  const result = uninstallCodexHookConfiguration(original, clientCommand)

  assert.equal(result.ok, false)
  assert.equal(result.status, 'malformed')
  assert.equal(result.changed, false)
  assert.equal(result.text, original)
  assert.match(result.message, /malformed JSON/i)
})

test('Codex inline event hooks are rejected without changing the config', () => {
  const original = JSON.stringify({ hooks: { Stop: [{ type: 'command', command: 'inline' }] } })
  const result = uninstallCodexHookConfiguration(original, clientCommand)

  assert.equal(result.ok, false)
  assert.equal(result.status, 'unsupported')
  assert.equal(result.changed, false)
  assert.equal(result.text, original)
  assert.match(result.message, /Stop/i)
})

test('Codex changed managed command is a conflict', () => {
  const changed = parse(managedCodexConfig())
  changed.hooks.Stop[0].hooks[0].command =
    `${clientCommand} --yira-managed-agent-hook=codex --yira-normalized-event=completed --changed`
  const changedText = JSON.stringify(changed, null, 2)

  const result = uninstallCodexHookConfiguration(changedText, clientCommand)
  assert.equal(result.ok, false)
  assert.equal(result.status, 'conflict')
  assert.equal(result.changed, false)
  assert.equal(result.text, changedText)
})

test('Claude managed configuration contains all six lifecycle and Notification groups', () => {
  const config = parse(managedClaudeConfig())

  assert.deepEqual(Object.keys(config), ['hooks'])
  assert.deepEqual(Object.keys(config.hooks), [
    'UserPromptSubmit',
    'PostToolUse',
    'Stop',
    'StopFailure',
    'Notification',
  ])

  for (const spec of CLAUDE_HOOK_SPECS) {
    const matchingGroup = config.hooks[spec.event].find((entry: any) =>
      spec.matcher === undefined ? !('matcher' in entry) : entry.matcher === spec.matcher,
    )
    assert.ok(matchingGroup, `missing ${spec.event} group`)
    const expectedHook = {
      type: 'command',
      command: expectManagedCommand(spec.normalizedEvent),
      ...(spec.async ? { async: true } : {}),
    }
    assert.deepEqual(matchingGroup, {
      ...(spec.matcher === undefined ? {} : { matcher: spec.matcher }),
      hooks: [expectedHook],
    })
  }
  assert.equal(config.hooks.Notification.length, 2)
})

function expectManagedCommand(normalizedEvent: string): string {
  return `${clientCommand} --yira-managed-agent-hook=claude --yira-normalized-event=${normalizedEvent}`
}

test('Claude uninstall preserves settings and unrelated Notification hooks', () => {
  const original = {
    model: 'sonnet',
    hooks: {
      Notification: [
        {
          matcher: 'auth_success',
          hooks: [{ type: 'command', command: 'other-client' }],
        },
      ],
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'stop-client' }] }],
    },
  }
  const managed = { ...original, hooks: withManagedHooks('claude', original.hooks) }
  const result = uninstallClaudeHookConfiguration(JSON.stringify(managed, null, 2), clientCommand)

  assert.equal(result.status, 'uninstalled')
  assert.equal(result.changed, true)
  assert.deepEqual(parse(result.text), original)
})

test('Claude uninstall removes all six managed groups and preserves user hooks', () => {
  const original = {
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'user-prompt-client' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'user-stop-client' }] }],
      Notification: [{ matcher: 'auth_success', hooks: [{ type: 'command', command: 'other-client' }] }],
    },
  }
  const managed = { ...original, hooks: withManagedHooks('claude', original.hooks) }
  const result = uninstallClaudeHookConfiguration(JSON.stringify(managed, null, 2), clientCommand)

  assert.equal(result.status, 'uninstalled')
  assert.deepEqual(parse(result.text), original)
  assert.equal(hasManagedAgentHooks(result.text, 'claude'), false)
})

test('Claude malformed JSON is reported without overwriting text', () => {
  const original = '{ "hooks": '
  const result = uninstallClaudeHookConfiguration(original, clientCommand)

  assert.equal(result.ok, false)
  assert.equal(result.status, 'malformed')
  assert.equal(result.changed, false)
  assert.equal(result.text, original)
})

test('Claude incompatible Notification structure is rejected', () => {
  const original = JSON.stringify({ hooks: { Notification: { matcher: 'idle_prompt' } } })
  const result = uninstallClaudeHookConfiguration(original, clientCommand)

  assert.equal(result.ok, false)
  assert.equal(result.status, 'unsupported')
  assert.equal(result.changed, false)
  assert.equal(result.text, original)
})

test('Claude changed managed command is a conflict', () => {
  const changed = parse(managedClaudeConfig())
  changed.hooks.Notification[0].hooks[0].command =
    `${clientCommand} --yira-managed-agent-hook=claude --yira-normalized-event=completed --changed`
  const changedText = JSON.stringify(changed, null, 2)

  const result = uninstallClaudeHookConfiguration(changedText, clientCommand)
  assert.equal(result.ok, false)
  assert.equal(result.status, 'conflict')
  assert.equal(result.changed, false)
  assert.equal(result.text, changedText)
})

test('Claude lifecycle hook without its required async flag is a conflict', () => {
  const changed = parse(managedClaudeConfig())
  delete changed.hooks.PostToolUse[0].hooks[0].async
  const changedText = JSON.stringify(changed, null, 2)

  const result = uninstallClaudeHookConfiguration(changedText, clientCommand)
  assert.equal(result.ok, false)
  assert.equal(result.status, 'conflict')
  assert.equal(result.changed, false)
  assert.equal(result.text, changedText)
})

test('managed Claude hook detection scans lifecycle event keys', () => {
  const managed = parse(managedClaudeConfig())
  delete managed.hooks.Notification

  assert.equal(hasManagedAgentHooks(JSON.stringify(managed), 'claude'), true)
})

test('hook specs expose the source event mapping used by the managed commands', () => {
  assert.deepEqual(CODEX_HOOK_SPECS, [
    { event: 'Stop', normalizedEvent: 'completed' },
    { event: 'PermissionRequest', normalizedEvent: 'permission' },
  ])
  assert.deepEqual(CLAUDE_HOOK_SPECS, [
    { event: 'UserPromptSubmit', async: true, normalizedEvent: 'working' },
    { event: 'PostToolUse', matcher: '*', async: true, normalizedEvent: 'working' },
    { event: 'Stop', async: true, normalizedEvent: 'completed' },
    { event: 'StopFailure', async: true, normalizedEvent: 'completed' },
    { event: 'Notification', matcher: 'idle_prompt|agent_completed', normalizedEvent: 'completed' },
    {
      event: 'Notification',
      matcher: 'permission_prompt|elicitation_dialog|agent_needs_input',
      normalizedEvent: 'intervention',
    },
  ])
})
