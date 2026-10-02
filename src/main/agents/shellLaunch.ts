import { basename } from 'node:path/posix'

import type { ShellProfile } from '@shared/types'

export type AgentShellProfileId = 'powershell' | 'bash' | 'zsh' | 'fish'

export interface AgentShellCommandInput {
  shellProfileId: AgentShellProfileId
  command: string
  args: string[]
  prompt?: string
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

function normalizeWindowsPrompt(prompt: string): string {
  return prompt.replace(/"/g, "'").replace(/\r\n|\n|\r/g, ' ')
}

function validatePowerShellArguments(args: string[]): void {
  for (const arg of args) {
    if (/["%\r\n]/.test(arg)) {
      throw new Error('Agent arguments contain characters PowerShell cannot pass safely')
    }
  }
}

export function buildAgentShellCommand(input: AgentShellCommandInput): {
  initialCommand: string
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
    const promptReference = input.shellProfileId === 'powershell'
      ? `"$env:${PROMPT_ENVIRONMENT_VARIABLE}"`
      : `"$${PROMPT_ENVIRONMENT_VARIABLE}"`
    commandParts.push(promptReference)
  }

  return { initialCommand: commandParts.join(' '), env }
}
