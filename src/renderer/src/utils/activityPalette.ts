import type { AgentActiveSession, AgentSessionSurface, WorkspaceMetadata } from '@shared/types'

/** Every agent with an open terminal: working, waiting for input, or done. */
export function isActivityPaletteSession(session: AgentActiveSession): boolean {
  return session.status !== 'exited'
}

/**
 * Open agents that were already running before this window loaded, such as
 * agents the terminal daemon kept alive across an app update. Their
 * workspaces start active so the sidebar matches the command palette.
 */
export function selectRestoredAgentSessions(
  sessions: readonly AgentActiveSession[],
  loadedAt: number,
  workspaceIds: ReadonlySet<string>,
  handledSessionIds: ReadonlySet<string>,
): AgentActiveSession[] {
  return sessions.filter((session) => (
    isActivityPaletteSession(session)
    && workspaceIds.has(session.workspaceId)
    && !handledSessionIds.has(session.sessionId)
    && Date.parse(session.startedAt) < loadedAt
  ))
}

export function getAgentSessionSurface(session: AgentActiveSession): AgentSessionSurface {
  return session.surface ?? 'tile'
}

/** Short elapsed time such as `30 s`, `4 min` or `2 h`. */
export function formatActivityElapsed(startedAt: string, now: number): string {
  const started = Date.parse(startedAt)
  const seconds = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : 0
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h`
}
