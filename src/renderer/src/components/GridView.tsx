import React, { useCallback, useMemo, useRef } from 'react'
import { GripVertical, X } from 'lucide-react'
import type { GridLayoutNode, GridLayoutSplitNode, TileState } from '@shared/types'
import { resizeGridChild, swapGridTiles } from '@shared/gridWorkspaceState'
import { TileContent, TILE_META } from './TileContent'
import { TileActionButtons } from './TileActionButtons'
import { getTerminalDisplayTitle } from '@/utils/terminalDisplayTitle'

interface GridViewProps {
  rootNode: GridLayoutNode | null
  tiles: TileState[]
  focusedTileId: string | null
  terminalTitles: Record<string, string>
  onFocusTile: (tileId: string) => void
  onUpdateTile: (tileId: string, patch: Partial<TileState>) => void
  onSetRootNode: (rootNode: GridLayoutNode | null) => void
  onConfigureTile: (tile: TileState, trigger: HTMLElement) => void
  onFocusTileInView: (tile: TileState) => void
  onCloseTile: (tileId: string) => void
}

interface ResizeDragState {
  splitNode: GridLayoutSplitNode
  childIndex: number
  startX: number
  startY: number
  startSize: number
}

function getTileTitle(tile: TileState, terminalTitles: Record<string, string>): string {
  if (tile.label?.trim()) return tile.label.trim()
  if (tile.type === 'terminal') return getTerminalDisplayTitle(tile, terminalTitles)
  return TILE_META[tile.type].label
}

export function GridView({
  rootNode,
  tiles,
  focusedTileId,
  terminalTitles,
  onFocusTile,
  onUpdateTile,
  onSetRootNode,
  onConfigureTile,
  onFocusTileInView,
  onCloseTile,
}: GridViewProps): React.ReactElement {
  const resizeDragRef = useRef<ResizeDragState | null>(null)
  const tilesById = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles])

  const startResize = useCallback((event: React.PointerEvent, splitNode: GridLayoutSplitNode, childIndex: number) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeDragRef.current = {
      splitNode,
      childIndex,
      startX: event.clientX,
      startY: event.clientY,
      startSize: splitNode.sizes[childIndex] ?? 10,
    }
  }, [])

  const updateResize = useCallback((event: React.PointerEvent) => {
    const drag = resizeDragRef.current
    if (!drag) return

    const delta = drag.splitNode.direction === 'row'
      ? event.clientX - drag.startX
      : event.clientY - drag.startY
    const nextSize = Math.max(1, drag.startSize + delta / 24)
    onSetRootNode(resizeGridChild(rootNode, drag.splitNode.id, drag.childIndex, nextSize))
  }, [onSetRootNode, rootNode])

  const stopResize = useCallback((event: React.PointerEvent) => {
    if (!resizeDragRef.current) return
    resizeDragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  const renderNode = (node: GridLayoutNode): React.ReactElement | null => {
    if (node.type === 'leaf') {
      const tile = tilesById.get(node.tileId)
      if (!tile) return null
      const Icon = TILE_META[tile.type].icon
      const title = getTileTitle(tile, terminalTitles)

      return (
        <section
          key={node.id}
          className="flex min-h-[180px] min-w-[260px] flex-col overflow-hidden border border-border bg-bg-secondary"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-yira-grid-tile', tile.id)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            const sourceTileId = event.dataTransfer.getData('application/x-yira-grid-tile')
            if (!sourceTileId || sourceTileId === tile.id) return
            onSetRootNode(swapGridTiles(rootNode, sourceTileId, tile.id))
          }}
          onMouseDown={() => onFocusTile(tile.id)}
        >
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg-tertiary px-3">
            <Icon size={15} className="shrink-0 text-text-secondary" />
            <div className="min-w-0 flex-1 truncate text-sm text-text-display">{title}</div>
            <TileActionButtons
              onConfigure={(event) => onConfigureTile(tile, event.currentTarget)}
              onFocus={() => onFocusTileInView(tile)}
              onClose={() => onCloseTile(tile.id)}
            />
            <button
              className="hidden h-8 w-8 items-center justify-center rounded-full border border-border-visible text-text-secondary"
              title="Close"
              onClick={() => onCloseTile(tile.id)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <TileContent
              tile={tile}
              isFocused={focusedTileId === tile.id}
              edgeToEdge
              onFocus={() => onFocusTile(tile.id)}
              onUpdate={(patch) => onUpdateTile(tile.id, patch)}
            />
          </div>
        </section>
      )
    }

    return (
      <div
        key={node.id}
        className="flex min-h-0 min-w-0 flex-1 gap-1"
        style={{ flexDirection: node.direction }}
      >
        {node.children.map((child, index) => (
          <React.Fragment key={child.id}>
            <div className="min-h-0 min-w-0" style={{ flex: `${node.sizes[index] ?? 10} 1 0` }}>
              {renderNode(child)}
            </div>
            {index < node.children.length - 1 && (
              <div
                className={`flex shrink-0 items-center justify-center bg-border text-text-secondary ${
                  node.direction === 'row' ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'
                }`}
                onPointerDown={(event) => startResize(event, node, index)}
                onPointerMove={updateResize}
                onPointerUp={stopResize}
                title="Resize split"
              >
                <GripVertical size={12} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-hidden bg-bg-primary p-2">
      {rootNode ? (
        renderNode(rootNode)
      ) : (
        <div className="flex h-full items-center justify-center text-text-secondary">
          <span className="nd-label">[ EMPTY GRID ]</span>
        </div>
      )}
    </div>
  )
}
