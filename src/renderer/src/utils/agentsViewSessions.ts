import type { AgentActiveSession, AgentActiveSessionSnapshot } from '@shared/types'

export function selectAgentsViewSessions(
  snapshot: AgentActiveSessionSnapshot,
  workspaceId: string,
): AgentActiveSession[] {
  return snapshot.sessions
    .filter((session) => session.workspaceId === workspaceId && session.surface === 'agents-view')
    .slice()
    .sort((left, right) => (
      left.startedAt.localeCompare(right.startedAt) || left.tileId.localeCompare(right.tileId)
    ))
}

export function agentSessionNeedsAttention(session: AgentActiveSession): boolean {
  return session.status === 'needs-input' || session.status === 'done'
}

export function countAgentsViewAttention(sessions: readonly AgentActiveSession[]): number {
  return sessions.reduce((count, session) => count + Number(agentSessionNeedsAttention(session)), 0)
}

const ATTENTION_ORDER: Partial<Record<AgentActiveSession['status'], number>> = { 'needs-input': 0, done: 1 }

/**
 * Picks the session the agents button jumps to: sessions waiting for input first, then finished
 * ones, cycling past the session already in front. Without waiting sessions it cycles through all.
 */
export function pickNextAgentSession(
  sessions: readonly AgentActiveSession[],
  currentTileId: string | null,
): AgentActiveSession | null {
  const waiting = sessions
    .filter(agentSessionNeedsAttention)
    .sort((left, right) => (ATTENTION_ORDER[left.status] ?? 2) - (ATTENTION_ORDER[right.status] ?? 2))
  const candidates = waiting.length > 0 ? waiting : sessions
  if (candidates.length === 0) return null
  const currentIndex = candidates.findIndex((session) => session.tileId === currentTileId)
  return candidates[(currentIndex + 1) % candidates.length]
}
