import React, { useEffect, useRef, useState } from 'react'
import { Plus, Terminal, Bot, StickyNote, Globe } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface TileLauncherProps {
  canCreateTerminal: boolean
  canCreateAgent: boolean
  canCreateNote: boolean
  canCreateBrowser: boolean
  onCreateTerminal: () => void
  onCreateAgent: () => void
  onCreateNote: () => void
  onCreateBrowser: () => void
}

interface LauncherAction {
  id: string
  icon: LucideIcon
  label: string
  onClick: () => void
}

// Compact "+" next to the view switcher that expands inline into the quick tile actions.
export function TileLauncher({
  canCreateTerminal,
  canCreateAgent,
  canCreateNote,
  canCreateBrowser,
  onCreateTerminal,
  onCreateAgent,
  onCreateNote,
  onCreateBrowser,
}: TileLauncherProps): React.ReactElement {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const actions: LauncherAction[] = [
    ...(canCreateTerminal ? [{ id: 'terminal', icon: Terminal, label: t('tile.newTerminal'), onClick: onCreateTerminal }] : []),
    ...(canCreateAgent ? [{ id: 'agent', icon: Bot, label: t('tile.newAgent'), onClick: onCreateAgent }] : []),
    ...(canCreateNote ? [{ id: 'note', icon: StickyNote, label: t('tile.newNote'), onClick: onCreateNote }] : []),
    ...(canCreateBrowser ? [{ id: 'browser', icon: Globe, label: t('tile.newBrowser'), onClick: onCreateBrowser }] : []),
  ]

  return (
    <div
      ref={rootRef}
      className="flex items-center rounded-md border border-border-visible bg-bg-secondary px-0.5"
    >
      <button
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
          open
            ? 'text-text-display'
            : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary'
        }`}
        onClick={() => setOpen((value) => !value)}
        title={t('tile.newTile')}
        aria-label={t('tile.newTile')}
        aria-expanded={open}
      >
        <Plus size={14} className={`transition-transform duration-150 ${open ? 'rotate-45' : ''}`} />
      </button>
      <div
        className={`flex items-center gap-1 overflow-hidden transition-[max-width,opacity] duration-150 ease-out ${
          open ? 'max-w-40 opacity-100' : 'max-w-0 opacity-0'
        }`}
        aria-hidden={!open}
      >
        {actions.map(({ id, icon: Icon, label, onClick }) => (
          <button
            key={id}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
            onClick={() => {
              setOpen(false)
              onClick()
            }}
            title={label}
            aria-label={label}
            tabIndex={open ? 0 : -1}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </div>
  )
}
