import React from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal, StickyNote, Globe, FileText } from 'lucide-react'
import type { FileTileOpenOptions, TileState, WorkspaceConfig } from '@shared/types'
import { TerminalTileWrapper } from './TerminalTile'
import { BrowserTile } from './BrowserTile'

const NoteTile = React.lazy(() => import('./NoteTile').then((module) => ({ default: module.NoteTile })))
const FilesTile = React.lazy(() => import('./FilesTile').then((module) => ({ default: module.FilesTile })))
const GitDiffTile = React.lazy(() => import('./GitDiffTile').then((module) => ({ default: module.GitDiffTile })))

const TILE_LOADING_FALLBACK = <div className="h-full w-full bg-bg-secondary" />

export const TILE_META = {
  terminal: { label: 'Terminal', icon: Terminal },
  note: { label: 'Note', icon: StickyNote },
  browser: { label: 'Browser', icon: Globe },
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
  /** Limits terminal tiles to the reading column width. Other tile types ignore it. */
  readingColumn?: boolean
  isVisible?: boolean
  autoFocus?: boolean
  onFocus: () => void
  onUpdate: (patch: Partial<TileState>) => void | Promise<void>
  /** Asks the user to close the tile, as the tile's close button does; resolves whether it closed. */
  onDelete?: () => void | Promise<boolean>
  onOpenBrowserTile?: (url: string) => void
  onOpenFileTile?: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
  workspaceRootPath?: string
}

export function TileContent({ tile, workspaceId, workspaceConfig, isFocused, edgeToEdge = false, readingColumn = false, isVisible = true, autoFocus = false, onFocus, onUpdate, onDelete, onOpenBrowserTile, onOpenFileTile, workspaceRootPath = '' }: TileContentProps): React.ReactElement {
  const { t } = useTranslation()
  if (tile.type === 'terminal') {
    return (
      <TerminalTileWrapper
        tile={tile}
        workspaceId={workspaceId}
        workspaceConfig={workspaceConfig}
        isFocused={isFocused}
        edgeToEdge={edgeToEdge}
        readingColumn={readingColumn}
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
    return (
      <React.Suspense fallback={TILE_LOADING_FALLBACK}>
        <NoteTile tile={tile} autoFocus={autoFocus} onUpdate={onUpdate} workspaceRootPath={workspaceRootPath} />
      </React.Suspense>
    )
  }

  if (tile.type === 'browser') {
    return <BrowserTile tile={tile} autoFocus={autoFocus} onUpdate={onUpdate} />
  }

  if (tile.type === 'files') {
    if (tile.fileDiff) {
      return (
        <React.Suspense fallback={TILE_LOADING_FALLBACK}>
          <GitDiffTile tile={tile} workspaceId={workspaceId} isVisible={isVisible} onOpenFile={onOpenFileTile} />
        </React.Suspense>
      )
    }
    return (
      <React.Suspense fallback={TILE_LOADING_FALLBACK}>
        <FilesTile
          tile={tile}
          rootPath={workspaceRootPath}
          isFocused={isFocused}
          isVisible={isVisible}
          onUpdate={onUpdate}
          onOpenFile={onOpenFileTile}
          onOpenBrowser={onOpenBrowserTile}
        />
      </React.Suspense>
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
