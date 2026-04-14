import React from 'react'
import { Terminal, StickyNote, Globe, LayoutGrid } from 'lucide-react'
import type { TileState } from '@shared/types'
import { TerminalTileWrapper } from './TerminalTile'
import { NoteTile } from './NoteTile'
import { KanbanTile } from './KanbanTile'
import { BrowserTile } from './BrowserTile'

export const TILE_META = {
  terminal: { label: 'Terminal', icon: Terminal },
  note: { label: 'Note', icon: StickyNote },
  browser: { label: 'Browser', icon: Globe },
  kanban: { label: 'Board', icon: LayoutGrid },
} as const

interface TileContentProps {
  tile: TileState
  isFocused: boolean
  onFocus: () => void
  onUpdate: (patch: Partial<TileState>) => void
}

export function TileContent({ tile, isFocused, onFocus, onUpdate }: TileContentProps): React.ReactElement {
  if (tile.type === 'terminal') {
    return (
      <TerminalTileWrapper
        tile={tile}
        isFocused={isFocused}
        onFocus={onFocus}
        onUpdate={onUpdate}
        onDelete={() => {}}
      />
    )
  }

  if (tile.type === 'note') {
    return <NoteTile tile={tile} onUpdate={onUpdate} />
  }

  if (tile.type === 'kanban') {
    return <KanbanTile tile={tile} />
  }

  if (tile.type === 'browser') {
    return <BrowserTile tile={tile} onUpdate={onUpdate} />
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
