import type { AgentActiveSession, WorkspaceMetadata } from '@shared/types'

function compareAgentSessions(left: AgentActiveSession, right: AgentActiveSession): number {
  const leftWaiting = left.status === 'needs-input' ? 0 : 1
  const rightWaiting = right.status === 'needs-input' ? 0 : 1
  return leftWaiting - rightWaiting
    || right.lastActivityAt.localeCompare(left.lastActivityAt)
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

/** Keep workspaces whose name or root folder contains every word of the query, ignoring case. */
export function filterWorkspacesByQuery(
  workspaces: readonly WorkspaceMetadata[],
  query: string,
): WorkspaceMetadata[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...workspaces]

  return workspaces.filter((workspace) => {
    const haystack = `${workspace.name} ${workspace.config.rootFolderPath ?? ''}`.toLocaleLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

/** Open agent sessions in a workspace: waiting for a reply first, then most recent activity. */
export function getWorkspaceAgentEntries(
  workspaceId: string,
  sessions: readonly AgentActiveSession[],
): AgentActiveSession[] {
  return sessions
    .filter((session) => session.workspaceId === workspaceId && session.status !== 'exited')
    .sort(compareAgentSessions)
}

/** Keep sessions in the order of previousIds; sessions not listed there go last in their given order. */
export function keepAgentSessionOrder(
  sessions: readonly AgentActiveSession[],
  previousIds: readonly string[],
): AgentActiveSession[] {
  const previousIndex = new Map(previousIds.map((sessionId, index) => [sessionId, index]))
  return sessions
    .map((session, index) => ({ session, rank: previousIndex.get(session.sessionId) ?? previousIds.length + index }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ session }) => session)
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
