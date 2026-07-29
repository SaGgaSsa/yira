import {
  computeGridDragAction,
  type GridDropRect,
  type GridPointerPosition,
  type PendingGridDragAction,
} from '@shared/gridWorkspaceState'
import type { GridLayoutNode } from '@shared/types'

export interface GridPreviewRect extends GridDropRect {}

export interface GridDragPreviewState {
  pendingAction: PendingGridDragAction
  targetRect: GridDropRect | null
}

export function resolveGridDragPreview(
  rootNode: GridLayoutNode | null,
  sourceTileId: string,
  targetTileId: string | null | undefined,
  targetRect: GridDropRect | null | undefined,
  pointer: GridPointerPosition | null | undefined,
): GridDragPreviewState {
  if (!rootNode || !sourceTileId || !targetTileId || !targetRect || !pointer || sourceTileId === targetTileId) {
    return { pendingAction: { type: 'none' }, targetRect: null }
  }

  const pendingAction = computeGridDragAction(rootNode, sourceTileId, targetTileId, targetRect, pointer)
  if (pendingAction.type === 'none') return { pendingAction, targetRect: null }

  return { pendingAction, targetRect }
}

export function getGridDragPreviewRect(
  action: PendingGridDragAction,
  targetRect: GridDropRect | null,
): GridPreviewRect | null {
  if (!targetRect || action.type === 'none') return null
  if (action.type === 'swap') return targetRect

  const { left, top, width, height } = targetRect
  if (action.direction === 'left' || action.direction === 'outer-left') {
    return { left, top, width: width / 2, height }
  }
  if (action.direction === 'right' || action.direction === 'outer-right') {
    return { left: left + width / 2, top, width: width / 2, height }
  }
  if (action.direction === 'top' || action.direction === 'outer-top') {
    return { left, top, width, height: height / 2 }
  }
  return { left, top: top + height / 2, width, height: height / 2 }
}

export function samePendingGridDragAction(
  first: PendingGridDragAction,
  second: PendingGridDragAction,
): boolean {
  if (first.type !== second.type) return false
  if (first.type === 'none' || second.type === 'none') return true
  if (first.type === 'swap' && second.type === 'swap') {
    return first.sourceTileId === second.sourceTileId && first.targetTileId === second.targetTileId
  }
  return first.type === 'move' && second.type === 'move'
    && first.sourceTileId === second.sourceTileId
    && first.targetTileId === second.targetTileId
    && first.direction === second.direction
}
