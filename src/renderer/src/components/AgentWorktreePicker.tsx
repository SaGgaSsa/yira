import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, GitBranch } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AgentWorktreeOption, GitRepository } from '@shared/types'
import {
  SelectGroupLabel,
  SelectMessage,
  SelectOption,
  SelectOptionList,
  SelectPopover,
  SelectSearchInput,
  SelectSeparator,
  useAnchoredPopover,
} from './SelectPopover'

export type AgentWorktreeSelection =
  | { kind: 'workspace' }
  | { kind: 'new'; repositories: string[] }
  | { kind: 'existing'; option: AgentWorktreeOption }

interface AgentWorktreePickerProps {
  workspaceId: string
  repositories: GitRepository[]
  selection: AgentWorktreeSelection
  disabled?: boolean
  onChange: (selection: AgentWorktreeSelection) => void
}

interface WorktreeGroup {
  key: string
  branch: string | undefined
  head: string
  options: AgentWorktreeOption[]
  createdByYira: boolean
}

type SelectableItem =
  | { kind: 'workspace' }
  | { kind: 'new' }
  | { kind: 'existing'; option: AgentWorktreeOption }

function groupWorktrees(options: AgentWorktreeOption[]): WorktreeGroup[] {
  const groups: WorktreeGroup[] = []
  const byKey = new Map<string, WorktreeGroup>()
  for (const option of options) {
    const key = option.branch ?? `detached:${option.head}`
    let group = byKey.get(key)
    if (!group) {
      group = {
        key,
        branch: option.branch,
        head: option.head,
        options: [],
        createdByYira: false,
      }
      byKey.set(key, group)
      groups.push(group)
    }
    group.options.push(option)
    if (option.createdByYira) group.createdByYira = true
  }
  return groups
}

function matchesQuery(option: AgentWorktreeOption, query: string): boolean {
  if (!query) return true
  const searchable = [
    option.branch ?? '',
    option.head,
    option.path,
    ...option.repositories.flatMap((repository) => [repository.name, repository.relativePath]),
  ]
  return searchable.some((value) => value.toLowerCase().includes(query))
}

function getModuleNames(repositories: GitRepository[]): string {
  return repositories.map((repository) => repository.name).join(', ')
}

export function AgentWorktreePicker({
  workspaceId,
  repositories,
  selection,
  disabled = false,
  onChange,
}: AgentWorktreePickerProps): React.ReactElement {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [worktrees, setWorktrees] = useState<AgentWorktreeOption[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const worktreeRequestRef = useRef(0)
  const previousWorkspaceIdRef = useRef(workspaceId)
  const listboxId = `agent-worktree-picker-${useId()}`

  const closeMenu = useCallback((): void => {
    setIsOpen(false)
    setQuery('')
  }, [])

  const { triggerRef, popoverRef, position, measure } = useAnchoredPopover({
    isOpen,
    onDismiss: closeMenu,
    width: 520,
    maxHeight: 520,
    minHeightBelow: 520,
  })

  useEffect(() => {
    if (previousWorkspaceIdRef.current === workspaceId) return
    previousWorkspaceIdRef.current = workspaceId
    setQuery('')
    setIsOpen(false)
    worktreeRequestRef.current += 1
  }, [workspaceId])

  useEffect(() => {
    if (!isOpen) return
    const requestId = ++worktreeRequestRef.current
    setWorktrees(null)
    setLoadError(false)
    void window.electron.agents.listWorktrees(workspaceId)
      .then((options) => {
        if (requestId !== worktreeRequestRef.current) return
        setWorktrees(options)
      })
      .catch(() => {
        if (requestId !== worktreeRequestRef.current) return
        setWorktrees([])
        setLoadError(true)
      })
    return () => {
      worktreeRequestRef.current += 1
    }
  }, [isOpen, workspaceId])

  useLayoutEffect(() => {
    if (!isOpen) return
    searchRef.current?.focus()
  }, [isOpen])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleWorktrees = useMemo(
    () => (worktrees ?? []).filter((option) => matchesQuery(option, normalizedQuery)),
    [normalizedQuery, worktrees],
  )
  const groups = useMemo(() => groupWorktrees(visibleWorktrees), [visibleWorktrees])
  const selectableItems = useMemo((): SelectableItem[] => {
    const items: SelectableItem[] = [{ kind: 'workspace' }, { kind: 'new' }]
    for (const group of groups) {
      for (const option of group.options) {
        if (!option.missing) items.push({ kind: 'existing', option })
      }
    }
    return items
  }, [groups])

  const getItemIndex = useCallback((option: AgentWorktreeOption): number => (
    selectableItems.findIndex((item) => item.kind === 'existing' && item.option.path === option.path)
  ), [selectableItems])

  const chooseItem = useCallback((item: SelectableItem): void => {
    if (item.kind === 'workspace') {
      onChange({ kind: 'workspace' })
      closeMenu()
      triggerRef.current?.focus()
      return
    }
    if (item.kind === 'new') {
      // Choosing it again keeps the modules already unchecked.
      if (selection.kind !== 'new') {
        onChange({
          kind: 'new',
          repositories: repositories.map((repository) => repository.relativePath),
        })
      }
      setActiveIndex(1)
      searchRef.current?.focus()
      return
    }
    onChange({ kind: 'existing', option: item.option })
    closeMenu()
    triggerRef.current?.focus()
  }, [closeMenu, onChange, repositories, selection.kind, triggerRef])

  const openMenu = useCallback((): void => {
    setQuery('')
    setWorktrees(null)
    setLoadError(false)
    const selectedIndex = selection.kind === 'existing'
      ? selectableItems.findIndex((item) => (
        item.kind === 'existing' && item.option.path === selection.option.path
      ))
      : selection.kind === 'new'
        ? 1
        : 0
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    measure()
    setIsOpen(true)
  }, [measure, selectableItems, selection])

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu()
      triggerRef.current?.focus()
      return
    }

    // The module checkboxes and the search field are reached with Tab.
    if (event.key === 'Tab') return
    // Enter toggles a focused checkbox; in the search field it chooses the highlighted row.
    if (event.key === 'Enter' && (event.target as HTMLInputElement).type === 'checkbox') return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (selectableItems.length === 0) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + direction + selectableItems.length) % selectableItems.length)
      return
    }

    if (event.key === 'Enter') {
      const item = selectableItems[activeIndex]
      if (!item) return
      event.preventDefault()
      chooseItem(item)
    }
  }

  let label: string
  if (selection.kind === 'workspace') {
    label = t('agentsView.worktreeNone')
  } else if (selection.kind === 'new') {
    label = repositories.length > 1
      ? t('agentsView.worktreeNewCount', { count: selection.repositories.length })
      : t('agentsView.worktreeNew')
  } else {
    const branch = selection.option.branch ?? selection.option.head
    label = selection.option.repositories.length > 1
      ? `${branch} · ${t('agentsView.worktreeModules', { count: selection.option.repositories.length })}`
      : selection.option.repositories[0]
        ? `${branch} · ${selection.option.repositories[0].name}`
        : branch
  }

  const isSelected = selection.kind !== 'workspace'
  const isLoading = worktrees === null && !loadError

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`inline-flex h-9 w-fit max-w-full min-w-0 shrink-0 items-center gap-2 rounded-full border px-3 text-sm leading-5 outline-hidden transition-colors focus:border-text-secondary disabled:opacity-50 ${
          isSelected
            ? 'border-accent bg-accent-subtle text-text-display'
            : 'border-border-visible bg-bg-primary text-text-primary hover:bg-hover-bg'
        }`}
        aria-label={`${t('agentsView.worktree')}: ${label}`}
        title={t('agentsView.worktreeDescription')}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={(event) => {
          if (isOpen || !['Enter', ' ', 'ArrowDown'].includes(event.key)) return
          event.preventDefault()
          openMenu()
        }}
      >
        <GitBranch size={13} className="shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="max-w-54 truncate text-left">{label}</span>
        <ChevronDown size={13} className="shrink-0 text-text-secondary" aria-hidden="true" />
      </button>

      {isOpen && position && (
        <SelectPopover
          ref={popoverRef}
          position={position}
          id={listboxId}
          role="listbox"
          aria-label={t('agentsView.worktree')}
          aria-activedescendant={selectableItems[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
        >
          <SelectSearchInput
            ref={searchRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            placeholder={t('agentsView.worktreeSearch')}
            aria-label={t('agentsView.worktreeSearch')}
          />
          <SelectOptionList>
            <SelectOption
              id={`${listboxId}-option-0`}
              highlighted={activeIndex === 0}
              selected={selection.kind === 'workspace'}
              onHover={() => setActiveIndex(0)}
              onSelect={() => chooseItem({ kind: 'workspace' })}
            >
              {t('agentsView.worktreeWorkspaceFolder')}
            </SelectOption>
            <SelectOption
              id={`${listboxId}-option-1`}
              highlighted={activeIndex === 1}
              selected={selection.kind === 'new'}
              onHover={() => setActiveIndex(1)}
              onSelect={() => chooseItem({ kind: 'new' })}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{t('agentsView.worktreeNew')}</span>
                <span className="truncate text-xs text-text-secondary">
                  {t('agentsView.worktreeNewDescription')}
                </span>
              </span>
            </SelectOption>

            {selection.kind === 'new' && repositories.length > 1 && (
              <div
                className="flex flex-col gap-1 px-3 pb-2"
                role="group"
                aria-label={t('agentsView.worktreeNew')}
              >
                {repositories.map((repository) => (
                  <label
                    key={repository.relativePath}
                    className="flex cursor-pointer items-center gap-2 text-sm text-text-primary"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 shrink-0 accent-(--accent)"
                      checked={selection.repositories.includes(repository.relativePath)}
                      onChange={(event) => {
                        const nextRepositories = repositories
                          .map((entry) => entry.relativePath)
                          .filter((relativePath) => (
                            relativePath === repository.relativePath
                              ? event.target.checked
                              : selection.repositories.includes(relativePath)
                          ))
                        onChange({ kind: 'new', repositories: nextRepositories })
                      }}
                    />
                    <span className="truncate">{repository.name}</span>
                    {repository.relativePath !== repository.name && (
                      <span className="min-w-0 truncate font-mono text-xs text-text-secondary">
                        {repository.relativePath}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}

            <SelectSeparator />
            <SelectGroupLabel>{t('agentsView.worktreeExisting')}</SelectGroupLabel>

            {isLoading ? (
              <SelectMessage>{t('agentsView.worktreeLoading')}</SelectMessage>
            ) : loadError ? (
              <SelectMessage>{t('agentsView.worktreeLoadError')}</SelectMessage>
            ) : worktrees && worktrees.length === 0 ? (
              <SelectMessage>{t('agentsView.worktreeNoneFound')}</SelectMessage>
            ) : worktrees && visibleWorktrees.length === 0 ? (
              <SelectMessage>{t('agentsView.worktreeNoMatches')}</SelectMessage>
            ) : null}

            {groups.map((group) => (
              <React.Fragment key={group.key}>
                <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                  <span className="min-w-0 truncate font-mono text-xs text-text-secondary">
                    {group.branch ?? t('agentsView.worktreeDetached', { head: group.head })}
                  </span>
                  {group.createdByYira && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-disabled">
                      {t('agentsView.worktreeCreatedByYira')}
                    </span>
                  )}
                  {group.options.length > 1 && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-disabled">
                      {t('agentsView.worktreeNoSharedFolder')}
                    </span>
                  )}
                </div>
                {group.options.map((option) => {
                  const itemIndex = getItemIndex(option)
                  const metaParts: string[] = []
                  if (option.missing) {
                    metaParts.push(t('agentsView.worktreeMissing'))
                  } else {
                    if (option.changedFiles === 0) {
                      metaParts.push(t('agentsView.worktreeClean'))
                    } else if (option.changedFiles !== undefined && option.changedFiles > 0) {
                      metaParts.push(t('agentsView.worktreeChanges', { count: option.changedFiles }))
                    }
                    if (option.activeSessions > 0) {
                      metaParts.push(t('agentsView.worktreeSessions', { count: option.activeSessions }))
                    }
                  }
                  return (
                    <SelectOption
                      key={option.path}
                      id={itemIndex >= 0 ? `${listboxId}-option-${itemIndex}` : undefined}
                      highlighted={itemIndex >= 0 && itemIndex === activeIndex}
                      selected={selection.kind === 'existing' && selection.option.path === option.path}
                      disabled={option.missing}
                      title={option.path}
                      meta={metaParts.length > 0 ? metaParts.join(' · ') : undefined}
                      onHover={() => {
                        if (itemIndex >= 0) setActiveIndex(itemIndex)
                      }}
                      onSelect={() => chooseItem({ kind: 'existing', option })}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{getModuleNames(option.repositories)}</span>
                        <span className="truncate font-mono text-xs text-text-secondary">{option.path}</span>
                      </span>
                    </SelectOption>
                  )
                })}
              </React.Fragment>
            ))}
          </SelectOptionList>
        </SelectPopover>
      )}
    </>
  )
}
