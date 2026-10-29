import React, { useCallback, useId, useLayoutEffect, useState } from 'react'
import { ChevronDown, FolderOpen } from 'lucide-react'
import { SelectOption, SelectOptionList, SelectPopover, useAnchoredPopover } from './SelectPopover'

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

export function WorkspacePickerMenu({
  options,
  selectedId,
  label,
  disabled = false,
  onSelect,
}: WorkspacePickerMenuProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const listboxId = `workspace-picker-${useId()}`
  const selectedOption = options.find((option) => option.id === selectedId)

  const closeMenu = useCallback((): void => {
    setIsOpen(false)
  }, [])

  const { triggerRef, popoverRef, position, measure } = useAnchoredPopover({
    isOpen,
    onDismiss: closeMenu,
    width: 288,
    matchTriggerWidth: true,
    maxHeight: 320,
  })

  const openMenu = useCallback((): void => {
    const selectedIndex = options.findIndex((option) => option.id === selectedId)
    setActiveIndex(Math.max(0, selectedIndex))
    measure()
    setIsOpen(true)
  }, [measure, options, selectedId])

  const chooseOption = useCallback((option: WorkspacePickerOption): void => {
    closeMenu()
    onSelect(option.id)
  }, [closeMenu, onSelect])

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
        className="inline-flex h-9 w-fit max-w-full min-w-0 shrink-0 items-center gap-2 rounded-full border border-border-visible bg-bg-primary px-3 text-sm leading-5 text-text-primary outline-hidden transition-colors hover:bg-hover-bg focus:border-text-secondary disabled:opacity-50"
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
        <span className="max-w-54 truncate text-left">{selectedOption?.label ?? label}</span>
        <ChevronDown size={13} className="shrink-0 text-text-secondary" aria-hidden="true" />
      </button>

      {isOpen && position && (
        <SelectPopover
          ref={popoverRef}
          position={position}
          id={listboxId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={options[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
        >
          <SelectOptionList>
            {options.map((option, index) => (
              <SelectOption
                key={option.id}
                id={`${listboxId}-option-${index}`}
                highlighted={index === activeIndex}
                selected={option.id === selectedId}
                onHover={() => setActiveIndex(index)}
                onSelect={() => chooseOption(option)}
              >
                {option.label}
              </SelectOption>
            ))}
          </SelectOptionList>
        </SelectPopover>
      )}
    </>
  )
}
