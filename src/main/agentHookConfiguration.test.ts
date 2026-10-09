import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  CLAUDE_HOOK_SPECS,
  CODEX_HOOK_SPECS,
  installClaudeHookConfiguration,
  hasManagedAgentHooks,
  installCodexHookConfiguration,
  uninstallClaudeHookConfiguration,
  uninstallCodexHookConfiguration,
} from './agentHookConfiguration'

const clientCommand = '/opt/yira/resources/agent-hook-client.mjs'

test('managed hook detection is read-only and identifies Yira markers', () => {
  assert.equal(hasManagedAgentHooks(installClaudeHookConfiguration('{}', clientCommand).text, 'claude'), true)
  assert.equal(hasManagedAgentHooks('{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"other"}]}]}}', 'codex'), false)
})

function parse(text: string): Record<string, any> {
  return JSON.parse(text) as Record<string, any>
}

test('Codex installation creates the two managed event groups', () => {
  const result = installCodexHookConfiguration('{}', clientCommand)

  assert.equal(result.ok, true)
  assert.equal(result.status, 'installed')
  assert.equal(result.changed, true)

  const config = parse(result.text)
  assert.deepEqual(Object.keys(config), ['hooks'])
  assert.deepEqual(Object.keys(config.hooks), ['Stop', 'PermissionRequest'])
  assert.equal(config.hooks.Stop.length, 1)
  assert.equal(config.hooks.PermissionRequest.length, 1)
  assert.match(config.hooks.Stop[0].hooks[0].command, /--yira-managed-agent-hook=codex/)
  assert.match(config.hooks.Stop[0].hooks[0].command, /--yira-normalized-event=completed/)
  assert.equal(config.hooks.PermissionRequest[0].hooks[0].type, 'command')
  assert.match(config.hooks.PermissionRequest[0].hooks[0].command, /--yira-normalized-event=permission/)
})

test('Codex installation coexists with notify and unrelated hook entries', () => {
  const original = JSON.stringify({
    notify: ['desktop'],
    hooks: {
      notify: [{ type: 'command', command: 'other-client' }],
      Stop: [{ hooks: [{ type: 'command', command: 'existing-stop' }] }],
    },
  }, null, 2)

  const result = installCodexHookConfiguration(original, clientCommand)
  assert.equal(result.status, 'installed')

  const config = parse(result.text)
  assert.deepEqual(config.notify, ['desktop'])
  assert.deepEqual(config.hooks.notify, [{ type: 'command', command: 'other-client' }])
  assert.deepEqual(config.hooks.Stop[0], { hooks: [{ type: 'command', command: 'existing-stop' }] })
  assert.equal(config.hooks.Stop.length, 2)
  assert.equal(config.hooks.PermissionRequest.length, 1)
})

test('Codex installation is idempotent and uninstall restores unrelated content', () => {
  const original = JSON.stringify({ notify: ['desktop'] }, null, 2) + '\n'
  const installed = installCodexHookConfiguration(original, clientCommand)
  const repeated = installCodexHookConfiguration(installed.text, clientCommand)

  assert.equal(repeated.status, 'already-installed')
  assert.equal(repeated.changed, false)
  assert.equal(repeated.text, installed.text)

  const uninstalled = uninstallCodexHookConfiguration(repeated.text, clientCommand)
  assert.equal(uninstalled.status, 'uninstalled')
  assert.equal(uninstalled.changed, true)
  assert.deepEqual(parse(uninstalled.text), parse(original))
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
  const result = installCodexHookConfiguration(original, clientCommand)

  assert.equal(result.ok, false)
  assert.equal(result.status, 'malformed')
  assert.equal(result.changed, false)
  assert.equal(result.text, original)
  assert.match(result.message, /malformed JSON/i)
})

test('Codex inline event hooks are rejected without changing the config', () => {
  const original = JSON.stringify({ hooks: { Stop: [{ type: 'command', command: 'inline' }] } })
  const result = installCodexHookConfiguration(original, clientCommand)

  assert.equal(result.ok, false)
  assert.equal(result.status, 'unsupported')
  assert.equal(result.changed, false)
  assert.equal(result.text, original)
  assert.match(result.message, /Stop/i)
})

test('Codex changed managed command is a conflict for install and uninstall', () => {
  const installed = installCodexHookConfiguration('{}', clientCommand)
  const changed = parse(installed.text)
  changed.hooks.Stop[0].hooks[0].command = `${clientCommand} --yira-managed-agent-hook=codex --yira-normalized-event=completed --changed`
  const changedText = JSON.stringify(changed, null, 2)

  const install = installCodexHookConfiguration(changedText, clientCommand)
  assert.equal(install.ok, false)
  assert.equal(install.status, 'conflict')
  assert.equal(install.changed, false)
  assert.equal(install.text, changedText)

  const uninstall = uninstallCodexHookConfiguration(changedText, clientCommand)
  assert.equal(uninstall.ok, false)
  assert.equal(uninstall.status, 'conflict')
  assert.equal(uninstall.changed, false)
  assert.equal(uninstall.text, changedText)
})

test('Claude installation writes all six lifecycle and Notification groups', () => {
  const result = installClaudeHookConfiguration('{}', clientCommand)

  assert.equal(result.ok, true)
  assert.equal(result.status, 'installed')

  const config = parse(result.text)
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

test('Claude installation preserves settings and unrelated Notification hooks', () => {
  const original = JSON.stringify({
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
  }, null, 2)

  const result = installClaudeHookConfiguration(original, clientCommand)
  assert.equal(result.status, 'installed')

  const config = parse(result.text)
  assert.equal(config.model, 'sonnet')
  assert.deepEqual(config.hooks.Stop[0], { matcher: '', hooks: [{ type: 'command', command: 'stop-client' }] })
  assert.equal(config.hooks.Stop.length, 2)
  assert.deepEqual(config.hooks.Notification[0], {
    matcher: 'auth_success',
    hooks: [{ type: 'command', command: 'other-client' }],
  })
  assert.equal(config.hooks.Notification.length, 3)
})

test('Claude installation is idempotent and uninstall restores settings', () => {
  const original = JSON.stringify({ model: 'sonnet', enabled: true }, null, 2) + '\n'
  const installed = installClaudeHookConfiguration(original, clientCommand)
  const repeated = installClaudeHookConfiguration(installed.text, clientCommand)

  assert.equal(repeated.status, 'already-installed')
  assert.equal(repeated.changed, false)
  assert.equal(repeated.text, installed.text)

  const uninstalled = uninstallClaudeHookConfiguration(repeated.text, clientCommand)
  assert.equal(uninstalled.status, 'uninstalled')
  assert.deepEqual(parse(uninstalled.text), parse(original))
})

test('Claude reinstalls lifecycle hooks over a legacy Notification-only configuration', () => {
  const priorInstall = parse(installClaudeHookConfiguration('{}', clientCommand).text)
  for (const event of ['UserPromptSubmit', 'PostToolUse', 'Stop', 'StopFailure']) {
    delete priorInstall.hooks[event]
  }

  const legacyText = JSON.stringify(priorInstall, null, 2)
  const result = installClaudeHookConfiguration(legacyText, clientCommand)

  assert.equal(result.status, 'installed')
  const migrated = parse(result.text)
  assert.equal(migrated.hooks.Notification.length, 2)
  for (const event of ['UserPromptSubmit', 'PostToolUse', 'Stop', 'StopFailure']) {
    assert.equal(migrated.hooks[event].length, 1)
  }
})

test('Claude uninstall leaves unrelated Notification entries untouched', () => {
  const original = JSON.stringify({
    hooks: {
      Notification: [{ matcher: 'auth_success', hooks: [{ type: 'command', command: 'other-client' }] }],
    },
  }, null, 2)
  const installed = installClaudeHookConfiguration(original, clientCommand)
  const uninstalled = uninstallClaudeHookConfiguration(installed.text, clientCommand)

  assert.equal(uninstalled.status, 'uninstalled')
  assert.deepEqual(parse(uninstalled.text), parse(original))
})

test('Claude uninstall removes all six managed groups and preserves user hooks', () => {
  const original = JSON.stringify({
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'user-prompt-client' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'user-stop-client' }] }],
      Notification: [{ matcher: 'auth_success', hooks: [{ type: 'command', command: 'other-client' }] }],
    },
  }, null, 2)
  const installed = installClaudeHookConfiguration(original, clientCommand)
  const result = uninstallClaudeHookConfiguration(installed.text, clientCommand)

  assert.equal(result.status, 'uninstalled')
  assert.deepEqual(parse(result.text), parse(original))
  assert.equal(hasManagedAgentHooks(result.text, 'claude'), false)
})

test('Claude malformed JSON is reported without overwriting text', () => {
  const original = '{ "hooks": '
  const result = installClaudeHookConfiguration(original, clientCommand)

  assert.equal(result.ok, false)
  assert.equal(result.status, 'malformed')
  assert.equal(result.changed, false)
  assert.equal(result.text, original)
})

test('Claude incompatible Notification structure is rejected', () => {
  const original = JSON.stringify({ hooks: { Notification: { matcher: 'idle_prompt' } } })
  const result = installClaudeHookConfiguration(original, clientCommand)

  assert.equal(result.ok, false)
  assert.equal(result.status, 'unsupported')
  assert.equal(result.changed, false)
  assert.equal(result.text, original)
})

test('Claude changed managed command is a conflict for install and uninstall', () => {
  const installed = installClaudeHookConfiguration('{}', clientCommand)
  const changed = parse(installed.text)
  changed.hooks.Notification[0].hooks[0].command =
    `${clientCommand} --yira-managed-agent-hook=claude --yira-normalized-event=completed --changed`
  const changedText = JSON.stringify(changed, null, 2)

  const install = installClaudeHookConfiguration(changedText, clientCommand)
  assert.equal(install.ok, false)
  assert.equal(install.status, 'conflict')
  assert.equal(install.changed, false)

  const uninstall = uninstallClaudeHookConfiguration(changedText, clientCommand)
  assert.equal(uninstall.ok, false)
  assert.equal(uninstall.status, 'conflict')
  assert.equal(uninstall.changed, false)
})

test('Claude lifecycle hook without its required async flag is a conflict', () => {
  const installed = installClaudeHookConfiguration('{}', clientCommand)
  const changed = parse(installed.text)
  delete changed.hooks.PostToolUse[0].hooks[0].async
  const changedText = JSON.stringify(changed, null, 2)

  const install = installClaudeHookConfiguration(changedText, clientCommand)
  assert.equal(install.ok, false)
  assert.equal(install.status, 'conflict')
  assert.equal(install.changed, false)
  assert.equal(install.text, changedText)

  const uninstall = uninstallClaudeHookConfiguration(changedText, clientCommand)
  assert.equal(uninstall.ok, false)
  assert.equal(uninstall.status, 'conflict')
  assert.equal(uninstall.changed, false)
  assert.equal(uninstall.text, changedText)
})

test('managed Claude hook detection scans lifecycle event keys', () => {
  const installed = parse(installClaudeHookConfiguration('{}', clientCommand).text)
  delete installed.hooks.Notification

  assert.equal(hasManagedAgentHooks(JSON.stringify(installed), 'claude'), true)
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
