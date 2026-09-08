import { formatTerminalAttentionCount, type TerminalAttentionEntry } from './terminalAttention'

export type WorkspaceAttentionCounts = Record<string, number>

export function incrementWorkspaceAttentionCount(
  counts: WorkspaceAttentionCounts,
  workspaceId: string | null | undefined,
): WorkspaceAttentionCounts {
  if (!workspaceId) return counts

  return {
    ...counts,
    [workspaceId]: (counts[workspaceId] ?? 0) + 1,
  }
}

export function sumTerminalAttentionCounts(terminalAttention: Record<string, TerminalAttentionEntry>): number {
  return Object.values(terminalAttention).reduce((total, entry) => (
    entry.count > 0 ? total + entry.count : total
  ), 0)
}

export function updateActiveWorkspaceAttentionCount(
  counts: WorkspaceAttentionCounts,
  workspaceId: string | null | undefined,
  count: number,
): WorkspaceAttentionCounts {
  if (!workspaceId) return counts

  const next = { ...counts }
  if (count > 0) {
    next[workspaceId] = count
  } else {
    delete next[workspaceId]
  }
  return next
}

export function clearActivatedWorkspaceAttentionCount(
  counts: WorkspaceAttentionCounts,
  workspaceId: string | null | undefined,
): WorkspaceAttentionCounts {
  if (!workspaceId || counts[workspaceId] === undefined) return counts

  const next = { ...counts }
  delete next[workspaceId]
  return next
}

export function pruneWorkspaceAttentionCounts(
  counts: WorkspaceAttentionCounts,
  existingWorkspaceIds: Iterable<string>,
): WorkspaceAttentionCounts {
  const existingIds = new Set(existingWorkspaceIds)
  const next: WorkspaceAttentionCounts = {}

  for (const [workspaceId, count] of Object.entries(counts)) {
    if (existingIds.has(workspaceId)) next[workspaceId] = count
  }

  return next
}

export function getWorkspaceAttentionLabel(
  counts: WorkspaceAttentionCounts,
  workspaceId: string,
): string | null {
  return formatTerminalAttentionCount(counts[workspaceId] ?? 0)
}
