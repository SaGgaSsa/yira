export type TerminalProcessAgent = 'claude' | 'codex' | 'opencode'
export type TerminalProcessActivityState = 'working' | 'background'

export interface TerminalProcessActivity {
  workspaceId: string
  tileId: string
  state: TerminalProcessActivityState
  agent?: TerminalProcessAgent
}

export interface TerminalProcessActivitySnapshot {
  terminals: TerminalProcessActivity[]
}
