import type { AgentProvider } from '@shared/types'

export interface BotMcpLaunch {
  scriptPath: string
  bridgeFile: string
  token: string
  /** Required for claude: the JSON file passed to --mcp-config. */
  claudeConfigPath?: string
  /** Tool names (without the mcp__yira__ prefix) that run without asking. */
  autoApprovedTools?: string[]
}

export interface BotLaunchInput {
  provider: AgentProvider
  /** Empty means no flag. */
  model: string
  /** Empty means no flag. */
  role: string
  /** Required for claude when the role is not empty. */
  roleFilePath?: string
  /** Yira MCP server to attach to the session. */
  mcp?: BotMcpLaunch
}

const MCP_SERVER_NAME = 'yira'

function botMcpServerArgs({ scriptPath, bridgeFile, token }: Pick<BotMcpLaunch, 'scriptPath' | 'bridgeFile' | 'token'>): string[] {
  return [scriptPath, '--bridge-file', bridgeFile, '--token', token]
}

/** Claude MCP config file with the Yira server. */
export function buildBotMcpConfigJson(input: { scriptPath: string; bridgeFile: string; token: string }): string {
  return JSON.stringify({
    mcpServers: {
      [MCP_SERVER_NAME]: { type: 'stdio', command: 'node', args: botMcpServerArgs(input) },
    },
  }, null, 2)
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

function buildClaudeBotArgs({ model, role, roleFilePath, mcp }: BotLaunchInput): string[] {
  const args: string[] = []
  if (model) args.push('--model', model)
  if (role.trim()) {
    if (!roleFilePath) throw new Error('Bot role file path is required for Claude')
    args.push('--append-system-prompt-file', roleFilePath)
  }
  if (mcp) {
    if (!mcp.claudeConfigPath) throw new Error('Bot MCP config path is required for Claude')
    // Variadic flags swallow a following positional prompt, so they use the = form.
    args.push(`--mcp-config=${mcp.claudeConfigPath}`)
    if (mcp.autoApprovedTools?.length) {
      const names = mcp.autoApprovedTools.map((name) => `mcp__${MCP_SERVER_NAME}__${name}`)
      args.push(`--allowedTools=${names.join(',')}`)
    }
  }
  return args
}

function buildCodexBotArgs({ model, role, mcp }: BotLaunchInput): string[] {
  const args: string[] = []
  if (model) args.push('-m', model)
  const instructions = flattenBotRoleForCodex(role)
  if (instructions) args.push('-c', `developer_instructions=${instructions}`)
  if (mcp) {
    const serverArgs = botMcpServerArgs(mcp)
    // Values go into TOML literal strings, which cannot hold a single quote.
    if (serverArgs.some((value) => value.includes("'"))) {
      throw new Error('Bot MCP paths and token cannot contain a single quote')
    }
    const tomlArray = serverArgs.map((value) => `'${value}'`).join(',')
    args.push(
      '-c', `mcp_servers.${MCP_SERVER_NAME}.command=node`,
      '-c', `mcp_servers.${MCP_SERVER_NAME}.args=[${tomlArray}]`,
    )
  }
  return args
}

export function buildBotLaunchArgs(input: BotLaunchInput): string[] {
  return input.provider === 'claude' ? buildClaudeBotArgs(input) : buildCodexBotArgs(input)
}
