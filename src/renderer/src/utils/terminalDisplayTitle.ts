import type { AgentActiveSession, AgentProvider, TileState } from '@shared/types'

export const MAX_TERMINAL_WINDOW_TITLE_LENGTH = 120

const AGENT_PROVIDER_NAMES: Record<AgentProvider, string> = { claude: 'Claude', codex: 'Codex' }

/** Name of an agent session: its prompt title, then the title the agent set on its terminal. */
export function getAgentSessionTitle(session: Pick<AgentActiveSession, 'title' | 'liveTitle'> | undefined): string {
  return session?.title?.trim() || session?.liveTitle?.trim() || ''
}

/** Agent session names by tile id for one workspace, skipping sessions without a name. */
export function getAgentSessionTitles(
  sessions: readonly AgentActiveSession[],
  workspaceId: string | null,
): Record<string, string> {
  return Object.fromEntries(sessions.flatMap((session) => {
    const title = session.workspaceId === workspaceId ? getAgentSessionTitle(session) : ''
    return title ? [[session.tileId, title]] : []
  }))
}

/**
 * Tab title of a terminal tile: its manual label, then the agent session name,
 * then the live terminal title, then the agent or a generic terminal name.
 */
export function getTerminalDisplayTitle(
  tile: TileState,
  terminalTitles: Record<string, string>,
  agentTitles: Record<string, string> = {},
): string {
  const manualLabel = tile.label?.trim()
  if (manualLabel) return manualLabel

  const agentTitle = agentTitles[tile.id]?.trim()
  if (agentTitle) return agentTitle

  const dynamicTitle = terminalTitles[tile.id]?.trim()
  if (dynamicTitle) return dynamicTitle

  if (tile.agent) return AGENT_PROVIDER_NAMES[tile.agent.provider]
  return `Terminal ${tile.id.slice(-4)}`
}

export function normalizeTerminalWindowTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').slice(0, MAX_TERMINAL_WINDOW_TITLE_LENGTH).trim()
}
