import type { AgentActiveSession, AgentProvider, TileState } from '@shared/types'
import { getAgentNamedTitle } from '@shared/agentTerminalTitle'

export const MAX_TERMINAL_WINDOW_TITLE_LENGTH = 120

const AGENT_PROVIDER_NAMES: Record<AgentProvider, string> = { claude: 'Claude', codex: 'Codex' }

/** Name of an agent session: the title the agent set on its terminal, then its prompt title. */
export function getAgentSessionTitle(session: Pick<AgentActiveSession, 'title' | 'liveTitle'> | undefined): string {
  return getAgentNamedTitle(session?.liveTitle) || session?.title?.trim() || ''
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
 * Name of a terminal tile, or '' when nothing names it. Agent tiles use the
 * title the agent set, then the manual label, then the session name. Other
 * terminals use the manual label, then the live terminal title.
 */
export function getTerminalName(
  tile: TileState,
  terminalTitles: Record<string, string>,
  agentTitles: Record<string, string> = {},
): string {
  const manualLabel = tile.label?.trim()
  const dynamicTitle = terminalTitles[tile.id]?.trim() ?? ''
  const agentTitle = agentTitles[tile.id]?.trim()
  const isAgent = Boolean(tile.agent || agentTitle)
  if (isAgent) {
    const namedTitle = getAgentNamedTitle(dynamicTitle)
    if (namedTitle) return namedTitle
  }
  if (manualLabel) return manualLabel
  if (agentTitle) return agentTitle
  if (isAgent) return ''
  // Terminal applications can emit a spinner as their entire OSC title.
  return /[\p{L}\p{N}]/u.test(dynamicTitle) ? dynamicTitle : ''
}

/** Tab title of a terminal tile: its name, then the agent or a generic terminal name. */
export function getTerminalDisplayTitle(
  tile: TileState,
  terminalTitles: Record<string, string>,
  agentTitles: Record<string, string> = {},
): string {
  const name = getTerminalName(tile, terminalTitles, agentTitles)
  if (name) return name
  if (tile.agent) return AGENT_PROVIDER_NAMES[tile.agent.provider]
  return `Terminal ${tile.id.slice(-4)}`
}

export function normalizeTerminalWindowTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').slice(0, MAX_TERMINAL_WINDOW_TITLE_LENGTH).trim()
}
