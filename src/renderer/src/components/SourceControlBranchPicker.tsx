import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  ChevronDown,
  Cloud,
  GitBranch as GitBranchIcon,
  LoaderCircle,
  Plus,
} from 'lucide-react'
import type { GitBranch } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import { groupBranches, canCreateBranch } from '@/utils/sourceControlBranches'

interface BranchPickerPosition {
  top: number
  left: number
  width: number
  maxHeight: number
}

function isWithin(target: Node | null, ancestor: Node | null): boolean {
  let current = target
  while (current) {
    if (current === ancestor) return true
    current = current.parentNode
  }
  return false
}

function relativeBranchDate(date: string | undefined, language: string): string {
  const timestamp = typeof date === 'string' ? Date.parse(date) : Number.NaN
  if (!Number.isFinite(timestamp)) return i18n.t('sourceControl.unknownDate')

  const elapsedSeconds = (timestamp - Date.now()) / 1000
  const elapsed = Math.abs(elapsedSeconds)
  const units = [
    { seconds: 31_536_000, unit: 'year' as const },
    { seconds: 2_592_000, unit: 'month' as const },
    { seconds: 604_800, unit: 'week' as const },
    { seconds: 86_400, unit: 'day' as const },
    { seconds: 3_600, unit: 'hour' as const },
    { seconds: 60, unit: 'minute' as const },
  ]
  const unit = units.find(({ seconds }) => elapsed >= seconds) ?? { seconds: 1, unit: 'second' as const }
  const value = Math.max(1, Math.floor(elapsed / unit.seconds))
  return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(
    Math.sign(elapsedSeconds) * value,
    unit.unit,
  )
}

export interface SourceControlBranchPickerProps {
  workspaceId: string
  repositoryPath: string
  currentBranch: string | null
  disabled?: boolean
  onSelect: (branch: GitBranch) => void
  onCreate: (name: string, startPoint?: string) => void
  label?: React.ReactNode
  children?: React.ReactNode
}

type PickerItem =
  | { kind: 'createQuick' }
  | { kind: 'createFrom' }
  | { kind: 'branch'; branch: GitBranch }

export function SourceControlBranchPicker({
  workspaceId,
  repositoryPath,
  currentBranch,
  disabled = false,
  onSelect,
  onCreate,
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

  const openMenu = useCallback(() => {
    setQuery('')
    setCreateMode(null)
    setHighlightIndex(0)
    loadBranches().catch(() => undefined)
    const trigger = triggerRef.current
    if (trigger) {
      const rect = trigger.getBoundingClientRect()
      const viewportWidth = window.innerWidth || rect.right
      const viewportHeight = window.innerHeight || rect.bottom + 320
      const width = Math.min(320, Math.max(rect.width, 220))
      const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8))
      const maxHeight = Math.min(360, Math.max(120, viewportHeight - rect.bottom - 12))
      setPosition({ top: rect.bottom + 4, left, width, maxHeight })
    }
    setIsOpen(true)
  }, [loadBranches])

  const closeMenu = useCallback(() => {
    setIsOpen(false)
    setCreateMode(null)
    setQuery('')
    triggerRef.current?.focus()
  }, [])

  const handleCreateQuick = useCallback((name: string) => {
    onCreate(name.trim())
    closeMenu()
  }, [closeMenu, onCreate])

  const handleSelect = useCallback((branch: GitBranch) => {
    if (branch.current) {
      closeMenu()
      return
    }
    if (branch.worktreePath) return
    onSelect(branch)
    closeMenu()
  }, [closeMenu, onSelect])

  useLayoutEffect(() => {
    if (!isOpen) return
    inputRef.current?.focus()
    const updatePosition = (): void => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const viewportWidth = window.innerWidth || rect.right
      const viewportHeight = window.innerHeight || rect.bottom + 320
      const width = Math.min(320, Math.max(rect.width, 220))
      const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8))
      const maxHeight = Math.min(360, Math.max(120, viewportHeight - rect.bottom - 12))
      setPosition({ top: rect.bottom + 4, left, width, maxHeight })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen])

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

  const groups = groupBranches(branches, query)
  const showCreateQuick = canCreateBranch(branches, query) && !createMode

  const items: PickerItem[] = []
  if (showCreateQuick) items.push({ kind: 'createQuick' })
  items.push({ kind: 'createFrom' })
  for (const branch of groups.recent) items.push({ kind: 'branch', branch })
  for (const branch of groups.local) items.push({ kind: 'branch', branch })
  for (const branch of groups.remote) items.push({ kind: 'branch', branch })

  const enabledItems = items.filter((item) => !(item.kind === 'branch' && item.branch.worktreePath))
  // Clamp highlight
  useEffect(() => {
    if (!enabledItems.length) return
    setHighlightIndex((current) => {
      const highlighted = items[current]
      if (highlighted && !(highlighted.kind === 'branch' && highlighted.branch.worktreePath)) return current
      const firstEnabled = items.findIndex((item) => !(item.kind === 'branch' && item.branch.worktreePath))
      return firstEnabled >= 0 ? firstEnabled : 0
    })
  }, [items, enabledItems.length])

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
    : (branches.length === 0 && !loading ? t('sourceControl.branchSearchPlaceholder') : t('sourceControl.branchSearchPlaceholder'))

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex max-w-32 items-center gap-1 truncate text-xs text-text-secondary hover:text-text-display disabled:opacity-50"
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
          className="fixed z-60 overflow-hidden rounded-md border border-border bg-bg-primary shadow-xl"
          style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
        >
          <div className="border-b border-border p-2">
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
          <div className="overflow-y-auto" style={{ maxHeight: position.maxHeight - 44 }}>
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
                    aria-selected={highlightIndex === items.indexOf({ kind: 'createQuick' })}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-text-display hover:bg-hover-bg ${highlightIndex === items.findIndex((item) => item.kind === 'createQuick') ? 'bg-hover-bg' : ''}`}
                    onMouseEnter={() => setHighlightIndex(items.findIndex((item) => item.kind === 'createQuick'))}
                    onClick={() => handleCreateQuick(query)}
                  >
                    <Plus size={13} className="shrink-0" />
                    <span className="truncate">{t('sourceControl.createBranch', { name: query.trim() })}</span>
                  </div>
                )}
                <div
                  role="option"
                  aria-selected={highlightIndex === items.findIndex((item) => item.kind === 'createFrom')}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-text-display hover:bg-hover-bg ${highlightIndex === items.findIndex((item) => item.kind === 'createFrom') ? 'bg-hover-bg' : ''}`}
                  onMouseEnter={() => setHighlightIndex(items.findIndex((item) => item.kind === 'createFrom'))}
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

                {groups.recent.length > 0 && (
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-text-disabled">{t('sourceControl.recentBranches')}</div>
                )}
                {groups.recent.map((branch) => {
                  const itemIndex = items.findIndex((item) => item.kind === 'branch' && item.branch === branch)
                  const isHighlighted = itemIndex === highlightIndex
                  const disabledRow = Boolean(branch.worktreePath)
                  return (
                    <div
                      key={`recent-${branch.name}`}
                      role="option"
                      aria-selected={branch.current}
                      aria-disabled={disabledRow}
                      className={`flex items-center gap-2 px-3 py-2 text-xs ${disabledRow ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-hover-bg'} ${isHighlighted ? 'bg-hover-bg' : ''}`}
                      title={branch.worktreePath ?? undefined}
                      onMouseEnter={() => { if (!disabledRow) { setHighlightIndex(itemIndex); setHighlightedBranchName(branch.name) } }}
                      onClick={() => !disabledRow && handleSelect(branch)}
                    >
                      {branch.remote ? <Cloud size={13} className="shrink-0 text-text-secondary" /> : <GitBranchIcon size={13} className="shrink-0 text-text-secondary" />}
                      <span className="min-w-0 flex-1 truncate text-text-display">{branch.name}</span>
                      <span className="shrink-0 text-[10px] text-text-disabled">
                        {branch.worktreePath ? t('sourceControl.worktreeInUse') : (branch.upstream ? branch.upstream : relativeBranchDate(branch.committerDate, i18n.language))}
                      </span>
                      {branch.current && <Check size={13} className="shrink-0 text-text-display" />}
                    </div>
                  )
                })}

                {groups.local.length > 0 && (
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-text-disabled">{t('sourceControl.localBranches')}</div>
                )}
                {groups.local.map((branch) => {
                  const itemIndex = items.findIndex((item) => item.kind === 'branch' && item.branch === branch)
                  const isHighlighted = itemIndex === highlightIndex
                  const disabledRow = Boolean(branch.worktreePath)
                  return (
                    <div
                      key={`local-${branch.name}`}
                      role="option"
                      aria-selected={branch.current}
                      aria-disabled={disabledRow}
                      className={`flex items-center gap-2 px-3 py-2 text-xs ${disabledRow ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-hover-bg'} ${isHighlighted ? 'bg-hover-bg' : ''}`}
                      title={branch.worktreePath ?? undefined}
                      onMouseEnter={() => { if (!disabledRow) { setHighlightIndex(itemIndex); setHighlightedBranchName(branch.name) } }}
                      onClick={() => !disabledRow && handleSelect(branch)}
                    >
                      <GitBranchIcon size={13} className="shrink-0 text-text-secondary" />
                      <span className="min-w-0 flex-1 truncate text-text-display">{branch.name}</span>
                      <span className="shrink-0 text-[10px] text-text-disabled">
                        {branch.worktreePath ? t('sourceControl.worktreeInUse') : (branch.upstream ? branch.upstream : relativeBranchDate(branch.committerDate, i18n.language))}
                      </span>
                      {branch.current && <Check size={13} className="shrink-0 text-text-display" />}
                    </div>
                  )
                })}

                {groups.remote.length > 0 && (
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-text-disabled">{t('sourceControl.remoteBranches')}</div>
                )}
                {groups.remote.map((branch) => {
                  const itemIndex = items.findIndex((item) => item.kind === 'branch' && item.branch === branch)
                  const isHighlighted = itemIndex === highlightIndex
                  const disabledRow = Boolean(branch.worktreePath)
                  return (
                    <div
                      key={`remote-${branch.name}`}
                      role="option"
                      aria-selected={false}
                      aria-disabled={disabledRow}
                      className={`flex items-center gap-2 px-3 py-2 text-xs ${disabledRow ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-hover-bg'} ${isHighlighted ? 'bg-hover-bg' : ''}`}
                      title={branch.worktreePath ?? undefined}
                      onMouseEnter={() => { if (!disabledRow) { setHighlightIndex(itemIndex); setHighlightedBranchName(branch.name) } }}
                      onClick={() => !disabledRow && handleSelect(branch)}
                    >
                      <Cloud size={13} className="shrink-0 text-text-secondary" />
                      <span className="min-w-0 flex-1 truncate text-text-display">{branch.name}</span>
                      <span className="shrink-0 text-[10px] text-text-disabled">
                        {relativeBranchDate(branch.committerDate, i18n.language)}
                      </span>
                    </div>
                  )
                })}

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
