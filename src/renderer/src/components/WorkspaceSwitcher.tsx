import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Home } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AgentActiveSession, WorkspaceMetadata } from '@shared/types'
import { getWorkspaceAgentEntries, summarizeWorkspaceAgents } from '@/utils/workspaceSidebarSections'
import { WorkspaceAgentSummary } from './WorkspaceAgentTree'

export interface WorkspaceSwitcherProps {
  /** Active workspaces in sidebar order. */
  workspaces: readonly WorkspaceMetadata[]
  activeWorkspaceId: string | null
  sessions: readonly AgentActiveSession[]
  onSelect: (workspace: WorkspaceMetadata) => void
  onOpenHome: () => void
}

interface MenuPosition {
  top: number
  left: number
  width: number
  maxHeight: number
}

const MENU_WIDTH = 260
const MENU_MAX_HEIGHT = 360

function isWithin(target: Node | null, ancestor: Node | null): boolean {
  let current = target
  while (current) {
    if (current === ancestor) return true
    current = current.parentNode
  }
  return false
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  sessions,
  onSelect,
  onOpenHome,
}: WorkspaceSwitcherProps): React.ReactElement | null {
  const { t } = useTranslation()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<MenuPosition | null>(null)
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

  const updatePosition = useCallback((): void => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth || rect.right
    const width = Math.min(MENU_WIDTH, Math.max(0, viewportWidth - 16))
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8))

    setPosition({
      top: rect.bottom + 4,
      left,
      width,
      maxHeight: MENU_MAX_HEIGHT,
    })
  }, [])

  const openMenu = useCallback((): void => {
    setActiveIndex(Math.max(0, currentIndex))
    updatePosition()
    setIsOpen(true)
  }, [currentIndex, updatePosition])

  const closeMenu = useCallback((): void => {
    setIsOpen(false)
  }, [])

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
    menuRef.current?.focus()
    updatePosition()

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, updatePosition])

  useEffect(() => {
    if (!isOpen) return

    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (isWithin(target, triggerRef.current) || isWithin(target, menuRef.current)) return
      closeMenu()
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown)
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown)
  }, [closeMenu, isOpen])

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

      {isOpen && position && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label={t('workspaceSwitcher.label')}
          aria-activedescendant={`${listboxId}-option-${activeIndex}`}
          tabIndex={-1}
          className="fixed z-60 overflow-y-auto rounded-xl py-1 shadow-xl outline-hidden"
          style={{
            top: position.top,
            left: position.left,
            width: position.width,
            maxHeight: position.maxHeight,
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-visible)',
          }}
          onKeyDown={handleMenuKeyDown}
        >
          {workspaces.map((workspace, index) => {
            const highlighted = index === activeIndex

            return (
              <div
                key={workspace.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={workspace.id === activeWorkspaceId}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-hover-bg ${
                  highlighted ? 'bg-hover-bg' : ''
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseWorkspace(workspace)}
              >
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                <WorkspaceAgentSummary {...summaries[index]} />
                {workspace.id === activeWorkspaceId && (
                  <Check size={14} className="shrink-0 text-accent" aria-hidden="true" />
                )}
              </div>
            )
          })}

          <div className="my-1 border-t border-border-visible" role="separator" />

          <div
            id={`${listboxId}-option-${workspaces.length}`}
            role="option"
            aria-selected={false}
            className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-hover-bg ${
              activeIndex === workspaces.length ? 'bg-hover-bg' : ''
            }`}
            onMouseEnter={() => setActiveIndex(workspaces.length)}
            onClick={chooseHome}
          >
            <Home size={14} className="shrink-0 text-text-secondary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{t('workspaceSwitcher.allWorkspaces')}</span>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
