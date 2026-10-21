import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GripVertical } from 'lucide-react'
import type { GridLayoutNode, GridLayoutSplitNode } from '@shared/types'
import {
  commitGridDragAction,
  resizeGridChild,
  type GridDropRect,
  type PendingGridDragAction,
} from '@shared/gridWorkspaceState'
import {
  getGridDragPreviewRect,
  resolveGridDragPreview,
  samePendingGridDragAction,
} from '@/utils/gridDragPreview'

export interface GridLayoutTileRenderState {
  /** True while this tile is the one being moved. */
  isDragged: boolean
  /** Attach to the move handle's onPointerDown. */
  startMove: (event: React.PointerEvent) => void
}

interface GridLayoutSurfaceProps {
  rootNode: GridLayoutNode | null
  onSetRootNode: (rootNode: GridLayoutNode | null) => void
  /** Called when a move starts, with the dragged tile id. */
  onFocusTile: (tileId: string) => void
  /** Returns null when the tile id is unknown; the leaf is then skipped, as today. */
  renderTile: (tileId: string, state: GridLayoutTileRenderState) => React.ReactNode | null
  /** Content of the ghost that follows the pointer while dragging. */
  renderDragGhost: (tileId: string) => React.ReactNode | null
  className?: string
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

const DEFAULT_SURFACE_CLASS = 'relative flex h-full w-full overflow-hidden bg-bg-primary p-2'

function releaseMovePointerCapture(drag: MoveDragState | null): void {
  if (!drag) return

  try {
    if (!drag.pointerCaptureTarget.hasPointerCapture(drag.pointerId)) return
    drag.pointerCaptureTarget.releasePointerCapture(drag.pointerId)
  } catch {
    // The element can lose capture or be detached before cleanup runs.
  }
}

function sameGridDropRect(first: GridDropRect | null, second: GridDropRect | null): boolean {
  if (first === second) return true
  if (!first || !second) return false
  return first.left === second.left
    && first.top === second.top
    && first.width === second.width
    && first.height === second.height
}

export function GridLayoutSurface({
  rootNode,
  onSetRootNode,
  onFocusTile,
  renderTile,
  renderDragGhost,
  className,
}: GridLayoutSurfaceProps): React.ReactElement {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const resizeDragRef = useRef<ResizeDragState | null>(null)
  const rootNodeRef = useRef<GridLayoutNode | null>(rootNode)
  const moveDragRef = useRef<MoveDragState | null>(null)
  const lastMoveUpdateRef = useRef<LastMoveUpdate | null>(null)
  const [moveDrag, setMoveDrag] = useState<MoveDragState | null>(null)
  const hasMoveDrag = moveDrag !== null
  const draggedTileId = moveDrag?.sourceTileId ?? null
  const previewRect = moveDrag
    ? getGridDragPreviewRect(moveDrag.pendingAction, moveDrag.targetRect)
    : null
  const containerRect = previewRect
    ? containerRef.current?.getBoundingClientRect()
    : null
  const dragGhost = moveDrag && draggedTileId ? renderDragGhost(draggedTileId) : null

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
      const tile = renderTile(node.tileId, {
        isDragged: draggedTileId === node.tileId,
        startMove: (event) => startMove(event, node.tileId),
      })
      if (tile === null) return null

      return <React.Fragment key={node.id}>{tile}</React.Fragment>
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
                title={t('ui.resizeSplit')}
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
    <div ref={containerRef} className={className ?? DEFAULT_SURFACE_CLASS}>
      {rootNode ? renderNode(rootNode) : null}
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
      {moveDrag && dragGhost !== null && (
        <div
          className="pointer-events-none fixed z-50 flex h-20 w-64 -translate-x-3 -translate-y-3 items-center gap-3 border border-cyan-400 bg-bg-secondary/95 px-3 shadow-xl shadow-cyan-400/10"
          style={{ left: moveDrag.pointerX, top: moveDrag.pointerY }}
        >
          {dragGhost}
        </div>
      )}
    </div>
  )
}
