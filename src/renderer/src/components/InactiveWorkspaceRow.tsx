import React from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceMetadata } from '@shared/types'
import { getWorkspaceLastUsedParts } from '@/utils/workspaceSidebarSections'

export interface InactiveWorkspaceRowProps {
  workspace: WorkspaceMetadata
  now: number
  onSelect: (workspace: WorkspaceMetadata) => void
}

const LAST_USED_KEYS = {
  minute: 'workspaceHome.lastUsedMinute',
  hour: 'workspaceHome.lastUsedHour',
  day: 'workspaceHome.lastUsedDay',
  week: 'workspaceHome.lastUsedWeek',
} as const

export function InactiveWorkspaceRow({
  workspace,
  now,
  onSelect,
}: InactiveWorkspaceRowProps): React.ReactElement {
  const { t } = useTranslation()
  const lastUsed = getWorkspaceLastUsedParts(workspace.lastSelectedAt, now)

  return (
    <button
      type="button"
      title={workspace.name}
      onClick={() => onSelect(workspace)}
      className="flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-hover-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interactive)]"
    >
      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{workspace.name}</span>
      {lastUsed && (
        <span className="nd-caption shrink-0 text-text-muted">
          {t(LAST_USED_KEYS[lastUsed.unit], { count: lastUsed.value })}
        </span>
      )}
    </button>
  )
}
