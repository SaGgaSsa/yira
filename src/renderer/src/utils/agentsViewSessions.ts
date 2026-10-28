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
