import React from 'react'
import { ChevronDown } from 'lucide-react'
import type { AgentActiveSession, WorkspaceMetadata } from '@shared/types'
import { getWorkspaceAgentEntries, summarizeWorkspaceAgents } from '@/utils/workspaceSidebarSections'
import { WorkspaceAgentSummary, WorkspaceAgentTree } from './WorkspaceAgentTree'
import { WorkspaceListItem, type WorkspaceListItemProps } from './WorkspaceListItem'

export interface ActiveWorkspaceEntryProps extends Omit<WorkspaceListItemProps, 'workspace' | 'className'> {
  workspace: WorkspaceMetadata
  sessions: readonly AgentActiveSession[]
  expanded: boolean
  onToggleExpanded: () => void
  onOpenAgent: (workspace: WorkspaceMetadata, session: AgentActiveSession) => void
  /** Tile of the agent shown on screen, only set for the active workspace. */
  focusedAgentTileId?: string | null
  className?: string
}

export function ActiveWorkspaceEntry({
  workspace,
  sessions,
  expanded,
  onToggleExpanded,
  onOpenAgent,
  focusedAgentTileId = null,
  className = '',
  ...workspaceListItemProps
}: ActiveWorkspaceEntryProps): React.ReactElement {
  const workspaceSessions = getWorkspaceAgentEntries(workspace.id, sessions)
  const summary = summarizeWorkspaceAgents(workspaceSessions)

  return (
    <div className={className}>
      <WorkspaceListItem
        {...workspaceListItemProps}
        workspace={workspace}
        leading={(
          <button
            type="button"
            aria-label={workspace.name}
            aria-expanded={expanded}
            title={workspace.name}
            onClick={onToggleExpanded}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-hover-bg hover:text-text-display focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interactive)]"
          >
            <ChevronDown
              size={12}
              aria-hidden="true"
              className={`transition-transform ${expanded ? '' : '-rotate-90'}`}
            />
          </button>
        )}
        trailing={expanded ? undefined : <WorkspaceAgentSummary {...summary} />}
      />
      {expanded && (
        <WorkspaceAgentTree
          workspace={workspace}
          sessions={workspaceSessions}
          focusedTileId={focusedAgentTileId}
          onOpenAgent={onOpenAgent}
        />
      )}
    </div>
  )
}
