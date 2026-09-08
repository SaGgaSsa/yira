export interface WorkspaceSelectionMetadata {
  pinned?: boolean
  lastSelectedAt?: number
}

export interface WorkspaceSelectionMetadataSource {
  pinned?: unknown
  lastSelectedAt?: unknown
}

/** Keep only selection metadata that is safe to use and persist. */
export function normalizeWorkspaceSelectionMetadata(
  value: WorkspaceSelectionMetadataSource | undefined,
): WorkspaceSelectionMetadata {
  const metadata: WorkspaceSelectionMetadata = {}

  if (typeof value?.pinned === 'boolean') metadata.pinned = value.pinned

  if (typeof value?.lastSelectedAt === 'number'
    && Number.isSafeInteger(value.lastSelectedAt)
    && value.lastSelectedAt >= 0) {
    metadata.lastSelectedAt = value.lastSelectedAt
  }

  return metadata
}

/** Return the greatest persisted selection timestamp from normalized or legacy data. */
export function latestWorkspaceSelectionTimestamp(
  values: readonly WorkspaceSelectionMetadataSource[],
): number {
  let latest = 0

  for (const value of values) {
    const timestamp = normalizeWorkspaceSelectionMetadata(value).lastSelectedAt
    if (timestamp !== undefined && timestamp > latest) latest = timestamp
  }

  return latest
}

/** Produce a timestamp that is strictly greater than the previous selection. */
export function nextWorkspaceSelectionTimestamp(previous: number, now: number): number {
  const normalizedPrevious = normalizeWorkspaceSelectionMetadata({ lastSelectedAt: previous }).lastSelectedAt ?? 0
  const normalizedNow = normalizeWorkspaceSelectionMetadata({ lastSelectedAt: now }).lastSelectedAt ?? 0

  return Math.max(normalizedPrevious + 1, normalizedNow)
}
