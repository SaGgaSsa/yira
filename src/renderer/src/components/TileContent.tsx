import React from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal, StickyNote, Globe, Clock, FileText } from 'lucide-react'
import type { FileTileOpenOptions, TileState, WorkspaceConfig } from '@shared/types'
import { TerminalTileWrapper } from './TerminalTile'
import { NoteTile } from './NoteTile'
import { BrowserTile } from './BrowserTile'
import { TimerTile } from './TimerTile'
import { FilesTile } from './FilesTile'
import { GitDiffTile } from './GitDiffTile'

export const TILE_META = {
  terminal: { label: 'Terminal', icon: Terminal },
  note: { label: 'Note', icon: StickyNote },
  browser: { label: 'Browser', icon: Globe },
  timer: { label: 'Timer', icon: Clock },
  files: { label: 'File', icon: FileText },
} as const

export function getTileTypeLabel(type: TileState['type'], translate: (key: string) => string): string {
  return type === 'files' ? translate('ui.tileTypeFile') : translate(`tile.${type}`)
}

interface TileContentProps {
  tile: TileState
  workspaceId: string
  workspaceConfig: WorkspaceConfig
  isFocused: boolean
  edgeToEdge?: boolean
  isVisible?: boolean
  autoFocus?: boolean
  onFocus: () => void
  onUpdate: (patch: Partial<TileState>) => void | Promise<void>
  /** Asks the user to close the tile, as the tile's close button does. */
  onDelete?: () => void
  onOpenBrowserTile?: (url: string) => void
  onOpenFileTile?: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
  workspaceRootPath?: string
}

export function TileContent({ tile, workspaceId, workspaceConfig, isFocused, edgeToEdge = false, isVisible = true, autoFocus = false, onFocus, onUpdate, onDelete, onOpenBrowserTile, onOpenFileTile, workspaceRootPath = '' }: TileContentProps): React.ReactElement {
  const { t } = useTranslation()
  if (tile.type === 'terminal') {
    return (
      <TerminalTileWrapper
        tile={tile}
        workspaceId={workspaceId}
        workspaceConfig={workspaceConfig}
        isFocused={isFocused}
        edgeToEdge={edgeToEdge}
        isVisible={isVisible}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onOpenBrowserTile={onOpenBrowserTile}
        onOpenFileTile={onOpenFileTile}
      />
    )
  }

  if (tile.type === 'note') {
    return <NoteTile tile={tile} autoFocus={autoFocus} onUpdate={onUpdate} workspaceRootPath={workspaceRootPath} />
  }

  if (tile.type === 'browser') {
    return <BrowserTile tile={tile} autoFocus={autoFocus} onUpdate={onUpdate} />
  }

  if (tile.type === 'timer') {
    return <TimerTile tile={tile} isFocused={isFocused} onUpdate={onUpdate} />
  }

  if (tile.type === 'files') {
    if (tile.fileDiff) return <GitDiffTile tile={tile} workspaceId={workspaceId} isVisible={isVisible} onOpenFile={onOpenFileTile} />
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

  return (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-text-secondary">
      <Icon size={24} className="mr-2" />
      <span className="nd-label">{t('ui.tileComingSoon', { tile: getTileTypeLabel(tile.type as TileState['type'], t) })}</span>
    </div>
  )
}
