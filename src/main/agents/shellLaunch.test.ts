import assert from 'node:assert/strict'
import test from 'node:test'

import type { ShellProfile } from '@shared/types'
import { buildAgentShellCommand, resolveAgentShellProfile } from './shellLaunch'

const shellProfiles: ShellProfile[] = [
  { id: 'powershell', label: 'PowerShell', shell: 'powershell.exe', args: [], available: true },
  { id: 'cmd', label: 'CMD', shell: 'cmd.exe', args: [], available: true },
  { id: 'wsl', label: 'WSL', shell: 'wsl.exe', args: [], available: true },
  { id: 'bash', label: 'Bash', shell: '/bin/bash', args: ['--login'], available: true },
  { id: 'zsh', label: 'Zsh', shell: '/bin/zsh', args: ['--login'], available: true },
  { id: 'fish', label: 'Fish', shell: '/bin/fish', args: [], available: true },
]

test('resolves only available supported shells and follows SHELL before fallback order', () => {
  assert.equal(resolveAgentShellProfile(shellProfiles, 'win32')?.id, 'powershell')
  assert.equal(resolveAgentShellProfile(shellProfiles, 'linux', '/usr/local/bin/fish')?.id, 'fish')
  assert.equal(resolveAgentShellProfile(shellProfiles, 'darwin', '/bin/zsh')?.id, 'zsh')
  assert.equal(resolveAgentShellProfile(shellProfiles, 'linux', '/bin/unknown')?.id, 'bash')
  assert.equal(resolveAgentShellProfile(shellProfiles.filter((profile) => profile.id !== 'powershell'), 'win32'), null)
  assert.equal(resolveAgentShellProfile(shellProfiles.filter((profile) => profile.id !== 'bash'), 'linux')?.id, 'zsh')
  assert.equal(resolveAgentShellProfile(shellProfiles.map((profile) => ({ ...profile, available: false })), 'linux'), null)
})

test('quotes fixed POSIX arguments and carries prompts only through the environment', () => {
  const prompt = 'literal $(echo unsafe) and "quotes"'
  const result = buildAgentShellCommand({
    shellProfileId: 'bash',
    command: 'claude',
    args: ['--label', 'two words', "it's fixed"],
    prompt,
    platform: 'linux',
  })

  assert.equal(result.initialCommand, "'claude' '--label' 'two words' 'it'\\''s fixed' \"$YIRA_AGENT_PROMPT\"")
  assert.deepEqual(result.env, { YIRA_AGENT_PROMPT: prompt })
  assert.equal(result.initialCommand.includes(prompt), false)
  assert.equal(buildAgentShellCommand({
    shellProfileId: 'zsh',
    command: 'codex',
    args: [],
    platform: 'linux',
  }).initialCommand, "'codex'")
})

test('uses fish quoting for backslashes and single quotes', () => {
  const result = buildAgentShellCommand({
    shellProfileId: 'fish',
    command: 'codex',
    args: ['path\\part', "agent's option"],
    platform: 'linux',
  })

  assert.equal(result.initialCommand, "'codex' 'path\\\\part' 'agent\\'s option'")
})

test('invokes PowerShell commands with the call operator and normalizes Windows prompts', () => {
  const result = buildAgentShellCommand({
    shellProfileId: 'powershell',
    command: 'codex',
    args: ['resume', 'session-1'],
    prompt: 'Use "quotes"\r\nthen newline\nthen carriage\rreturn',
    platform: 'win32',
  })

  assert.equal(result.initialCommand, "& 'codex' 'resume' 'session-1' \"$env:YIRA_AGENT_PROMPT\"")
  assert.deepEqual(result.env, { YIRA_AGENT_PROMPT: "Use 'quotes' then newline then carriage return" })
})

test('rejects PowerShell arguments with quote, percent, or line break characters', () => {
  for (const arg of ['has"quote', 'has%percent', 'has\nline', 'has\rline']) {
    assert.throws(() => buildAgentShellCommand({
      shellProfileId: 'powershell',
      command: 'codex',
      args: [arg],
      platform: 'win32',
    }), /PowerShell cannot pass safely/)
  }
})
