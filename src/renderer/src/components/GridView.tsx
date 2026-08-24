import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'
import type { GridLayoutNode, GridLayoutSplitNode, TileState } from '@shared/types'
import {
  commitGridDragAction,
  resizeGridChild,
  type GridDropRect,
  type PendingGridDragAction,
} from '@shared/gridWorkspaceState'
import { TileContent, TILE_META } from './TileContent'
import { TileActionButtons } from './TileActionButtons'
import { TileCreationSelector, type TileCreationSelectorProps } from './TileCreationSelector'
import {
  getGridDragPreviewRect,
  resolveGridDragPreview,
  samePendingGridDragAction,
} from '@/utils/gridDragPreview'
import { getTerminalDisplayTitle } from '@/utils/terminalDisplayTitle'

interface GridViewProps {
  rootNode: GridLayoutNode | null
  tiles: TileState[]
  tileRefreshKeys: Record<string, number>
  focusedTileId: string | null
  terminalTitles: Record<string, string>
  onFocusTile: (tileId: string) => void
  onUpdateTile: (tileId: string, patch: Partial<TileState>) => void
  onSetRootNode: (rootNode: GridLayoutNode | null) => void
  onConfigureTile: (tile: TileState, trigger: HTMLElement) => void
  onFocusTileInView: (tile: TileState) => void
  onDetachTile: (tile: TileState) => void
  onCloseTile: (tileId: string) => void
  onOpenBrowserTile: (url: string) => void
  onOpenFileTile: (relativePath: string) => void | Promise<void>
  tileCreationSelectorProps: TileCreationSelectorProps
  workspaceRootPath: string
}

interface ResizeDragState {
  splitNode: GridLayoutSplitNode
  childIndex: number
  startX: number
  startY: number
  startSize: number
}

interface MoveDragState {
  pointerId: number
  pointerCaptureTarget: Element
  sourceTileId: string
  pointerX: number
  pointerY: number
  pendingAction: PendingGridDragAction
  targetRect: GridDropRect | null
}

interface LastMoveUpdate {
  timestamp: number
  pendingAction: PendingGridDragAction
  targetRect: GridDropRect | null
}

function releaseMovePointerCapture(drag: MoveDragState | null): void {
  if (!drag) return

  try {
    if (!drag.pointerCaptureTarget.hasPointerCapture(drag.pointerId)) return
    drag.pointerCaptureTarget.releasePointerCapture(drag.pointerId)
  } catch {
    // The element can lose capture or be detached before cleanup runs.
  }
}

function getTileTitle(tile: TileState, terminalTitles: Record<string, string>): string {
  if (tile.label?.trim()) return tile.label.trim()
  if (tile.type === 'terminal') return getTerminalDisplayTitle(tile, terminalTitles)
  return TILE_META[tile.type].label
}

function sameGridDropRect(first: GridDropRect | null, second: GridDropRect | null): boolean {
  if (first === second) return true
  if (!first || !second) return false
  return first.left === second.left
    && first.top === second.top
    && first.width === second.width
    && first.height === second.height
}

export function GridView({
  rootNode,
  tiles,
  tileRefreshKeys,
  focusedTileId,
  terminalTitles,
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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const resizeDragRef = useRef<ResizeDragState | null>(null)
  const rootNodeRef = useRef<GridLayoutNode | null>(rootNode)
  const moveDragRef = useRef<MoveDragState | null>(null)
  const lastMoveUpdateRef = useRef<LastMoveUpdate | null>(null)
  const [moveDrag, setMoveDrag] = useState<MoveDragState | null>(null)
  const hasMoveDrag = moveDrag !== null
  const tilesById = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles])
  const draggedTileId = moveDrag?.sourceTileId ?? null
  const previewRect = moveDrag
    ? getGridDragPreviewRect(moveDrag.pendingAction, moveDrag.targetRect)
    : null
  const containerRect = previewRect
    ? containerRef.current?.getBoundingClientRect()
    : null

  useEffect(() => {
    const rootChanged = rootNodeRef.current !== rootNode
    rootNodeRef.current = rootNode
    if (!rootChanged || !moveDragRef.current) return

    releaseMovePointerCapture(moveDragRef.current)
    moveDragRef.current = null
    lastMoveUpdateRef.current = null
    setMoveDrag(null)
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
    if (!drag || event.pointerId !== drag.pointerId || !currentRootNode || !containerRect) return

    const isOutside = event.clientX <= containerRect.left
      || event.clientX >= containerRect.right
      || event.clientY <= containerRect.top
      || event.clientY >= containerRect.bottom
    let targetTileId: string | null = null
    let targetRect: GridDropRect | null = null

    if (!isOutside) {
      const target = document.elementFromPoint(event.clientX, event.clientY)
      const targetElement = target instanceof Element
        ? target.closest<HTMLElement>('[data-grid-drop-target-id]')
        : null
      targetTileId = targetElement?.dataset.gridDropTargetId ?? null
      targetRect = targetElement?.getBoundingClientRect() ?? null
    }

    const resolved = resolveGridDragPreview(
      currentRootNode,
      drag.sourceTileId,
      targetTileId,
      targetRect,
      { x: event.clientX, y: event.clientY },
    )
    const lastUpdate = lastMoveUpdateRef.current
    const actionChanged = !samePendingGridDragAction(
      lastUpdate?.pendingAction ?? drag.pendingAction,
      resolved.pendingAction,
    )
    const rectChanged = !sameGridDropRect(
      lastUpdate?.targetRect ?? drag.targetRect,
      resolved.targetRect,
    )
    const timestamp = performance.now()

    if (!actionChanged && !rectChanged && lastUpdate && timestamp - lastUpdate.timestamp < 50) return

    const nextDrag = {
      ...drag,
      pointerX: event.clientX,
      pointerY: event.clientY,
      pendingAction: resolved.pendingAction,
      targetRect: resolved.targetRect,
    }
    lastMoveUpdateRef.current = {
      timestamp,
      pendingAction: resolved.pendingAction,
      targetRect: resolved.targetRect,
    }
    moveDragRef.current = nextDrag
    setMoveDrag(nextDrag)
  }, [])

  const clearMoveDrag = useCallback(() => {
    releaseMovePointerCapture(moveDragRef.current)
    moveDragRef.current = null
    lastMoveUpdateRef.current = null
    setMoveDrag(null)
  }, [])

  const startMove = useCallback((event: React.PointerEvent, tileId: string) => {
    if (resizeDragRef.current) return
    event.preventDefault()
    event.stopPropagation()
    const nextDrag: MoveDragState = {
      pointerId: event.pointerId,
      pointerCaptureTarget: event.currentTarget,
      sourceTileId: tileId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      pendingAction: { type: 'none' },
      targetRect: null,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    moveDragRef.current = nextDrag
    lastMoveUpdateRef.current = {
      timestamp: performance.now(),
      pendingAction: nextDrag.pendingAction,
      targetRect: nextDrag.targetRect,
    }
    setMoveDrag(nextDrag)
    onFocusTile(tileId)
  }, [onFocusTile])

  useEffect(() => {
    if (!hasMoveDrag) return

    const handlePointerMove = (event: PointerEvent) => {
      updateMoveDrag(event)
    }
    const handlePointerUp = (event: PointerEvent) => {
      const activeDrag = moveDragRef.current
      if (!activeDrag || event.pointerId !== activeDrag.pointerId) return

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
    const handlePointerCancel = (event: PointerEvent) => {
      const drag = moveDragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      clearMoveDrag()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      releaseMovePointerCapture(moveDragRef.current)
    }
  }, [clearMoveDrag, hasMoveDrag, onSetRootNode, updateMoveDrag])

  const renderNode = (node: GridLayoutNode): React.ReactElement | null => {
    if (node.type === 'leaf') {
      const tile = tilesById.get(node.tileId)
      if (!tile) return null
      const Icon = TILE_META[tile.type].icon
      const title = getTileTitle(tile, terminalTitles)
      const isDraggedTile = draggedTileId === tile.id

      return (
        <section
          key={node.id}
          data-grid-tile-id={tile.id}
          className={`flex h-full min-h-[180px] w-full min-w-[260px] flex-col overflow-hidden border bg-bg-secondary ${
            isDraggedTile ? 'border-cyan-400' : 'border-border'
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
          <div className={`min-h-0 flex-1 ${isDraggedTile ? 'opacity-40 blur-[1px]' : ''}`}>
            <TileContent
              key={`${tile.id}:${tileRefreshKeys[tile.id] ?? 0}`}
              tile={tile}
              isFocused={focusedTileId === tile.id}
              edgeToEdge
              onFocus={() => onFocusTile(tile.id)}
              onUpdate={(patch) => onUpdateTile(tile.id, patch)}
              onOpenBrowserTile={onOpenBrowserTile}
              onOpenFileTile={onOpenFileTile}
              workspaceRootPath={workspaceRootPath}
            />
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

  const renderDropTargetNode = (node: GridLayoutNode): React.ReactElement => {
    if (node.type === 'leaf') {
      return (
        <div
          key={node.id}
          data-grid-drop-target-id={node.tileId}
          className="h-full min-h-[180px] w-full min-w-[260px]"
        />
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
              {renderDropTargetNode(child)}
            </div>
            {index < node.children.length - 1 && (
              <div
                aria-hidden
                className={`shrink-0 ${node.direction === 'row' ? 'w-2' : 'h-2'}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative flex h-full w-full overflow-hidden bg-bg-primary p-2">
      {tiles.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center px-4">
          <div className="nd-panel-raised w-full max-w-xl rounded-[20px] px-5 py-8 text-center text-text-secondary">
            <div className="nd-label">[ EMPTY ]</div>
            <div className="mt-3 text-sm text-text-disabled">Create a terminal, note, browser, timer, or workspace board.</div>
            <TileCreationSelector {...tileCreationSelectorProps} className="mt-5 text-left" />
          </div>
        </div>
      ) : (
        <>
          {rootNode ? (
            renderNode(rootNode)
          ) : (
            <div className="flex h-full items-center justify-center text-text-secondary">
              <span className="nd-label">[ EMPTY GRID ]</span>
            </div>
          )}
          {previewRect && containerRect && (
            <div
              className="pointer-events-none absolute left-0 top-0 z-10 box-border border-2 border-dashed border-cyan-400 bg-cyan-400/10 transition-[transform,width,height] duration-100"
              style={{
                transform: `translate(${previewRect.left - containerRect.left}px, ${previewRect.top - containerRect.top}px)`,
                width: previewRect.width,
                height: previewRect.height,
              }}
            />
          )}
          {moveDrag && rootNode && (
            <div className="absolute inset-0 z-20 flex bg-transparent p-2">
              {renderDropTargetNode(rootNode)}
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
        </>
      )}
    </div>
  )
}
