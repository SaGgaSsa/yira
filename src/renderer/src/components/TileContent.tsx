import React from 'react'
import { Terminal, StickyNote, Globe, Clock, FileText } from 'lucide-react'
import type { FileTileOpenOptions, TileState } from '@shared/types'
import { TerminalTileWrapper } from './TerminalTile'
import { NoteTile } from './NoteTile'
import { BrowserTile } from './BrowserTile'
import { TimerTile } from './TimerTile'
import { FilesTile } from './FilesTile'

export const TILE_META = {
  terminal: { label: 'Terminal', icon: Terminal },
  note: { label: 'Note', icon: StickyNote },
  browser: { label: 'Browser', icon: Globe },
  timer: { label: 'Timer', icon: Clock },
  files: { label: 'File', icon: FileText },
} as const

interface TileContentProps {
  tile: TileState
  isFocused: boolean
  edgeToEdge?: boolean
  isVisible?: boolean
  autoFocus?: boolean
  onFocus: () => void
  onUpdate: (patch: Partial<TileState>) => void | Promise<void>
  onOpenBrowserTile?: (url: string) => void
  onOpenFileTile?: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
  workspaceRootPath?: string
}

export function TileContent({ tile, isFocused, edgeToEdge = false, isVisible = true, autoFocus = false, onFocus, onUpdate, onOpenBrowserTile, onOpenFileTile, workspaceRootPath = '' }: TileContentProps): React.ReactElement {
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
        onOpenFileTile={onOpenFileTile}
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

  if (tile.type === 'files') {
    return (
      <FilesTile
        tile={tile}
        rootPath={workspaceRootPath}
        isFocused={isFocused}
        isVisible={isVisible}
        onUpdate={onUpdate}
        onOpenFile={onOpenFileTile}
        onOpenBrowser={onOpenBrowserTile}
      />
    )
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
