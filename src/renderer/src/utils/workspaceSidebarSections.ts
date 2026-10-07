import type { AgentActiveSession, WorkspaceMetadata } from '@shared/types'
import { getWorkspaceSidebarOrder } from './workspaceOrdering'

const AGENT_STATUS_ORDER: Record<AgentActiveSession['status'], number> = {
  'needs-input': 0,
  done: 1,
  working: 2,
  exited: 3,
}

function compareAgentSessions(left: AgentActiveSession, right: AgentActiveSession): number {
  return AGENT_STATUS_ORDER[left.status] - AGENT_STATUS_ORDER[right.status]
    || left.startedAt.localeCompare(right.startedAt)
    || left.tileId.localeCompare(right.tileId)
}

/** Active workspaces follow the order in which their ids were added to the session set. */
export function getActiveSidebarWorkspaces(
  workspaces: readonly WorkspaceMetadata[],
  sessionActiveIds: ReadonlySet<string>,
): WorkspaceMetadata[] {
  const workspacesById = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
  const activeWorkspaces: WorkspaceMetadata[] = []

  sessionActiveIds.forEach((workspaceId) => {
    const workspace = workspacesById.get(workspaceId)
    if (workspace) activeWorkspaces.push(workspace)
  })

  return activeWorkspaces
}

/** Inactive workspaces use the shared sidebar's most-recently-used ordering. */
export function getInactiveSidebarWorkspaces(
  workspaces: readonly WorkspaceMetadata[],
  sessionActiveIds: ReadonlySet<string>,
): WorkspaceMetadata[] {
  return getWorkspaceSidebarOrder(
    workspaces.filter((workspace) => !sessionActiveIds.has(workspace.id)),
  )
}

/** Open agent sessions in a workspace, with attention and completed sessions first. */
export function getWorkspaceAgentEntries(
  workspaceId: string,
  sessions: readonly AgentActiveSession[],
): AgentActiveSession[] {
  return sessions
    .filter((session) => session.workspaceId === workspaceId && session.status !== 'exited')
    .sort(compareAgentSessions)
}

export function summarizeWorkspaceAgents(entries: readonly AgentActiveSession[]): {
  needsInputCount: number
  doneCount: number
  workingCount: number
} {
  return entries.reduce((summary, entry) => {
    if (entry.status === 'needs-input') summary.needsInputCount += 1
    if (entry.status === 'done') summary.doneCount += 1
    if (entry.status === 'working') summary.workingCount += 1
    return summary
  }, { needsInputCount: 0, doneCount: 0, workingCount: 0 })
}

/** Convert a valid selection timestamp into a compact relative-time value. */
export function getWorkspaceLastUsedParts(
  lastSelectedAt: number | undefined,
  now: number,
): { value: number; unit: 'minute' | 'hour' | 'day' | 'week' } | null {
  if (
    typeof lastSelectedAt !== 'number'
    || !Number.isSafeInteger(lastSelectedAt)
    || lastSelectedAt < 0
    || typeof now !== 'number'
    || !Number.isFinite(now)
    || now < lastSelectedAt
  ) {
    return null
  }

  const elapsed = now - lastSelectedAt
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (elapsed < hour) return { value: Math.max(1, Math.floor(elapsed / minute)), unit: 'minute' }
  if (elapsed < 24 * hour) return { value: Math.floor(elapsed / hour), unit: 'hour' }
  if (elapsed < 14 * day) return { value: Math.floor(elapsed / day), unit: 'day' }
  return { value: Math.floor(elapsed / (7 * day)), unit: 'week' }
}
