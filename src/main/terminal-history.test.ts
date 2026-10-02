import { join } from 'node:path'
import { buildTerminalHistorySetup } from './terminal-history'

const bash = buildTerminalHistorySetup({
  shellProfileId: 'bash',
  workspaceId: 'ws-alpha',
  workspacePath: '/tmp/yira/workspaces/ws-alpha',
  enabled: true,
})
if (!bash) throw new Error('bash must receive workspace history setup')
if (bash.env.HISTFILE !== join('/tmp/yira/workspaces/ws-alpha', '.yira', 'terminal-history', 'bash_history')) throw new Error('bash HISTFILE must use workspace-scoped path')
if (bash.env.BASHOPTS !== 'histappend') throw new Error('bash setup must append to the history file')
if (bash.env.PROMPT_COMMAND !== 'history -a') throw new Error('bash setup must save history after each command')
if (bash.prependCommand !== undefined) throw new Error('bash setup must not print commands in the terminal')

const zsh = buildTerminalHistorySetup({
  shellProfileId: 'zsh',
  workspaceId: 'ws-alpha',
  workspacePath: '/tmp/yira/workspaces/ws-alpha',
  enabled: true,
})
if (!zsh) throw new Error('zsh must receive workspace history setup')
if (zsh.env.HISTFILE !== join('/tmp/yira/workspaces/ws-alpha', '.yira', 'terminal-history', 'zsh_history')) throw new Error('zsh HISTFILE must use workspace-scoped path')
if (!zsh.prependCommand?.includes('SAVEHIST=')) throw new Error('zsh setup must ensure history save behavior')

const powershell = buildTerminalHistorySetup({
  shellProfileId: 'powershell',
  workspaceId: 'ws-alpha',
  workspacePath: 'C:\\Users\\me\\.yira\\workspaces\\ws-alpha',
  enabled: true,
})
if (!powershell) throw new Error('PowerShell must receive workspace history setup')
if (powershell.shellArgs?.[0] !== '-NoExit' || powershell.shellArgs[1] !== '-Command') throw new Error('PowerShell setup must keep the configured session interactive')
if (!powershell.shellArgs[2]?.includes('Set-PSReadLineOption -HistorySavePath')) throw new Error('PowerShell setup must configure PSReadLine history path')
if (!powershell.shellArgs[2]?.includes('powershell_history.txt')) throw new Error('PowerShell history path must use its workspace history file')
if (powershell.prependCommand !== undefined) throw new Error('PowerShell setup must not print commands in the terminal')

const fish = buildTerminalHistorySetup({
  shellProfileId: 'fish',
  workspaceId: 'ws-alpha',
  workspacePath: '/tmp/yira/workspaces/ws-alpha',
  enabled: true,
})
if (fish) throw new Error('fish must remain unchanged in v1')

const wsl = buildTerminalHistorySetup({
  shellProfileId: 'wsl',
  workspaceId: 'ws-alpha',
  workspacePath: '/tmp/yira/workspaces/ws-alpha',
  enabled: true,
})
if (wsl) throw new Error('wsl must remain unchanged in v1')

const disabled = buildTerminalHistorySetup({
  shellProfileId: 'bash',
  workspaceId: 'ws-alpha',
  workspacePath: '/tmp/yira/workspaces/ws-alpha',
  enabled: false,
})
if (disabled) throw new Error('disabled workspace history must not alter terminal setup')
