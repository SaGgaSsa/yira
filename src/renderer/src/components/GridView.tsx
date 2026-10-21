import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { GripVertical } from 'lucide-react'
import type { GridLayoutNode, TileState, WorkspaceConfig } from '@shared/types'
import type { FileTileOpenOptions } from '@shared/types'
import { getTileTypeLabel, TileContent, TILE_META } from './TileContent'
import { TileActionButtons } from './TileActionButtons'
import { TerminalTileActivityIcon } from './TerminalActivityIcon'
import { TileCreationSelector, type TileCreationSelectorProps } from './TileCreationSelector'
import { GridLayoutSurface, type GridLayoutTileRenderState } from './GridLayoutSurface'
import { getTerminalDisplayTitle } from '@/utils/terminalDisplayTitle'
import { useCanvasStore } from '@/store/canvasStore'

interface GridViewProps {
  workspaceId: string
  workspaceConfig: WorkspaceConfig
  rootNode: GridLayoutNode | null
  tiles: TileState[]
  tileRefreshKeys: Record<string, number>
  focusedTileId: string | null
  /** Agent session names by tile id. */
  agentTitles?: Record<string, string>
  onFocusTile: (tileId: string) => void
  onUpdateTile: (tileId: string, patch: Partial<TileState>) => void
  onSetRootNode: (rootNode: GridLayoutNode | null) => void
  onConfigureTile: (tile: TileState, trigger: HTMLElement) => void
  onFocusTileInView: (tile: TileState) => void
  onDetachTile: (tile: TileState) => void
  onCloseTile: (tileId: string) => void | Promise<boolean>
  onOpenBrowserTile: (url: string) => void
  onOpenFileTile: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
  tileCreationSelectorProps: TileCreationSelectorProps
  workspaceRootPath: string
}

function getTileTitle(
  tile: TileState,
  terminalTitles: Record<string, string>,
  agentTitles: Record<string, string>,
  translate: (key: string) => string,
): string {
  if (tile.label?.trim()) return tile.label.trim()
  if (tile.type === 'terminal') return getTerminalDisplayTitle(tile, terminalTitles, agentTitles)
  return getTileTypeLabel(tile.type, translate)
}

export function GridView({
  workspaceId,
  workspaceConfig,
  rootNode,
  tiles,
  tileRefreshKeys,
  focusedTileId,
  agentTitles = {},
  onFocusTile,
  onUpdateTile,
  onSetRootNode,
  onConfigureTile,
  onFocusTileInView,
  onDetachTile,
  onCloseTile,
  onOpenBrowserTile,
  onOpenFileTile,
  tileCreationSelectorProps,
  workspaceRootPath,
}: GridViewProps): React.ReactElement {
  const { t } = useTranslation()
  const terminalTitles = useCanvasStore((s) => s.terminalTitles)
  const tilesById = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles])

  const renderTile = (tileId: string, state: GridLayoutTileRenderState): React.ReactNode | null => {
    const tile = tilesById.get(tileId)
    if (!tile) return null
    const Icon = TILE_META[tile.type].icon
    const title = getTileTitle(tile, terminalTitles, agentTitles, t)

    return (
      <section
        data-grid-tile-id={tile.id}
        className={`flex h-full min-h-[180px] w-full min-w-[260px] flex-col overflow-hidden border bg-bg-secondary ${
          state.isDragged ? 'border-cyan-400' : 'border-border'
        }`}
        onMouseDown={() => onFocusTile(tile.id)}
      >
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg-tertiary px-3">
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-sm border border-border-visible text-text-secondary active:cursor-grabbing"
            title={t('ui.moveTile')}
            onPointerDown={state.startMove}
          >
            <GripVertical size={14} />
          </button>
          {tile.type === 'terminal' ? <TerminalTileActivityIcon tileId={tile.id} size={15} /> : <Icon size={15} className="shrink-0 text-text-secondary" />}
          <div className="min-w-0 flex-1 truncate text-sm text-text-display">{title}</div>
          <TileActionButtons
            onConfigure={(event) => onConfigureTile(tile, event.currentTarget)}
            onFocus={() => onFocusTileInView(tile)}
            onDetach={() => onDetachTile(tile)}
            onClose={() => {
              void onCloseTile(tile.id)
            }}
          />
        </div>
        <div className={`min-h-0 flex-1 ${state.isDragged ? 'opacity-40 blur-[1px]' : ''}`}>
          <TileContent
            key={`${tile.id}:${tileRefreshKeys[tile.id] ?? 0}`}
            tile={tile}
            workspaceId={workspaceId}
            workspaceConfig={workspaceConfig}
            isFocused={focusedTileId === tile.id}
            edgeToEdge
            onFocus={() => onFocusTile(tile.id)}
            onUpdate={(patch) => onUpdateTile(tile.id, patch)}
            onDelete={() => onCloseTile(tile.id)}
            onOpenBrowserTile={onOpenBrowserTile}
            onOpenFileTile={onOpenFileTile}
            workspaceRootPath={workspaceRootPath}
          />
        </div>
      </section>
    )
  }

  const renderDragGhost = (tileId: string): React.ReactNode | null => {
    const tile = tilesById.get(tileId)
    if (!tile) return null
    const Icon = TILE_META[tile.type].icon

    return (
      <>
        <Icon size={16} className="shrink-0 text-cyan-300" />
        <div className="min-w-0">
          <div className="truncate text-sm text-text-display">{getTileTitle(tile, terminalTitles, agentTitles, t)}</div>
          <div className="mt-1 text-xs text-text-secondary">{getTileTypeLabel(tile.type, t)}</div>
        </div>
      </>
    )
  }

  if (tiles.length === 0) {
    return (
      <div className="relative flex h-full w-full overflow-hidden bg-bg-primary p-2">
        <div className="flex h-full w-full items-center justify-center px-4">
          <div className="nd-panel-raised w-full max-w-xl rounded-[20px] px-5 py-8 text-center text-text-secondary">
            <div className="nd-label">{t('ui.empty')}</div>
            <div className="mt-3 text-sm text-text-disabled">{t('ui.createWorkspaceContent')}</div>
            <TileCreationSelector {...tileCreationSelectorProps} className="mt-5 text-left" />
          </div>
        </div>
      </div>
    )
  }

  if (!rootNode) {
    return (
      <div className="relative flex h-full w-full overflow-hidden bg-bg-primary p-2">
        <div className="flex h-full items-center justify-center text-text-secondary">
          <span className="nd-label">{t('ui.emptyGrid')}</span>
        </div>
      </div>
    )
  }

  return (
    <GridLayoutSurface
      rootNode={rootNode}
      onSetRootNode={onSetRootNode}
      onFocusTile={onFocusTile}
      renderTile={renderTile}
      renderDragGhost={renderDragGhost}
    />
  )
}
