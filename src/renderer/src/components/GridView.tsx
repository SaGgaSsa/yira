import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import type { GridLayoutNode, GridLayoutSplitNode, TileState } from '@shared/types'
import {
  commitGridDragAction,
  computeGridDragAction,
  resizeGridChild,
  type PendingGridDragAction,
} from '@shared/gridWorkspaceState'
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
  onDetachTile: (tile: TileState) => void
  onCloseTile: (tileId: string) => void
}

interface ResizeDragState {
  splitNode: GridLayoutSplitNode
  childIndex: number
  startX: number
  startY: number
  startSize: number
}

interface MoveDragState {
  sourceTileId: string
  pointerX: number
  pointerY: number
  pendingAction: PendingGridDragAction
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
  onDetachTile,
  onCloseTile,
}: GridViewProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const resizeDragRef = useRef<ResizeDragState | null>(null)
  const rootNodeRef = useRef<GridLayoutNode | null>(rootNode)
  const moveDragRef = useRef<MoveDragState | null>(null)
  const [moveDrag, setMoveDrag] = useState<MoveDragState | null>(null)
  const tilesById = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles])
  const draggedTileId = moveDrag?.sourceTileId ?? null
  const displayRootNode = useMemo(() => {
    if (!moveDrag || moveDrag.pendingAction.type === 'none') return rootNode
    return commitGridDragAction(rootNode, moveDrag.pendingAction)
  }, [moveDrag, rootNode])

  useEffect(() => {
    rootNodeRef.current = rootNode
  }, [rootNode])

  const startResize = useCallback((event: React.PointerEvent, splitNode: GridLayoutSplitNode, childIndex: number) => {
    if (moveDragRef.current) return
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
    if (!drag || moveDragRef.current) return

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

  const updateMoveDrag = useCallback((event: PointerEvent) => {
    const drag = moveDragRef.current
    const currentRootNode = rootNodeRef.current
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (!drag || !currentRootNode || !containerRect) return

    const isOutside = event.clientX <= containerRect.left
      || event.clientX >= containerRect.right
      || event.clientY <= containerRect.top
      || event.clientY >= containerRect.bottom
    let pendingAction: PendingGridDragAction = { type: 'none' }

    if (!isOutside) {
      const target = document.elementFromPoint(event.clientX, event.clientY)
      const targetElement = target instanceof Element
        ? target.closest<HTMLElement>('[data-grid-tile-id]')
        : null
      const targetTileId = targetElement?.dataset.gridTileId

      if (targetTileId === drag.sourceTileId && drag.pendingAction.type !== 'none') {
        pendingAction = drag.pendingAction
      } else if (targetTileId && targetTileId !== drag.sourceTileId) {
        const targetRect = targetElement.getBoundingClientRect()
        pendingAction = computeGridDragAction(
          currentRootNode,
          drag.sourceTileId,
          targetTileId,
          targetRect,
          { x: event.clientX, y: event.clientY },
        )
      }
    }

    const nextDrag = {
      ...drag,
      pointerX: event.clientX,
      pointerY: event.clientY,
      pendingAction,
    }
    moveDragRef.current = nextDrag
    setMoveDrag(nextDrag)
  }, [])

  const clearMoveDrag = useCallback(() => {
    moveDragRef.current = null
    setMoveDrag(null)
  }, [])

  const startMove = useCallback((event: React.PointerEvent, tileId: string) => {
    if (resizeDragRef.current) return
    event.preventDefault()
    event.stopPropagation()
    const nextDrag: MoveDragState = {
      sourceTileId: tileId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      pendingAction: { type: 'none' },
    }
    moveDragRef.current = nextDrag
    setMoveDrag(nextDrag)
    onFocusTile(tileId)
  }, [onFocusTile])

  useEffect(() => {
    if (!moveDrag) return

    const handlePointerMove = (event: PointerEvent) => {
      updateMoveDrag(event)
    }
    const handlePointerUp = (event: PointerEvent) => {
      updateMoveDrag(event)
      const drag = moveDragRef.current
      const containerRect = containerRef.current?.getBoundingClientRect()
      const isOutside = !containerRect
        || event.clientX <= containerRect.left
        || event.clientX >= containerRect.right
        || event.clientY <= containerRect.top
        || event.clientY >= containerRect.bottom

      if (drag && !isOutside && drag.pendingAction.type !== 'none') {
        onSetRootNode(commitGridDragAction(rootNodeRef.current, drag.pendingAction))
      }

      clearMoveDrag()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', clearMoveDrag)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', clearMoveDrag)
    }
  }, [clearMoveDrag, moveDrag, onSetRootNode, updateMoveDrag])

  const renderNode = (node: GridLayoutNode): React.ReactElement | null => {
    if (node.type === 'leaf') {
      const tile = tilesById.get(node.tileId)
      if (!tile) return null
      const Icon = TILE_META[tile.type].icon
      const title = getTileTitle(tile, terminalTitles)
      const isDragPlaceholder = draggedTileId === tile.id && moveDrag?.pendingAction.type !== 'none'

      return (
        <section
          key={node.id}
          data-grid-tile-id={tile.id}
          className={`flex h-full min-h-[180px] w-full min-w-[260px] flex-col overflow-hidden border bg-bg-secondary ${
            draggedTileId === tile.id ? 'border-cyan-400' : 'border-border'
          } ${
            isDragPlaceholder ? 'border-dashed bg-cyan-400/5' : ''
          }`}
          onMouseDown={() => onFocusTile(tile.id)}
        >
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg-tertiary px-3">
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded border border-border-visible text-text-secondary active:cursor-grabbing"
              title="Move tile"
              onPointerDown={(event) => startMove(event, tile.id)}
            >
              <GripVertical size={14} />
            </button>
            <Icon size={15} className="shrink-0 text-text-secondary" />
            <div className="min-w-0 flex-1 truncate text-sm text-text-display">{title}</div>
            <TileActionButtons
              onConfigure={(event) => onConfigureTile(tile, event.currentTarget)}
              onFocus={() => onFocusTileInView(tile)}
              onDetach={() => onDetachTile(tile)}
              onClose={() => onCloseTile(tile.id)}
            />
          </div>
          <div className="min-h-0 flex-1">
            {isDragPlaceholder ? (
              <div className="flex h-full items-center justify-center border border-dashed border-cyan-400/60 bg-cyan-400/10 text-cyan-300">
                <GripVertical size={18} />
              </div>
            ) : (
              <TileContent
                tile={tile}
                isFocused={focusedTileId === tile.id}
                edgeToEdge
                onFocus={() => onFocusTile(tile.id)}
                onUpdate={(patch) => onUpdateTile(tile.id, patch)}
              />
            )}
          </div>
        </section>
      )
    }

    return (
      <div
        key={node.id}
        className="flex h-full min-h-0 w-full min-w-0 flex-1 gap-1"
        style={{ flexDirection: node.direction }}
      >
        {node.children.map((child, index) => (
          <React.Fragment key={child.id}>
            <div className="h-full min-h-0 min-w-0" style={{ flex: `${node.sizes[index] ?? 10} 1 0` }}>
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
    <div ref={containerRef} className="relative flex h-full w-full overflow-hidden bg-bg-primary p-2">
      {displayRootNode ? (
        renderNode(displayRootNode)
      ) : (
        <div className="flex h-full items-center justify-center text-text-secondary">
          <span className="nd-label">[ EMPTY GRID ]</span>
        </div>
      )}
      {moveDrag && draggedTileId && tilesById.has(draggedTileId) && (
        <div
          className="pointer-events-none fixed z-50 flex h-20 w-64 -translate-x-3 -translate-y-3 items-center gap-3 border border-cyan-400 bg-bg-secondary/95 px-3 shadow-xl shadow-cyan-400/10"
          style={{ left: moveDrag.pointerX, top: moveDrag.pointerY }}
        >
          {(() => {
            const tile = tilesById.get(draggedTileId)
            if (!tile) return null
            const Icon = TILE_META[tile.type].icon
            return (
              <>
                <Icon size={16} className="shrink-0 text-cyan-300" />
                <div className="min-w-0">
                  <div className="truncate text-sm text-text-display">{getTileTitle(tile, terminalTitles)}</div>
                  <div className="mt-1 text-xs text-text-secondary">{TILE_META[tile.type].label}</div>
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
