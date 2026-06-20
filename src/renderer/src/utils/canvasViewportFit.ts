import type { Viewport } from '@shared/types'

export const CANVAS_FIT_MARGIN = 12

export interface CanvasFitBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface CanvasFitPadding {
  top: number
  right: number
  bottom: number
  left: number
}

interface CanvasFitInput {
  bounds: CanvasFitBounds
  container: { width: number; height: number }
  padding?: Partial<CanvasFitPadding>
}

function resolveCanvasFitPadding(padding?: Partial<CanvasFitPadding>): CanvasFitPadding {
  return {
    top: padding?.top ?? CANVAS_FIT_MARGIN,
    right: padding?.right ?? CANVAS_FIT_MARGIN,
    bottom: padding?.bottom ?? CANVAS_FIT_MARGIN,
    left: padding?.left ?? CANVAS_FIT_MARGIN,
  }
}

export function calculateCanvasFitViewport({ bounds, container, padding }: CanvasFitInput): Viewport {
  const boundsWidth = Math.max(1, bounds.maxX - bounds.minX)
  const boundsHeight = Math.max(1, bounds.maxY - bounds.minY)
  const resolvedPadding = resolveCanvasFitPadding(padding)
  const availableWidth = Math.max(1, container.width - resolvedPadding.left - resolvedPadding.right)
  const availableHeight = Math.max(1, container.height - resolvedPadding.top - resolvedPadding.bottom)
  const zoom = Math.max(0.1, Math.min(5, Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight)))
  const tx = resolvedPadding.left + (availableWidth - boundsWidth * zoom) / 2 - bounds.minX * zoom
  const ty = resolvedPadding.top + (availableHeight - boundsHeight * zoom) / 2 - bounds.minY * zoom

  return { tx, ty, zoom }
}
