import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CaseSensitive, ChevronDown, ChevronUp, Regex, WholeWord, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TerminalRuntime, TerminalSearchOptions, TerminalSearchResults } from '@/utils/terminalRuntime'

interface Props {
  runtime: Pick<
    TerminalRuntime,
    'findNext' | 'findPrevious' | 'clearSearch' | 'subscribeSearchResults' | 'getSelection' | 'focus'
  >
  /** Increments each time the search shortcut fires, including while the bar is already open. */
  openRequest: number
  onClose: () => void
}

type SearchFlags = Pick<TerminalSearchOptions, 'caseSensitive' | 'wholeWord' | 'regex'>

const INITIAL_FLAGS: SearchFlags = { caseSensitive: false, wholeWord: false, regex: false }

/** A one-line selection worth searching for, or null when there is none. */
export function getSearchSeedFromSelection(selection: string): string | null {
  const seed = selection.trim()
  if (!seed || /[\r\n]/.test(seed)) return null
  return seed
}

function formatCounter(results: TerminalSearchResults | null, noMatch: boolean, noResultsLabel: string): string {
  if (noMatch) return noResultsLabel
  if (!results || results.resultCount === 0) return ''
  // The addon reports -1 when it stops highlighting past its match limit.
  return results.resultIndex < 0
    ? String(results.resultCount)
    : `${results.resultIndex + 1}/${results.resultCount}`
}

export function TerminalSearchBar({ runtime, openRequest, onClose }: Props): React.ReactElement {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [term, setTerm] = useState('')
  const [flags, setFlags] = useState<SearchFlags>(INITIAL_FLAGS)
  const [results, setResults] = useState<TerminalSearchResults | null>(null)
  const [noMatch, setNoMatch] = useState(false)
  const flagsRef = useRef(flags)
  flagsRef.current = flags
  // The addon selects the active match, so re-opening must not take that
  // selection as a new term (a regex would be replaced by its own match).
  const matchSelectionRef = useRef('')

  const search = useCallback((
    direction: 'next' | 'previous',
    nextTerm: string,
    nextFlags: SearchFlags,
    incremental: boolean,
  ): void => {
    if (!nextTerm) {
      runtime.clearSearch()
      setResults(null)
      setNoMatch(false)
      return
    }
    const found = direction === 'next'
      ? runtime.findNext(nextTerm, { ...nextFlags, incremental })
      : runtime.findPrevious(nextTerm, nextFlags)
    setNoMatch(!found)
    if (!found) setResults(null)
    matchSelectionRef.current = found ? runtime.getSelection() : ''
  }, [runtime])

  useEffect(() => runtime.subscribeSearchResults(setResults), [runtime])

  // Leaving the bar (including the tile unmounting) removes the highlights.
  useEffect(() => () => runtime.clearSearch(), [runtime])

  // Each open request focuses the input, seeded from a one-line terminal selection.
  useLayoutEffect(() => {
    const selection = runtime.getSelection()
    const seed = selection === matchSelectionRef.current ? null : getSearchSeedFromSelection(selection)
    if (seed) {
      setTerm(seed)
      search('next', seed, flagsRef.current, false)
    }
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [openRequest, runtime, search])

  const close = (): void => {
    runtime.clearSearch()
    onClose()
    runtime.focus()
  }

  const toggleFlag = (flag: keyof SearchFlags): void => {
    const nextFlags = { ...flags, [flag]: !flags[flag] }
    setFlags(nextFlags)
    search('next', term, nextFlags, false)
  }

  const flagButtons = [
    { flag: 'caseSensitive' as const, label: t('terminal.searchCaseSensitive'), Icon: CaseSensitive },
    { flag: 'wholeWord' as const, label: t('terminal.searchWholeWord'), Icon: WholeWord },
    { flag: 'regex' as const, label: t('terminal.searchRegex'), Icon: Regex },
  ]
  const iconButtonClass = 'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display'
  const counter = formatCounter(results, noMatch, t('terminal.searchNoResults'))

  return (
    <div
      role="search"
      data-agent-shortcut-capture="terminal-search"
      className="absolute right-3 top-2 z-20 flex items-center gap-1 rounded-md border border-border-visible bg-bg-tertiary/95 p-1 shadow-lg"
      // Keep keys and clicks inside the bar away from the terminal, tile focus and global shortcuts.
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={term}
        placeholder={t('terminal.searchPlaceholder')}
        aria-label={t('terminal.searchPlaceholder')}
        spellCheck={false}
        className="h-6 w-44 min-w-0 rounded-sm border border-border-visible bg-bg-primary px-2 font-mono text-xs text-text-primary outline-hidden focus:border-accent"
        onChange={(event) => {
          setTerm(event.target.value)
          search('next', event.target.value, flags, true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            search(event.shiftKey ? 'previous' : 'next', term, flags, false)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
        }}
      />
      <span
        aria-live="polite"
        className={`min-w-12 px-1 text-center font-mono text-xs ${noMatch ? 'text-text-secondary' : 'text-text-primary'}`}
      >
        {counter}
      </span>
      {flagButtons.map(({ flag, label, Icon }) => (
        <button
          key={flag}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={flags[flag]}
          className={`${iconButtonClass} ${flags[flag] ? 'bg-accent-subtle text-accent hover:bg-accent-subtle hover:text-accent' : ''}`}
          onClick={() => toggleFlag(flag)}
        >
          <Icon size={14} />
        </button>
      ))}
      <button
        type="button"
        title={t('terminal.searchPrevious')}
        aria-label={t('terminal.searchPrevious')}
        className={iconButtonClass}
        onClick={() => search('previous', term, flags, false)}
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        title={t('terminal.searchNext')}
        aria-label={t('terminal.searchNext')}
        className={iconButtonClass}
        onClick={() => search('next', term, flags, false)}
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        title={t('terminal.searchClose')}
        aria-label={t('terminal.searchClose')}
        className={iconButtonClass}
        onClick={close}
      >
        <X size={14} />
      </button>
    </div>
  )
}
