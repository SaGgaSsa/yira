import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { AgentActiveSession, WorkspaceMetadata } from '@shared/types'
import {
  getWorkspaceAgentEntries,
  summarizeWorkspaceAgents,
  type SidebarDropPlacement,
} from '@/utils/workspaceSidebarSections'
import { WorkspaceAgentSummary, WorkspaceAgentTree } from './WorkspaceAgentTree'
import { WorkspaceListItem, type WorkspaceListItemProps } from './WorkspaceListItem'

const WORKSPACE_DRAG_TYPE = 'application/x-yira-workspace-id'

export interface ActiveWorkspaceEntryProps extends Omit<WorkspaceListItemProps, 'workspace' | 'className'> {
  workspace: WorkspaceMetadata
  sessions: readonly AgentActiveSession[]
  expanded: boolean
  onToggleExpanded: () => void
  onOpenAgent: (workspace: WorkspaceMetadata, session: AgentActiveSession) => void
  /** Tile of the agent shown on screen, only set for the active workspace. */
  focusedAgentTileId?: string | null
  onReorder?: (draggedId: string, targetId: string, placement: SidebarDropPlacement) => void
  className?: string
}

export function ActiveWorkspaceEntry({
  workspace,
  sessions,
  expanded,
  onToggleExpanded,
  onOpenAgent,
  focusedAgentTileId = null,
  onReorder,
  className = '',
  ...workspaceListItemProps
}: ActiveWorkspaceEntryProps): React.ReactElement {
  const workspaceSessions = getWorkspaceAgentEntries(workspace.id, sessions)
  const summary = summarizeWorkspaceAgents(workspaceSessions)
  const [dropPlacement, setDropPlacement] = useState<SidebarDropPlacement | null>(null)

  const handleDragStart = (event: React.DragEvent): void => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(WORKSPACE_DRAG_TYPE, workspace.id)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
    // Ignore tiles and files: only sidebar workspace rows can be reordered here.
    if (!event.dataTransfer.types.includes(WORKSPACE_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    setDropPlacement(event.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
    setDropPlacement(null)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const draggedId = event.dataTransfer.getData(WORKSPACE_DRAG_TYPE)
    const placement = dropPlacement
    setDropPlacement(null)
    if (draggedId && placement) onReorder?.(draggedId, workspace.id, placement)
  }

  const handleDragEnd = (): void => {
    setDropPlacement(null)
  }

  return (
    <div
      className={`relative ${className}`.trim()}
      onDragOver={onReorder ? handleDragOver : undefined}
      onDragLeave={onReorder ? handleDragLeave : undefined}
      onDrop={onReorder ? handleDrop : undefined}
    >
      <WorkspaceListItem
        {...workspaceListItemProps}
        workspace={workspace}
        draggable={onReorder ? true : undefined}
        onDragStart={onReorder ? handleDragStart : undefined}
        onDragEnd={onReorder ? handleDragEnd : undefined}
        leading={(
          <button
            type="button"
            aria-label={workspace.name}
            aria-expanded={expanded}
            title={workspace.name}
            onClick={onToggleExpanded}
            className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-hover-bg hover:text-text-display focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--interactive)"
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
      {dropPlacement && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 h-0.5 bg-accent ${dropPlacement === 'before' ? 'top-0' : 'bottom-0'}`}
        />
      )}
    </div>
  )
}
