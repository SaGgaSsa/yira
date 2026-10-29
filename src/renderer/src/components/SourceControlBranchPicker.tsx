import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown,
  Cloud,
  Ellipsis,
  GitBranch as GitBranchIcon,
  GitMerge,
  GitPullRequestArrow,
  LoaderCircle,
  Plus,
} from 'lucide-react'
import type { GitBranch } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import { groupBranches, canCreateBranch } from '@/utils/sourceControlBranches'
import { formatRelativeDate } from '@/utils/relativeDate'
import {
  popoverMenuItemClass,
  popoverSurfaceClass,
  SelectGroupLabel,
  SelectMessage,
  SelectOption,
  SelectOptionList,
  SelectPopover,
  SelectSearchInput,
  useAnchoredPopover,
} from './SelectPopover'

// Shows only the remote when a branch tracks the remote branch of the same name.
function formatUpstream(branchName: string, upstream: string): string {
  const slash = upstream.indexOf('/')
  if (slash > 0 && upstream.slice(slash + 1) === branchName) return upstream.slice(0, slash)
  return upstream
}

export interface SourceControlBranchPickerProps {
  workspaceId: string
  repositoryPath: string
  currentBranch: string | null
  disabled?: boolean
  variant?: 'compact' | 'prominent'
  onSelect: (branch: GitBranch) => void
  onCreate: (name: string, startPoint?: string) => void
  onMerge?: (branch: GitBranch) => void
  onRebase?: (branch: GitBranch) => void
  label?: React.ReactNode
  children?: React.ReactNode
}

type PickerItem =
  | { kind: 'createQuick' }
  | { kind: 'createFrom' }
  | { kind: 'branch'; branch: GitBranch }

interface BranchRowProps {
  branch: GitBranch
  currentBranch: string | null
  highlighted: boolean
  onHover: () => void
  onSelect: () => void
  onMerge?: (branch: GitBranch) => void
  onRebase?: (branch: GitBranch) => void
}

function BranchRow({
  branch,
  currentBranch,
  highlighted,
  onHover,
  onSelect,
  onMerge,
  onRebase,
}: BranchRowProps): React.ReactElement {
  const { t } = useTranslation()
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const isCurrent = branch.current
  const disabledRow = Boolean(branch.worktreePath)
  const canRunActions = !isCurrent

  return (
    <SelectOption
      highlighted={highlighted}
      selected={branch.current}
      disabled={disabledRow}
      icon={branch.remote ? <Cloud size={14} /> : <GitBranchIcon size={14} />}
      meta={branch.worktreePath ? t('sourceControl.worktreeInUse') : (branch.upstream ? formatUpstream(branch.name, branch.upstream) : formatRelativeDate(branch.committerDate, i18n.language))}
      title={branch.worktreePath ?? branch.upstream ?? branch.name}
      onHover={onHover}
      onSelect={onSelect}
      trailing={canRunActions && (
        <div className="relative shrink-0" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-text-secondary opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-hover-bg hover:text-text-display"
            aria-label={t('sourceControl.branchActions')}
            onClick={() => setActionMenuOpen((current) => !current)}
          >
            <Ellipsis size={13} />
          </button>
          {actionMenuOpen && (
            <div
              role="menu"
              className={`absolute right-0 top-full z-70 mt-1 min-w-[220px] py-1 ${popoverSurfaceClass}`}
            >
              {onMerge && (
                <button
                  type="button"
                  role="menuitem"
                  className={popoverMenuItemClass}
                  onClick={() => { onMerge(branch); setActionMenuOpen(false) }}
                >
                  <GitMerge size={13} className="shrink-0" />
                  <span className="truncate">{t('sourceControl.mergeBranchInto', { branch: branch.name, current: currentBranch ?? t('sourceControl.noBranch') })}</span>
                </button>
              )}
              {onRebase && (
                <button
                  type="button"
                  role="menuitem"
                  className={popoverMenuItemClass}
                  onClick={() => { onRebase(branch); setActionMenuOpen(false) }}
                >
                  <GitPullRequestArrow size={13} className="shrink-0" />
                  <span className="truncate">{t('sourceControl.rebaseCurrentOnto', { current: currentBranch ?? t('sourceControl.noBranch'), branch: branch.name })}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    >
      {branch.name}
    </SelectOption>
  )
}

interface BranchGroupProps {
  title: string
  branches: GitBranch[]
  renderItem: (branch: GitBranch) => React.ReactNode
}

function BranchGroup({ title, branches, renderItem }: BranchGroupProps): React.ReactElement | null {
  if (branches.length === 0) return null
  return (
    <>
      <SelectGroupLabel>{title}</SelectGroupLabel>
      {branches.map((branch) => renderItem(branch))}
    </>
  )
}

export function SourceControlBranchPicker({
  workspaceId,
  repositoryPath,
  currentBranch,
  disabled = false,
  variant = 'compact',
  onSelect,
  onCreate,
  onMerge,
  onRebase,
  label,
  children,
}: SourceControlBranchPickerProps): React.ReactElement {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [createMode, setCreateMode] = useState<{ startPoint: string } | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [highlightedBranchName, setHighlightedBranchName] = useState<string | null>(null)
  const listboxId = `branch-picker-${useId()}`

  const loadBranches = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electron.git.branches(workspaceId, repositoryPath)
      if (result?.error) setError(result.error)
      setBranches(Array.isArray(result?.branches) ? result.branches : [])
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError))
      setBranches([])
    } finally {
      setLoading(false)
    }
  }, [repositoryPath, workspaceId])

  const closeMenu = useCallback(() => {
    setIsOpen(false)
    setCreateMode(null)
    setQuery('')
    triggerRef.current?.focus()
  }, [])

  const { triggerRef, popoverRef, position, measure } = useAnchoredPopover({
    isOpen,
    onDismiss: closeMenu,
    width: 420,
    maxHeight: 480,
  })

  const openMenu = useCallback(() => {
    setQuery('')
    setCreateMode(null)
    setHighlightIndex(0)
    loadBranches().catch(() => undefined)
    measure()
    setIsOpen(true)
  }, [loadBranches, measure])

  const handleSelect = useCallback((branch: GitBranch) => {
    if (branch.current) {
      closeMenu()
      return
    }
    if (branch.worktreePath) return
    onSelect(branch)
    closeMenu()
  }, [closeMenu, onSelect])

  const handleCreateQuick = useCallback((name: string) => {
    onCreate(name.trim())
    closeMenu()
  }, [closeMenu, onCreate])

  const handleMerge = useCallback((branch: GitBranch) => {
    onMerge?.(branch)
    closeMenu()
  }, [closeMenu, onMerge])

  const handleRebase = useCallback((branch: GitBranch) => {
    onRebase?.(branch)
    closeMenu()
  }, [closeMenu, onRebase])

  useLayoutEffect(() => {
    if (!isOpen) return
    inputRef.current?.focus()
  }, [isOpen])

  const groups = useMemo(() => groupBranches(branches, query), [branches, query])
  const showCreateQuick = canCreateBranch(branches, query) && !createMode

  const items = useMemo((): PickerItem[] => {
    const next: PickerItem[] = []
    if (showCreateQuick) next.push({ kind: 'createQuick' })
    next.push({ kind: 'createFrom' })
    for (const branch of groups.recent) next.push({ kind: 'branch', branch })
    for (const branch of groups.local) next.push({ kind: 'branch', branch })
    for (const branch of groups.remote) next.push({ kind: 'branch', branch })
    return next
  }, [groups, showCreateQuick])

  // Clamp highlight
  useEffect(() => {
    if (!items.length) return
    setHighlightIndex((current) => {
      const highlighted = items[current]
      if (highlighted && !(highlighted.kind === 'branch' && highlighted.branch.worktreePath)) {
        return Math.min(current, items.length - 1)
      }
      const firstEnabled = items.findIndex((item) => !(item.kind === 'branch' && item.branch.worktreePath))
      return firstEnabled >= 0 ? firstEnabled : 0
    })
  }, [items])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement | HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (items.length === 0) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      let next = highlightIndex
      for (let attempts = 0; attempts < items.length; attempts += 1) {
        next = (next + direction + items.length) % items.length
        const candidate = items[next]
        if (!(candidate.kind === 'branch' && candidate.branch.worktreePath)) break
      }
      setHighlightIndex(next)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const highlighted = items[highlightIndex]
      if (createMode) {
        if (canCreateBranch(branches, query)) handleCreateQuick(query)
        return
      }
      if (highlighted?.kind === 'createQuick') {
        handleCreateQuick(query)
        return
      }
      if (highlighted?.kind === 'createFrom') {
        const branchStart = highlightedBranchName
          ?? branches.find((item) => item.current)?.name
          ?? currentBranch
          ?? ''
        setCreateMode({ startPoint: branchStart })
        setQuery('')
        setHighlightIndex(0)
        return
      }
      if (highlighted?.kind === 'branch') {
        handleSelect(highlighted.branch)
        return
      }
      const allEmpty = groups.recent.length === 0 && groups.local.length === 0 && groups.remote.length === 0
      if (allEmpty && canCreateBranch(branches, query)) {
        handleCreateQuick(query)
      }
    }
  }

  const placeholder = createMode
    ? t('sourceControl.newBranchNameFrom', { branch: createMode.startPoint })
    : t('sourceControl.branchSearchPlaceholder')

  const renderBranchRow = (branch: GitBranch): React.ReactNode => {
    const itemIndex = items.findIndex((item) => item.kind === 'branch' && item.branch === branch)
    return (
      <BranchRow
        key={`${branch.remote ? 'remote' : 'local'}-${branch.name}`}
        branch={branch}
        currentBranch={currentBranch}
        highlighted={itemIndex === highlightIndex}
        onHover={() => { setHighlightIndex(itemIndex); setHighlightedBranchName(branch.name) }}
        onSelect={() => handleSelect(branch)}
        onMerge={onMerge ? handleMerge : undefined}
        onRebase={onRebase ? handleRebase : undefined}
      />
    )
  }

  const createQuickIndex = items.findIndex((item) => item.kind === 'createQuick')
  const createFromIndex = items.findIndex((item) => item.kind === 'createFrom')

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={variant === 'prominent'
          ? 'inline-flex min-w-0 items-center gap-1 truncate text-sm text-text-display hover:text-text-display disabled:opacity-50'
          : 'inline-flex max-w-32 items-center gap-1 truncate text-xs text-text-secondary hover:text-text-display disabled:opacity-50'}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        disabled={disabled}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        title={currentBranch ?? t('sourceControl.noBranch')}
      >
        <span className="truncate">{children ?? label ?? currentBranch ?? t('sourceControl.noBranch')}</span>
        <ChevronDown size={12} className="shrink-0" />
      </button>

      {isOpen && position && (
        <SelectPopover
          ref={popoverRef}
          position={position}
          id={listboxId}
          role="listbox"
          aria-label={t('sourceControl.localBranches')}
        >
          <SelectSearchInput
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setHighlightIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
          />
          <SelectOptionList>
            {loading ? (
              <SelectMessage>
                <LoaderCircle size={13} className="animate-spin" /> {t('sourceControl.loading')}
              </SelectMessage>
            ) : error ? (
              <SelectMessage>
                <span className="text-danger">{error}</span>
              </SelectMessage>
            ) : (
              <>
                {showCreateQuick && (
                  <SelectOption
                    highlighted={highlightIndex === createQuickIndex}
                    icon={<Plus size={14} />}
                    onHover={() => setHighlightIndex(createQuickIndex)}
                    onSelect={() => handleCreateQuick(query)}
                  >
                    {t('sourceControl.createBranch', { name: query.trim() })}
                  </SelectOption>
                )}
                <SelectOption
                  highlighted={highlightIndex === createFromIndex}
                  icon={<Plus size={14} />}
                  onHover={() => setHighlightIndex(createFromIndex)}
                  onSelect={() => {
                    const branchStart = highlightedBranchName
                      ?? branches.find((item) => item.current)?.name
                      ?? currentBranch
                      ?? ''
                    setCreateMode({ startPoint: branchStart })
                    setQuery('')
                    setHighlightIndex(0)
                    inputRef.current?.focus()
                  }}
                >
                  {t('sourceControl.createBranchFrom')}
                </SelectOption>

                <BranchGroup title={t('sourceControl.recentBranches')} branches={groups.recent} renderItem={renderBranchRow} />
                <BranchGroup title={t('sourceControl.localBranches')} branches={groups.local} renderItem={renderBranchRow} />
                <BranchGroup title={t('sourceControl.remoteBranches')} branches={groups.remote} renderItem={renderBranchRow} />

                {groups.recent.length === 0 && groups.local.length === 0 && groups.remote.length === 0 && (
                  <SelectMessage>{t('sourceControl.noBranch')}</SelectMessage>
                )}
              </>
            )}
          </SelectOptionList>
        </SelectPopover>
      )}
    </>
  )
}

export interface BranchSwitchChangesDialogProps {
  open: boolean
  from: string
  to: string
  onCarry: () => void
  onStash: () => void
  onCancel: () => void
}

export function BranchSwitchChangesDialog({
  open,
  from,
  to,
  onCarry,
  onStash,
  onCancel,
}: BranchSwitchChangesDialogProps): React.ReactElement | null {
  const { t } = useTranslation()
  const carryButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    window.requestAnimationFrame(() => carryButtonRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-10030 flex items-center justify-center bg-black/80"
      role="dialog"
      aria-modal="true"
      onClick={(event) => { if (event.target === event.currentTarget) onCancel() }}
    >
      <div className="w-[480px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[24px] border border-border-visible bg-bg-secondary shadow-2xl">
        <div className="border-b border-border px-6 py-5">
          <h2 className="mt-1 text-xl text-text-display">{t('sourceControl.uncommittedChangesIn', { branch: from })}</h2>
        </div>
        <div className="space-y-5 px-6 py-6">
          <p className="text-sm leading-6 text-text-secondary">{t('sourceControl.changesSwitchQuestion', { branch: to })}</p>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-5">
          <button
            type="button"
            className="rounded-full border border-border-visible px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="rounded-full border border-border-visible px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
            onClick={onStash}
          >
            {t('sourceControl.stashAndSwitch')}
          </button>
          <button
            ref={carryButtonRef}
            type="button"
            className="rounded-full border border-border-visible bg-active-bg px-4 py-2 text-sm text-text-display transition-colors hover:bg-hover-bg"
            onClick={onCarry}
          >
            {t('sourceControl.carryChanges')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
