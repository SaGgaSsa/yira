import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { getAnchoredPopoverPosition } from '@/utils/anchoredPopover'
import type { AnchoredPopoverPosition, AnchoredPopoverSize } from '@/utils/anchoredPopover'

// Shared look and placement for every selection popover (workspace, branch, font...).
// Each picker keeps its own items and keyboard handling and draws them with these parts.

/** Surface classes, also for small action menus anchored with `absolute` (commit mode, branch actions). */
export const popoverSurfaceClass = 'rounded-xl border border-border-visible bg-bg-tertiary shadow-xl'
/** Row classes for a `menuitem` button inside a small action menu. */
export const popoverMenuItemClass = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-hover-bg'

function isWithin(target: Node | null, ancestor: Node | null): boolean {
  let current = target
  while (current) {
    if (current === ancestor) return true
    current = current.parentNode
  }
  return false
}

interface AnchoredPopoverOptions extends Partial<AnchoredPopoverSize> {
  isOpen: boolean
  /** Called when the user presses outside the trigger and the popover. */
  onDismiss: () => void
}

export interface AnchoredPopover {
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>
  popoverRef: React.MutableRefObject<HTMLDivElement | null>
  /** Null while closed. */
  position: AnchoredPopoverPosition | null
  /** Measures the trigger. Call it right before opening so the first render is already placed. */
  measure: () => void
}

export function useAnchoredPopover({
  isOpen,
  onDismiss,
  width = 320,
  matchTriggerWidth = false,
  maxHeight = 360,
  minHeightBelow = 240,
}: AnchoredPopoverOptions): AnchoredPopover {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<AnchoredPopoverPosition | null>(null)

  const measure = useCallback((): void => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth || rect.right
    const viewportHeight = window.innerHeight || rect.bottom + maxHeight
    setPosition(getAnchoredPopoverPosition(rect, viewportWidth, viewportHeight, {
      width,
      matchTriggerWidth,
      maxHeight,
      minHeightBelow,
    }))
  }, [matchTriggerWidth, maxHeight, minHeightBelow, width])

  useLayoutEffect(() => {
    if (!isOpen) return
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [isOpen, measure])

  useEffect(() => {
    if (!isOpen) return
    const handleOutsidePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (isWithin(target, triggerRef.current) || isWithin(target, popoverRef.current)) return
      onDismiss()
    }
    document.addEventListener('pointerdown', handleOutsidePointerDown)
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown)
  }, [isOpen, onDismiss])

  return { triggerRef, popoverRef, position: isOpen ? position : null, measure }
}

interface SelectPopoverProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'style'> {
  position: AnchoredPopoverPosition
  children: React.ReactNode
}

/** Portaled surface. Put an optional `SelectSearchInput` first and the options in a `SelectOptionList`. */
export const SelectPopover = forwardRef<HTMLDivElement, SelectPopoverProps>(function SelectPopover(
  { position, className = '', children, ...props },
  ref,
) {
  return createPortal(
    <div
      ref={ref}
      className={`fixed z-10010 flex flex-col overflow-hidden outline-hidden ${popoverSurfaceClass} ${className}`}
      style={{
        top: position.top,
        bottom: position.bottom,
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
      }}
      {...props}
    >
      {children}
    </div>,
    document.body,
  )
})

export const SelectSearchInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function SelectSearchInput({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        type="text"
        spellCheck={false}
        autoComplete="off"
        className={`w-full shrink-0 border-b border-border-visible bg-transparent px-3 py-2 text-sm text-text-display outline-hidden placeholder:text-text-disabled ${className}`}
        {...props}
      />
    )
  },
)

export function SelectOptionList({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="min-h-0 flex-1 overflow-y-auto py-1">{children}</div>
}

export function SelectGroupLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wide text-text-disabled" role="presentation">
      {children}
    </div>
  )
}

export function SelectSeparator(): React.ReactElement {
  return <div className="my-1 border-t border-border-visible" role="separator" />
}

/** Loading, error, or empty-state line inside the option list. */
export function SelectMessage({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-disabled">{children}</div>
}

interface SelectOptionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  highlighted: boolean
  /** Shows the accent check mark at the end of the row. */
  selected?: boolean
  disabled?: boolean
  icon?: React.ReactNode
  /** Secondary text on the right. It truncates before the label does. */
  meta?: React.ReactNode
  /** Extra controls after the meta text, such as an actions button. */
  trailing?: React.ReactNode
  onHover: () => void
  onSelect: () => void
  children: React.ReactNode
}

export const SelectOption = forwardRef<HTMLDivElement, SelectOptionProps>(function SelectOption({
  highlighted,
  selected = false,
  disabled = false,
  icon,
  meta,
  trailing,
  onHover,
  onSelect,
  className = '',
  children,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      className={`group flex items-center gap-2 px-3 py-2 text-sm text-text-primary transition-colors ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-hover-bg'
      } ${highlighted ? 'bg-hover-bg' : ''} ${className}`}
      onMouseEnter={() => { if (!disabled) onHover() }}
      onClick={() => { if (!disabled) onSelect() }}
      {...props}
    >
      {icon && <span className="flex shrink-0 text-text-secondary" aria-hidden="true">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {meta && <span className="min-w-0 max-w-[40%] truncate text-xs text-text-disabled">{meta}</span>}
      {trailing}
      {selected && <Check size={14} className="shrink-0 text-accent" aria-hidden="true" />}
    </div>
  )
})
