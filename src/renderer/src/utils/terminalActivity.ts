import type { AgentActiveSession } from '@shared/types'

export type TerminalActivityStatus = 'needs-input' | 'working' | 'unread' | 'output' | 'done' | 'idle'

export interface TerminalActivitySummary {
  status: TerminalActivityStatus
  working: number
  needsInput: number
  done: number
  unread: number
  /** Terminals with PTY output inside the recent window. Ranked above unread. */
  recentOutput: number
}

/** Status is based on all sessions in the scope, regardless of focus or view. */
export function summarizeTerminalActivity(
  sessions: readonly AgentActiveSession[],
  workspaceId: string,
  unreadCount = 0,
  tileId?: string,
  recentOutputCount = 0,
): TerminalActivitySummary {
  const summary: TerminalActivitySummary = {
    status: 'idle', working: 0, needsInput: 0, done: 0,
    unread: Number.isFinite(unreadCount) ? Math.max(0, Math.floor(unreadCount)) : 0,
    recentOutput: Number.isFinite(recentOutputCount) ? Math.max(0, Math.floor(recentOutputCount)) : 0,
  }
  for (const session of sessions) {
    if (session.workspaceId !== workspaceId || (tileId !== undefined && session.tileId !== tileId)) continue
    if (session.status === 'working') summary.working += 1
    else if (session.status === 'needs-input') summary.needsInput += 1
    else if (session.status === 'done') summary.done += 1
  }
  summary.status = summary.needsInput > 0 ? 'needs-input'
    : summary.working > 0 ? 'working'
      : summary.recentOutput > 0 ? 'output'
        : summary.unread > 0 ? 'unread'
          : summary.done > 0 ? 'done' : 'idle'
  return summary
}
