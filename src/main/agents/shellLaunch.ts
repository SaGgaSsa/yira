import { basename, join } from 'node:path/posix'

import type { ShellProfile } from '@shared/types'

export type AgentShellProfileId = 'powershell' | 'bash' | 'zsh' | 'fish'

export interface AgentShellCommandInput {
  shellProfileId: AgentShellProfileId
  command: string
  args: string[]
  prompt?: string
  platform: NodeJS.Platform
  exitWithAgent?: boolean
  startupDir?: string
  originalZdotdir?: string
}

export interface WorkspaceScriptShellCommandInput {
  shellProfileId: AgentShellProfileId
  command: string
  platform: NodeJS.Platform
}

const POSIX_SHELLS: readonly AgentShellProfileId[] = ['bash', 'zsh', 'fish']
const PROMPT_ENVIRONMENT_VARIABLE = 'YIRA_AGENT_PROMPT'

export function resolveAgentShellProfile(
  profiles: ShellProfile[],
  platform: NodeJS.Platform,
  envShell?: string,
): ShellProfile | null {
  const available = profiles.filter((profile) => profile.available)
  if (platform === 'win32') {
    return available.find((profile) => profile.id === 'powershell') ?? null
  }

  const shellName = envShell ? basename(envShell.trim()) : undefined
  const matchingShell = POSIX_SHELLS.find((shell) => shell === shellName)
  if (matchingShell) {
    const matchedProfile = available.find((profile) => profile.id === matchingShell)
    if (matchedProfile) return matchedProfile
  }

  return POSIX_SHELLS
    .map((shell) => available.find((profile) => profile.id === shell))
    .find((profile): profile is ShellProfile => profile !== undefined) ?? null
}

function quotePosix(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function quoteFish(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

// Windows PowerShell 5.1 drops embedded double quotes from native arguments.
function normalizeWindowsPrompt(prompt: string): string {
  return prompt.replace(/"/g, "'").replace(/\r\n|\r/g, '\n')
}

// cmd.exe ends a batch command line at the first line break, so npm `.cmd`
// shims would receive only the first prompt line. Executables and `.ps1`
// shims keep line breaks, so the prompt is flattened only for batch files.
function powerShellPromptReference(quotedCommand: string): string {
  const prompt = `$env:${PROMPT_ENVIRONMENT_VARIABLE}`
  const extension = `(Get-Command -Name ${quotedCommand} -ErrorAction Ignore | Select-Object -First 1).Extension`
  return `$(if (${extension} -in '.cmd', '.bat') { ${prompt} -replace '\\n', ' ' } else { ${prompt} })`
}

function validatePowerShellArguments(args: string[]): void {
  for (const arg of args) {
    if (/["%\r\n]/.test(arg)) {
      throw new Error('Agent arguments contain characters PowerShell cannot pass safely')
    }
  }
}

export function buildAgentShellCommand(input: AgentShellCommandInput): {
  initialCommand?: string
  shellArgs?: string[]
  replaceProfileArgs?: boolean
  env: Record<string, string>
} {
  if (!input || typeof input.command !== 'string' || !input.command) {
    throw new Error('Invalid agent command')
  }
  if (!Array.isArray(input.args) || input.args.some((arg) => typeof arg !== 'string')) {
    throw new Error('Invalid agent arguments')
  }
  if (input.prompt !== undefined && typeof input.prompt !== 'string') {
    throw new Error('Invalid agent prompt')
  }

  const isWindowsPowerShell = input.shellProfileId === 'powershell' && input.platform === 'win32'
  if (isWindowsPowerShell) validatePowerShellArguments(input.args)

  const quote = input.shellProfileId === 'powershell'
    ? quotePowerShell
    : input.shellProfileId === 'fish'
      ? quoteFish
      : quotePosix
  const commandParts = input.shellProfileId === 'powershell'
    ? ['&', quote(input.command), ...input.args.map(quote)]
    : [quote(input.command), ...input.args.map(quote)]

  const env: Record<string, string> = {}
  if (input.prompt !== undefined) {
    env[PROMPT_ENVIRONMENT_VARIABLE] = isWindowsPowerShell
      ? normalizeWindowsPrompt(input.prompt)
      : input.prompt
    const promptReference = isWindowsPowerShell
      ? powerShellPromptReference(quote(input.command))
      : input.shellProfileId === 'powershell'
        ? `"$env:${PROMPT_ENVIRONMENT_VARIABLE}"`
        : `"$${PROMPT_ENVIRONMENT_VARIABLE}"`
    commandParts.push(promptReference)
  }

  const command = commandParts.join(' ')
  if (input.exitWithAgent && input.shellProfileId === 'powershell') {
    return {
      shellArgs: ['-Command', `${command}; exit $LASTEXITCODE`],
      env,
    }
  }

  if (input.exitWithAgent && input.platform !== 'win32' && POSIX_SHELLS.includes(input.shellProfileId)) {
    if (!input.startupDir) {
      throw new Error('Agent shell startup directory is required')
    }

    env.YIRA_AGENT_COMMAND = command
    if (input.shellProfileId === 'bash') {
      return {
        shellArgs: ['--rcfile', join(input.startupDir, 'bashrc'), '-i'],
        replaceProfileArgs: true,
        env,
      }
    }

    if (input.shellProfileId === 'zsh') {
      env.ZDOTDIR = join(input.startupDir, 'zsh')
      if (input.originalZdotdir !== undefined) {
        env.YIRA_ORIGINAL_ZDOTDIR = input.originalZdotdir
      }
      return {
        shellArgs: ['--login'],
        replaceProfileArgs: true,
        env,
      }
    }

    return {
      shellArgs: ['--init-command', `source ${quoteFish(join(input.startupDir, 'agent.fish'))}`],
      replaceProfileArgs: true,
      env,
    }
  }

  return {
    initialCommand: input.exitWithAgent ? `exec ${command}` : command,
    env,
  }
}

/**
 * Build a one-shot command invocation that loads the user's shell environment
 * and then exits with the command's status. POSIX shells use interactive login
 * mode so PATH setup from both login and interactive profiles is available.
 */
export function buildWorkspaceScriptShellCommand(input: WorkspaceScriptShellCommandInput): string[] {
  if (!input || typeof input.command !== 'string' || !input.command.trim()) {
    throw new Error('Invalid workspace script command')
  }
  if (/[\r\n\u0000]/.test(input.command)) {
    throw new Error('Workspace script command must be a single line')
  }

  if (input.shellProfileId === 'powershell') {
    if (input.platform !== 'win32') throw new Error('PowerShell is only available on Windows')
    const encodedScript = Buffer.from(input.command, 'utf8').toString('base64')
    const command = [
      '$global:LASTEXITCODE = $null',
      `$scriptText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedScript}'))`,
      '& ([scriptblock]::Create($scriptText))',
      '$scriptSucceeded = $?',
      '$scriptExitCode = $global:LASTEXITCODE',
      // npm and similar shims are .ps1 scripts: `$?` stays true while LASTEXITCODE carries the failure.
      'if ($null -ne $scriptExitCode -and $scriptExitCode -ne 0) { exit $scriptExitCode }',
      'if (-not $scriptSucceeded) { exit 1 }',
      'exit 0',
    ].join('; ')
    return ['-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')]
  }

  if (!POSIX_SHELLS.includes(input.shellProfileId)) {
    throw new Error('Unsupported workspace script shell')
  }

  // The shell receives command as one spawn argument; no shell-level quoting is needed.
  return ['--login', '-i', '-c', input.command]
}
