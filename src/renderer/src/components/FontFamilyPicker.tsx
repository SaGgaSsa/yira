import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { buildFontStack, MAX_FONT_FAMILY_LENGTH } from '@shared/userSettings'
import { loadInstalledFontFamilies } from '@/utils/localFonts'
import type { InstalledFontFamilies } from '@/utils/localFonts'

interface FontFamilyPickerPosition {
  top: number
  left: number
  width: number
  maxHeight: number
}

interface FontFamilyPickerProps {
  value: string
  bundledName: string
  fallbackStack: string
  monospaceOnly?: boolean
  ariaLabel: string
  onChange: (family: string) => void
}

type PickerItem =
  | { kind: 'bundled'; value: string }
  | { kind: 'family'; value: string }
  | { kind: 'custom'; value: string }

function isWithin(target: Node | null, ancestor: Node | null): boolean {
  let current = target
  while (current) {
    if (current === ancestor) return true
    current = current.parentNode
  }
  return false
}

export function FontFamilyPicker({
  value,
  bundledName,
  fallbackStack,
  monospaceOnly = false,
  ariaLabel,
  onChange,
}: FontFamilyPickerProps): React.ReactElement {
  const { t } = useTranslation()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const optionRefs = useRef<Array<HTMLDivElement | null>>([])
  const fontsLoadedRef = useRef(false)
  const pendingSelectionRef = useRef(true)
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<FontFamilyPickerPosition | null>(null)
  const [fonts, setFonts] = useState<InstalledFontFamilies | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const listboxId = `font-picker-${useId()}`

  const loadFonts = useCallback(() => {
    if (fontsLoadedRef.current) return
    setLoading(true)
    void loadInstalledFontFamilies()
      .then((result) => {
        setFonts(result)
        if (result.all.length > 0) fontsLoadedRef.current = true
      })
      .finally(() => setLoading(false))
  }, [])

  const getPickerPosition = useCallback((): FontFamilyPickerPosition | null => {
    const trigger = triggerRef.current
    if (!trigger) return null
    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth || rect.right
    const viewportHeight = window.innerHeight || rect.bottom + 320
    const width = Math.max(rect.width, 288)
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8))
    const maxHeight = Math.min(320, Math.max(120, viewportHeight - rect.bottom - 12))
    return { top: rect.bottom + 4, left, width, maxHeight }
  }, [])

  const openMenu = useCallback(() => {
    setQuery('')
    setHighlightIndex(0)
    pendingSelectionRef.current = true
    setPosition(getPickerPosition())
    setIsOpen(true)
    loadFonts()
  }, [getPickerPosition, loadFonts])

  const closeMenu = useCallback(() => {
    setIsOpen(false)
    pendingSelectionRef.current = false
    triggerRef.current?.focus()
  }, [])

  const families = useMemo(() => {
    if (!fonts) return []
    return monospaceOnly ? fonts.monospace : fonts.all
  }, [fonts, monospaceOnly])

  const normalizedQuery = query.trim().toLowerCase()

  const matchingFamilies = useMemo(
    () => families.filter((family) => family.toLowerCase().includes(normalizedQuery)),
    [families, normalizedQuery],
  )

  const items = useMemo((): PickerItem[] => {
    const next: PickerItem[] = []
    if (!normalizedQuery || bundledName.toLowerCase().includes(normalizedQuery)) {
      next.push({ kind: 'bundled', value: '' })
    }
    for (const family of matchingFamilies) next.push({ kind: 'family', value: family })
    if (normalizedQuery && !matchingFamilies.some((family) => family.toLowerCase() === normalizedQuery)) {
      next.push({ kind: 'custom', value: query.trim() })
    }
    return next
  }, [bundledName, matchingFamilies, normalizedQuery, query])

  const showNoFonts = !loading && normalizedQuery !== '' && matchingFamilies.length === 0

  const handleSelect = useCallback((item: PickerItem) => {
    onChange(item.value)
    closeMenu()
  }, [closeMenu, onChange])

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

  useEffect(() => {
    if (!isOpen || loading || !pendingSelectionRef.current) return
    const selectedIndex = items.findIndex((item) => item.value === value)
    setHighlightIndex(selectedIndex >= 0 ? selectedIndex : 0)
    pendingSelectionRef.current = false
  }, [isOpen, items, loading, value])

  useEffect(() => {
    if (!isOpen) return
    optionRefs.current[highlightIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex, isOpen])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      pendingSelectionRef.current = false
      if (items.length === 0) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setHighlightIndex((current) => (current + direction + items.length) % items.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const highlighted = items[highlightIndex]
      if (highlighted) handleSelect(highlighted)
    }
  }

  const displayValue = value || t('settings.bundledFont', { name: bundledName })

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="flex w-72 max-w-full items-center justify-between gap-2 rounded-full border border-border-visible bg-bg-primary px-4 py-2 text-sm text-text-display hover:border-text-secondary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--interactive)"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={ariaLabel}
        title={displayValue}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
      >
        <span
          className="min-w-0 flex-1 truncate text-left"
          style={{ fontFamily: buildFontStack(value, fallbackStack) }}
        >
          {displayValue}
        </span>
        <ChevronDown size={14} className="shrink-0 text-text-secondary" />
      </button>

      {isOpen && position && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="fixed z-10010 flex flex-col overflow-hidden rounded-[14px] border border-border bg-bg-primary shadow-xl"
          style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
          onKeyDown={handleKeyDown}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              pendingSelectionRef.current = false
              setQuery(event.target.value)
              setHighlightIndex(0)
            }}
            placeholder={t('settings.searchFonts')}
            aria-label={t('settings.searchFonts')}
            spellCheck={false}
            autoComplete="off"
            maxLength={MAX_FONT_FAMILY_LENGTH}
            className="w-full shrink-0 border-b border-border bg-transparent px-3 py-2 text-sm text-text-display outline-hidden placeholder:text-text-disabled"
          />
          <div className="min-h-0 overflow-y-auto">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-text-disabled">
                <LoaderCircle size={13} className="animate-spin" /> {t('common.loading')}
              </div>
            ) : items.map((item, index) => {
              const highlighted = index === highlightIndex
              const selected = item.value === value
              const fontFamily = item.kind === 'custom' ? undefined : buildFontStack(item.value, fallbackStack)
              let label = item.value
              if (item.kind === 'bundled') label = t('settings.bundledFont', { name: bundledName })
              if (item.kind === 'custom') label = t('settings.useCustomFont', { name: item.value })
              return (
                <React.Fragment key={`${item.kind}-${item.value}`}>
                  {showNoFonts && item.kind === 'custom' && (
                    <div className="px-3 py-2 text-xs text-text-secondary">{t('settings.noFontsFound')}</div>
                  )}
                  <div
                    ref={(element) => { optionRefs.current[index] = element }}
                    role="option"
                    aria-selected={selected}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-text-display hover:bg-hover-bg ${highlighted ? 'bg-hover-bg' : ''}`}
                    style={{ fontFamily }}
                    onMouseEnter={() => {
                      pendingSelectionRef.current = false
                      setHighlightIndex(index)
                    }}
                    onClick={() => handleSelect(item)}
                  >
                    <span className={`min-w-0 flex-1 truncate ${item.kind === 'custom' ? 'text-text-secondary' : ''}`}>
                      {label}
                    </span>
                    {selected && <Check size={13} className="shrink-0 text-text-display" />}
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
