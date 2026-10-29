import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { buildFontStack, MAX_FONT_FAMILY_LENGTH } from '@shared/userSettings'
import { loadInstalledFontFamilies } from '@/utils/localFonts'
import type { InstalledFontFamilies } from '@/utils/localFonts'
import {
  SelectMessage,
  SelectOption,
  SelectOptionList,
  SelectPopover,
  SelectSearchInput,
  useAnchoredPopover,
} from './SelectPopover'

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

export function FontFamilyPicker({
  value,
  bundledName,
  fallbackStack,
  monospaceOnly = false,
  ariaLabel,
  onChange,
}: FontFamilyPickerProps): React.ReactElement {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const optionRefs = useRef<Array<HTMLDivElement | null>>([])
  const fontsLoadedRef = useRef(false)
  const pendingSelectionRef = useRef(true)
  const [isOpen, setIsOpen] = useState(false)
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

  const closeMenu = useCallback(() => {
    setIsOpen(false)
    pendingSelectionRef.current = false
    triggerRef.current?.focus()
  }, [])

  const { triggerRef, popoverRef, position, measure } = useAnchoredPopover({
    isOpen,
    onDismiss: closeMenu,
    width: 288,
    matchTriggerWidth: true,
    maxHeight: 320,
  })

  const openMenu = useCallback(() => {
    setQuery('')
    setHighlightIndex(0)
    pendingSelectionRef.current = true
    measure()
    setIsOpen(true)
    loadFonts()
  }, [loadFonts, measure])

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
  }, [isOpen])

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

      {isOpen && position && (
        <SelectPopover
          ref={popoverRef}
          position={position}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={handleKeyDown}
        >
          <SelectSearchInput
            ref={inputRef}
            value={query}
            onChange={(event) => {
              pendingSelectionRef.current = false
              setQuery(event.target.value)
              setHighlightIndex(0)
            }}
            placeholder={t('settings.searchFonts')}
            aria-label={t('settings.searchFonts')}
            maxLength={MAX_FONT_FAMILY_LENGTH}
          />
          <SelectOptionList>
            {loading ? (
              <SelectMessage>
                <LoaderCircle size={13} className="animate-spin" /> {t('common.loading')}
              </SelectMessage>
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
                    <SelectMessage>{t('settings.noFontsFound')}</SelectMessage>
                  )}
                  <SelectOption
                    ref={(element) => { optionRefs.current[index] = element }}
                    highlighted={highlighted}
                    selected={selected}
                    style={{ fontFamily }}
                    onHover={() => {
                      pendingSelectionRef.current = false
                      setHighlightIndex(index)
                    }}
                    onSelect={() => handleSelect(item)}
                  >
                    {item.kind === 'custom'
                      ? <span className="text-text-secondary">{label}</span>
                      : label}
                  </SelectOption>
                </React.Fragment>
              )
            })}
          </SelectOptionList>
        </SelectPopover>
      )}
    </>
  )
}
