import React from 'react'
import { Terminal, StickyNote, Globe, Clock } from 'lucide-react'
import type { TileState } from '@shared/types'
import { TerminalTileWrapper } from './TerminalTile'
import { NoteTile } from './NoteTile'
import { BrowserTile } from './BrowserTile'
import { TimerTile } from './TimerTile'

export const TILE_META = {
  terminal: { label: 'Terminal', icon: Terminal },
  note: { label: 'Note', icon: StickyNote },
  browser: { label: 'Browser', icon: Globe },
  timer: { label: 'Timer', icon: Clock },
} as const

interface TileContentProps {
  tile: TileState
  isFocused: boolean
  edgeToEdge?: boolean
  isVisible?: boolean
  autoFocus?: boolean
  onFocus: () => void
  onUpdate: (patch: Partial<TileState>) => void
  onOpenBrowserTile?: (url: string) => void
}

export function TileContent({ tile, isFocused, edgeToEdge = false, isVisible = true, autoFocus = false, onFocus, onUpdate, onOpenBrowserTile }: TileContentProps): React.ReactElement {
  if (tile.type === 'terminal') {
    return (
      <TerminalTileWrapper
        tile={tile}
        isFocused={isFocused}
        edgeToEdge={edgeToEdge}
        isVisible={isVisible}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onUpdate={onUpdate}
        onDelete={() => {}}
        onOpenBrowserTile={onOpenBrowserTile}
      />
    )
  }

  if (tile.type === 'note') {
    return <NoteTile tile={tile} autoFocus={autoFocus} onUpdate={onUpdate} />
  }

  if (tile.type === 'browser') {
    return <BrowserTile tile={tile} autoFocus={autoFocus} onUpdate={onUpdate} />
  }

  if (tile.type === 'timer') {
    return <TimerTile tile={tile} isFocused={isFocused} onUpdate={onUpdate} />
  }

  const meta = TILE_META[tile.type as keyof typeof TILE_META]
  const Icon = meta.icon
  const label = meta.label

  return (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-text-secondary">
      <Icon size={24} className="mr-2" />
      <span className="nd-label">{label} coming soon</span>
    </div>
  )
}
