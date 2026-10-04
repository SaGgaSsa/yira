import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, FolderOpen } from 'lucide-react'

export interface WorkspacePickerOption {
  id: string
  label: string
}

interface WorkspacePickerMenuProps {
  options: WorkspacePickerOption[]
  selectedId: string | null
  label: string
  disabled?: boolean
  onSelect: (workspaceId: string) => void
}

interface MenuPosition {
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

export function WorkspacePickerMenu({
  options,
  selectedId,
  label,
  disabled = false,
  onSelect,
}: WorkspacePickerMenuProps): React.ReactElement {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const listboxId = `workspace-picker-${useId()}`
  const selectedOption = options.find((option) => option.id === selectedId)

  const updatePosition = useCallback((): void => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth || rect.right
    const viewportHeight = window.innerHeight || rect.bottom + 320
    const maxWidth = Math.min(288, Math.max(0, viewportWidth - 16))
    const width = Math.min(Math.max(rect.width, 200), maxWidth)
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8))
    const desiredHeight = Math.min(options.length * 36 + 10, 320)
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 12)
    const spaceAbove = Math.max(0, rect.top - 12)
    const opensUp = spaceBelow < desiredHeight && (
      spaceAbove >= desiredHeight || spaceAbove > spaceBelow
    )
    const availableHeight = opensUp ? spaceAbove : spaceBelow
    const maxHeight = Math.min(320, availableHeight)
    const menuHeight = Math.min(desiredHeight, maxHeight)
    const top = opensUp ? Math.max(8, rect.top - menuHeight - 4) : rect.bottom + 4

    setPosition({
      top,
      left,
      width,
      maxHeight,
    })
  }, [options.length])

  const openMenu = useCallback((): void => {
    const selectedIndex = options.findIndex((option) => option.id === selectedId)
    setActiveIndex(Math.max(0, selectedIndex))
    updatePosition()
    setIsOpen(true)
  }, [options, selectedId, updatePosition])

  const closeMenu = useCallback((): void => {
    setIsOpen(false)
  }, [])

  const chooseOption = useCallback((option: WorkspacePickerOption): void => {
    closeMenu()
    onSelect(option.id)
  }, [closeMenu, onSelect])

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
      if (options.length === 0) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + direction + options.length) % options.length)
      return
    }

    if (event.key === 'Enter' && options[activeIndex]) {
      event.preventDefault()
      chooseOption(options[activeIndex])
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-9 w-fit max-w-full min-w-0 shrink-0 items-center gap-2 rounded-full border border-border-visible bg-bg-primary px-3 text-sm leading-5 text-text-primary outline-none transition-colors hover:bg-hover-bg focus:border-text-secondary disabled:opacity-50"
        aria-label={`${label}: ${selectedOption?.label ?? ''}`}
        title={selectedOption?.label}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        disabled={disabled || options.length === 0}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={(event) => {
          if (isOpen || !['Enter', ' ', 'ArrowDown'].includes(event.key)) return
          event.preventDefault()
          openMenu()
        }}
      >
        <FolderOpen size={13} className="shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="max-w-[13.5rem] truncate text-left">{selectedOption?.label ?? label}</span>
        <ChevronDown size={13} className="shrink-0 text-text-secondary" aria-hidden="true" />
      </button>

      {isOpen && position && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={options[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
          tabIndex={-1}
          className="fixed z-[60] overflow-y-auto rounded-xl py-1 shadow-xl outline-none"
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
          {options.map((option, index) => {
            const selected = option.id === selectedId
            const highlighted = index === activeIndex

            return (
              <div
                key={option.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={selected}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-hover-bg ${
                  highlighted ? 'bg-hover-bg' : ''
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseOption(option)}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selected && <Check size={14} className="shrink-0 text-text-display" aria-hidden="true" />}
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
