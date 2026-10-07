import assert from 'node:assert/strict'
import test from 'node:test'

import type { ShellProfile } from '@shared/types'
import {
  buildAgentShellCommand,
  buildWorkspaceScriptShellCommand,
  resolveAgentShellProfile,
} from './shellLaunch'

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
  assert.equal(result.initialCommand?.includes(prompt), false)
  assert.equal(buildAgentShellCommand({
    shellProfileId: 'zsh',
    command: 'codex',
    args: [],
    platform: 'linux',
  }).initialCommand, "'codex'")
})

test('POSIX agent commands replace the shell only when requested', () => {
  for (const shellProfileId of ['bash', 'zsh', 'fish'] as const) {
    const input = {
      shellProfileId,
      command: 'claude',
      args: ['--resume', 'session-1'],
      platform: 'linux' as const,
    }

    assert.equal(
      buildAgentShellCommand(input).initialCommand,
      "'claude' '--resume' 'session-1'",
    )
    assert.equal(
      buildAgentShellCommand({ ...input, exitWithAgent: true }).initialCommand,
      "exec 'claude' '--resume' 'session-1'",
    )

    const promptedInput = { ...input, prompt: 'Continue this task' }
    assert.equal(
      buildAgentShellCommand(promptedInput).initialCommand,
      "'claude' '--resume' 'session-1' \"$YIRA_AGENT_PROMPT\"",
    )
    const promptedExit = buildAgentShellCommand({ ...promptedInput, exitWithAgent: true })
    assert.equal(
      promptedExit.initialCommand,
      "exec 'claude' '--resume' 'session-1' \"$YIRA_AGENT_PROMPT\"",
    )
    assert.deepEqual(promptedExit.env, { YIRA_AGENT_PROMPT: 'Continue this task' })
  }
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

const codexPromptReference = "$(if ((Get-Command -Name 'codex' -ErrorAction Ignore | Select-Object -First 1).Extension -in '.cmd', '.bat') { $env:YIRA_AGENT_PROMPT -replace '\\n', ' ' } else { $env:YIRA_AGENT_PROMPT })"

test('invokes PowerShell commands with the call operator and normalizes Windows prompts', () => {
  const result = buildAgentShellCommand({
    shellProfileId: 'powershell',
    command: 'codex',
    args: ['resume', 'session-1'],
    prompt: 'Use "quotes"\r\nthen newline\nthen carriage\rreturn',
    platform: 'win32',
  })

  assert.equal(result.initialCommand, `& 'codex' 'resume' 'session-1' ${codexPromptReference}`)
  assert.deepEqual(result.env, { YIRA_AGENT_PROMPT: "Use 'quotes'\nthen newline\nthen carriage\nreturn" })
})

test('PowerShell exits with the agent status only when requested, including prompts', () => {
  const input = {
    shellProfileId: 'powershell' as const,
    command: 'codex',
    args: ['resume', 'session-1'],
    prompt: 'Continue this task',
    platform: 'win32' as const,
  }
  const expectedCommand = `& 'codex' 'resume' 'session-1' ${codexPromptReference}`

  const withoutExit = buildAgentShellCommand(input)
  assert.equal(withoutExit.initialCommand, expectedCommand)
  assert.equal(withoutExit.shellArgs, undefined)
  assert.deepEqual(withoutExit.env, { YIRA_AGENT_PROMPT: 'Continue this task' })

  const withExit = buildAgentShellCommand({ ...input, exitWithAgent: true })
  assert.equal(withExit.initialCommand, undefined)
  assert.deepEqual(withExit.shellArgs, [
    '-Command',
    `${expectedCommand}; exit $LASTEXITCODE`,
  ])
  assert.deepEqual(withExit.env, { YIRA_AGENT_PROMPT: 'Continue this task' })
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

test('runs workspace scripts in a profile-loading PowerShell command and propagates native exit codes', () => {
  const args = buildWorkspaceScriptShellCommand({
    shellProfileId: 'powershell',
    command: 'npm run dev',
    platform: 'win32',
  })
  const script = Buffer.from(args[1], 'base64').toString('utf16le')

  assert.equal(args[0], '-EncodedCommand')
  assert.match(script, /\$global:LASTEXITCODE = \$null/)
  assert.match(script, /FromBase64String\('[A-Za-z0-9+/=]+'\)/)
  assert.match(script, /& \(\[scriptblock\]::Create\(\$scriptText\)\)/)
  assert.match(script, /exit \$scriptExitCode/)
  assert.match(script, /if \(\$scriptSucceeded\) \{ exit 0 \}/)
})

test('runs POSIX workspace scripts through interactive login shells and rejects multiline commands', () => {
  assert.deepEqual(buildWorkspaceScriptShellCommand({
    shellProfileId: 'bash',
    command: 'npm run dev',
    platform: 'linux',
  }), ['--login', '-i', '-c', 'npm run dev'])
  assert.deepEqual(buildWorkspaceScriptShellCommand({
    shellProfileId: 'zsh',
    command: 'pnpm run dev',
    platform: 'darwin',
  }), ['--login', '-i', '-c', 'pnpm run dev'])
  assert.throws(() => buildWorkspaceScriptShellCommand({
    shellProfileId: 'bash',
    command: 'npm run dev\nrm -rf .',
    platform: 'linux',
  }), /single line/)
})
