import React, { useCallback, useId, useLayoutEffect, useState } from 'react'
import { ChevronDown, Home } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AgentActiveSession, WorkspaceMetadata } from '@shared/types'
import { getWorkspaceAgentEntries, summarizeWorkspaceAgents } from '@/utils/workspaceSidebarSections'
import { WorkspaceAgentSummary } from './WorkspaceAgentTree'
import { SelectOption, SelectOptionList, SelectPopover, SelectSeparator, useAnchoredPopover } from './SelectPopover'

export interface WorkspaceSwitcherProps {
  /** Active workspaces in sidebar order. */
  workspaces: readonly WorkspaceMetadata[]
  activeWorkspaceId: string | null
  sessions: readonly AgentActiveSession[]
  onSelect: (workspace: WorkspaceMetadata) => void
  onOpenHome: () => void
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  sessions,
  onSelect,
  onOpenHome,
}: WorkspaceSwitcherProps): React.ReactElement | null {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const listboxId = `workspace-switcher-${useId()}`

  const currentWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
  const currentIndex = workspaces.findIndex((workspace) => workspace.id === activeWorkspaceId)
  const optionCount = workspaces.length + 1
  const summaries = workspaces.map((workspace) => (
    summarizeWorkspaceAgents(getWorkspaceAgentEntries(workspace.id, sessions))
  ))
  const waitingElsewhere = workspaces.reduce((total, workspace, index) => (
    workspace.id === activeWorkspaceId ? total : total + summaries[index].needsInputCount
  ), 0)

  const closeMenu = useCallback((): void => {
    setIsOpen(false)
  }, [])

  const { triggerRef, popoverRef, position, measure } = useAnchoredPopover({
    isOpen,
    onDismiss: closeMenu,
    width: 260,
    maxHeight: 360,
  })

  const openMenu = useCallback((): void => {
    setActiveIndex(Math.max(0, currentIndex))
    measure()
    setIsOpen(true)
  }, [currentIndex, measure])

  const chooseWorkspace = useCallback((workspace: WorkspaceMetadata): void => {
    closeMenu()
    // Also for the current workspace: it closes Home or Activity on top of it.
    onSelect(workspace)
  }, [closeMenu, onSelect])

  const chooseHome = useCallback((): void => {
    closeMenu()
    onOpenHome()
  }, [closeMenu, onOpenHome])

  useLayoutEffect(() => {
    if (!isOpen) return
    popoverRef.current?.focus()
  }, [isOpen, popoverRef])

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu()
      triggerRef.current?.focus()
      return
    }

    if (event.key === 'Tab') {
      closeMenu()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + direction + optionCount) % optionCount)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (activeIndex === workspaces.length) {
        chooseHome()
        return
      }
      const workspace = workspaces[activeIndex]
      if (workspace) chooseWorkspace(workspace)
    }
  }

  if (!currentWorkspace) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-7 max-w-40 items-center gap-1.5 rounded-md px-2 text-xs text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
        aria-label={t('workspaceSwitcher.label')}
        title={waitingElsewhere > 0
          ? t('workspaceSwitcher.waitingElsewhere', { count: waitingElsewhere })
          : currentWorkspace.name}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={(event) => {
          if (isOpen || !['Enter', ' ', 'ArrowDown'].includes(event.key)) return
          event.preventDefault()
          openMenu()
        }}
      >
        <span className="min-w-0 truncate text-text-primary">{currentWorkspace.name}</span>
        {waitingElsewhere > 0 && (
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-warning" aria-hidden="true" />
        )}
        <ChevronDown size={12} className="shrink-0" aria-hidden="true" />
      </button>

      {isOpen && position && (
        <SelectPopover
          ref={popoverRef}
          position={position}
          id={listboxId}
          role="listbox"
          aria-label={t('workspaceSwitcher.label')}
          aria-activedescendant={`${listboxId}-option-${activeIndex}`}
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
        >
          <SelectOptionList>
            {workspaces.map((workspace, index) => (
              <SelectOption
                key={workspace.id}
                id={`${listboxId}-option-${index}`}
                highlighted={index === activeIndex}
                selected={workspace.id === activeWorkspaceId}
                trailing={<WorkspaceAgentSummary {...summaries[index]} />}
                onHover={() => setActiveIndex(index)}
                onSelect={() => chooseWorkspace(workspace)}
              >
                {workspace.name}
              </SelectOption>
            ))}

            <SelectSeparator />

            <SelectOption
              id={`${listboxId}-option-${workspaces.length}`}
              highlighted={activeIndex === workspaces.length}
              icon={<Home size={14} />}
              className="text-text-secondary"
              onHover={() => setActiveIndex(workspaces.length)}
              onSelect={chooseHome}
            >
              {t('workspaceSwitcher.allWorkspaces')}
            </SelectOption>
          </SelectOptionList>
        </SelectPopover>
      )}
    </>
  )
}
