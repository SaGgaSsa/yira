export type TerminalProcessAgent = 'claude' | 'codex' | 'opencode'

/** A terminal with an agent working in it. */
export interface TerminalProcessActivity {
  workspaceId: string
  tileId: string
  agent?: TerminalProcessAgent
}

export interface TerminalProcessActivitySnapshot {
  terminals: TerminalProcessActivity[]
}
