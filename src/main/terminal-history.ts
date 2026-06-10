import { join } from 'path'
import type { ShellProfileId } from '../shared/types'

export interface TerminalHistorySetupInput {
  shellProfileId: ShellProfileId
  workspaceId?: string
  workspacePath?: string
  enabled?: boolean
}

export interface TerminalHistorySetup {
  historyDir: string
  env: Record<string, string>
  prependCommand?: string
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function buildTerminalHistorySetup(input: TerminalHistorySetupInput): TerminalHistorySetup | null {
  if (input.enabled === false || !input.workspaceId || !input.workspacePath) return null

  const historyDir = join(input.workspacePath, '.yira', 'terminal-history')

  if (input.shellProfileId === 'bash') {
    return {
      historyDir,
      env: {
        HISTFILE: join(historyDir, 'bash_history'),
      },
    }
  }

  if (input.shellProfileId === 'zsh') {
    return {
      historyDir,
      env: {
        HISTFILE: join(historyDir, 'zsh_history'),
      },
      prependCommand: 'SAVEHIST=${SAVEHIST:-10000}; HISTSIZE=${HISTSIZE:-10000}; setopt APPEND_HISTORY INC_APPEND_HISTORY 2>/dev/null',
    }
  }

  if (input.shellProfileId === 'powershell') {
    const historyPath = join(historyDir, 'powershell_history.txt')
    return {
      historyDir,
      env: {},
      prependCommand: [
        'if (Get-Module -ListAvailable PSReadLine) {',
        'Import-Module PSReadLine;',
        `Set-PSReadLineOption -HistorySavePath ${quotePowerShellString(historyPath)}`,
        '}',
      ].join(' '),
    }
  }

  return null
}
