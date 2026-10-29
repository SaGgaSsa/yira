import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
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

interface BranchPickerPosition {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
}

const PICKER_WIDTH = 420
const PICKER_MAX_HEIGHT = 480
const PICKER_MIN_HEIGHT_BELOW = 240

// Shows only the remote when a branch tracks the remote branch of the same name.
function formatUpstream(branchName: string, upstream: string): string {
  const slash = upstream.indexOf('/')
  if (slash > 0 && upstream.slice(slash + 1) === branchName) return upstream.slice(0, slash)
  return upstream
}

function isWithin(target: Node | null, ancestor: Node | null): boolean {
  let current = target
  while (current) {
    if (current === ancestor) return true
    current = current.parentNode
  }
  return false
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
    <div
      role="option"
      aria-selected={branch.current}
      aria-disabled={disabledRow}
      className={`group flex items-center gap-2 px-3 py-2 text-xs ${disabledRow ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-hover-bg'} ${highlighted ? 'bg-hover-bg' : ''}`}
      title={branch.worktreePath ?? branch.upstream ?? branch.name}
      onMouseEnter={() => { if (!disabledRow) onHover() }}
      onClick={() => { if (!disabledRow) onSelect() }}
    >
      {branch.remote ? <Cloud size={13} className="shrink-0 text-text-secondary" /> : <GitBranchIcon size={13} className="shrink-0 text-text-secondary" />}
      <span className="min-w-0 flex-1 truncate text-text-display">{branch.name}</span>
      <span className="min-w-0 max-w-[40%] truncate text-[10px] text-text-disabled">
        {branch.worktreePath ? t('sourceControl.worktreeInUse') : (branch.upstream ? formatUpstream(branch.name, branch.upstream) : formatRelativeDate(branch.committerDate, i18n.language))}
      </span>
      {branch.current && <Check size={13} className="shrink-0 text-text-display" />}
      {canRunActions && (
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
              className="absolute right-0 top-full z-70 mt-1 min-w-[180px] rounded-sm border border-border bg-bg-primary shadow-xl"
            >
              {onMerge && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-display hover:bg-hover-bg"
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
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-display hover:bg-hover-bg"
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
    </div>
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
      <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-text-disabled">{title}</div>
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
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<BranchPickerPosition | null>(null)
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

  const getPickerPosition = useCallback((): BranchPickerPosition | null => {
    const trigger = triggerRef.current
    if (!trigger) return null
    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth || rect.right
    const viewportHeight = window.innerHeight || rect.bottom + 320
    const width = Math.min(PICKER_WIDTH, viewportWidth - 16)
    // Keep the trigger's left edge when the menu fits, otherwise align to its right edge.
    const preferredLeft = rect.left + width <= viewportWidth - 8 ? rect.left : rect.right - width
    const left = Math.max(8, Math.min(preferredLeft, viewportWidth - width - 8))
    const spaceBelow = viewportHeight - rect.bottom - 12
    const spaceAbove = rect.top - 12
    if (spaceBelow < PICKER_MIN_HEIGHT_BELOW && spaceAbove > spaceBelow) {
      const maxHeight = Math.min(PICKER_MAX_HEIGHT, spaceAbove)
      return { bottom: viewportHeight - rect.top + 4, left, width, maxHeight }
    }
    const maxHeight = Math.min(PICKER_MAX_HEIGHT, Math.max(120, spaceBelow))
    return { top: rect.bottom + 4, left, width, maxHeight }
  }, [])

  const openMenu = useCallback(() => {
    setQuery('')
    setCreateMode(null)
    setHighlightIndex(0)
    loadBranches().catch(() => undefined)
    setPosition(getPickerPosition())
    setIsOpen(true)
  }, [getPickerPosition, loadBranches])

  const closeMenu = useCallback(() => {
    setIsOpen(false)
    setCreateMode(null)
    setQuery('')
    triggerRef.current?.focus()
  }, [])

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
    const updatePosition = (): void => {
      const next = getPickerPosition()
      if (next) setPosition(next)
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [getPickerPosition, isOpen])

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

      {isOpen && position && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label={t('sourceControl.localBranches')}
          className="fixed z-60 flex flex-col overflow-hidden rounded-md border border-border bg-bg-primary shadow-xl"
          style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width, maxHeight: position.maxHeight }}
        >
          <div className="shrink-0 border-b border-border p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setHighlightIndex(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full rounded-sm border border-border-visible bg-bg-primary px-2 py-1 text-xs text-text-display outline-hidden placeholder:text-text-disabled"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-disabled">
                <LoaderCircle size={13} className="animate-spin" /> {t('sourceControl.loading')}
              </div>
            ) : error ? (
              <div className="px-3 py-2 text-xs text-red-300">{error}</div>
            ) : (
              <>
                {showCreateQuick && (
                  <div
                    role="option"
                    aria-selected={highlightIndex === createQuickIndex}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-text-display hover:bg-hover-bg ${highlightIndex === createQuickIndex ? 'bg-hover-bg' : ''}`}
                    onMouseEnter={() => setHighlightIndex(createQuickIndex)}
                    onClick={() => handleCreateQuick(query)}
                  >
                    <Plus size={13} className="shrink-0" />
                    <span className="truncate">{t('sourceControl.createBranch', { name: query.trim() })}</span>
                  </div>
                )}
                <div
                  role="option"
                  aria-selected={highlightIndex === createFromIndex}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-text-display hover:bg-hover-bg ${highlightIndex === createFromIndex ? 'bg-hover-bg' : ''}`}
                  onMouseEnter={() => setHighlightIndex(createFromIndex)}
                  onClick={() => {
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
                  <Plus size={13} className="shrink-0" />
                  <span>{t('sourceControl.createBranchFrom')}</span>
                </div>

                <BranchGroup title={t('sourceControl.recentBranches')} branches={groups.recent} renderItem={renderBranchRow} />
                <BranchGroup title={t('sourceControl.localBranches')} branches={groups.local} renderItem={renderBranchRow} />
                <BranchGroup title={t('sourceControl.remoteBranches')} branches={groups.remote} renderItem={renderBranchRow} />

                {!loading && !error && groups.recent.length === 0 && groups.local.length === 0 && groups.remote.length === 0 && (
                  <div className="px-3 py-2 text-xs text-text-disabled">{t('sourceControl.noBranch')}</div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body,
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
