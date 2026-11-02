import type { AgentProvider } from '@shared/types'

export interface BotLaunchInput {
  provider: AgentProvider
  /** Empty means no flag. */
  model: string
  /** Empty means no flag. */
  role: string
  /** Required for claude when the role is not empty. */
  roleFilePath?: string
}

/** One line without double quotes, % or line breaks: PowerShell passes it intact and Codex reads it as a string. */
export function flattenBotRoleForCodex(role: string): string {
  return role
    .replace(/\r\n|\r|\n|\t/g, ' ')
    .replace(/"/g, "'")
    .replace(/%/g, '％')
    .replace(/ {2,}/g, ' ')
    .trim()
}

function buildClaudeBotArgs({ model, role, roleFilePath }: BotLaunchInput): string[] {
  const args: string[] = []
  if (model) args.push('--model', model)
  if (role.trim()) {
    if (!roleFilePath) throw new Error('Bot role file path is required for Claude')
    args.push('--append-system-prompt-file', roleFilePath)
  }
  return args
}

function buildCodexBotArgs({ model, role }: BotLaunchInput): string[] {
  const args: string[] = []
  if (model) args.push('-m', model)
  const instructions = flattenBotRoleForCodex(role)
  if (instructions) args.push('-c', `developer_instructions=${instructions}`)
  return args
}

export function buildBotLaunchArgs(input: BotLaunchInput): string[] {
  return input.provider === 'claude' ? buildClaudeBotArgs(input) : buildCodexBotArgs(input)
}
