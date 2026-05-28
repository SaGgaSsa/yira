import type { TileState, Viewport } from '@shared/types'

const FULL_HD_SCREEN_AREA = 1920 * 1080
const CANVAS_WORLD_SCREEN_COUNT = 10
const GRID_ROUNDED_WORLD_SIZE = 4560
const MIN_TILE_SIZE = 1

export const CANVAS_WORLD_SIZE = GRID_ROUNDED_WORLD_SIZE
export const CANVAS_WORLD_BOUNDS = {
  minX: -CANVAS_WORLD_SIZE / 2,
  minY: -CANVAS_WORLD_SIZE / 2,
  maxX: CANVAS_WORLD_SIZE / 2,
  maxY: CANVAS_WORLD_SIZE / 2,
} as const

export const CANVAS_WORLD_AREA = FULL_HD_SCREEN_AREA * CANVAS_WORLD_SCREEN_COUNT
export const MIN_CANVAS_ZOOM = 0.1
export const MAX_CANVAS_ZOOM = 5

interface TileRect {
  x: number
  y: number
  width: number
  height: number
}

interface ClampViewportOptions {
  viewport: Viewport
  containerWidth: number
  containerHeight: number
}

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value as number : fallback
}

export function normalizeFiniteTileRect<T extends TileRect>(rect: T): T {
  return {
    ...rect,
    x: finiteOr(rect.x, 0),
    y: finiteOr(rect.y, 0),
    width: Math.max(MIN_TILE_SIZE, finiteOr(rect.width, MIN_TILE_SIZE)),
    height: Math.max(MIN_TILE_SIZE, finiteOr(rect.height, MIN_TILE_SIZE)),
  }
}

export function clampTileRectToWorld<T extends TileRect>(rect: T): T {
  const finiteRect = normalizeFiniteTileRect(rect)
  const width = Math.min(finiteRect.width, CANVAS_WORLD_SIZE)
  const height = Math.min(finiteRect.height, CANVAS_WORLD_SIZE)
  const minX = CANVAS_WORLD_BOUNDS.minX
  const minY = CANVAS_WORLD_BOUNDS.minY
  const maxX = CANVAS_WORLD_BOUNDS.maxX - width
  const maxY = CANVAS_WORLD_BOUNDS.maxY - height

  return {
    ...finiteRect,
    x: clampNumber(finiteRect.x, minX, maxX),
    y: clampNumber(finiteRect.y, minY, maxY),
    width,
    height,
  }
}

export function clampTileToWorld(tile: TileState): TileState {
  return clampTileRectToWorld(tile)
}

export function normalizeFiniteViewport(viewport: Viewport): Viewport {
  const zoom = clampNumber(finiteOr(viewport.zoom, 1), MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM)
  const maxOffset = CANVAS_WORLD_SIZE * MAX_CANVAS_ZOOM

  return {
    tx: clampNumber(finiteOr(viewport.tx, 0), -maxOffset, maxOffset),
    ty: clampNumber(finiteOr(viewport.ty, 0), -maxOffset, maxOffset),
    zoom,
  }
}

export function clampViewportToWorld({
  viewport,
  containerWidth,
  containerHeight,
}: ClampViewportOptions): Viewport {
  const finiteViewport = normalizeFiniteViewport(viewport)
  const width = Math.max(1, finiteOr(containerWidth, 1))
  const height = Math.max(1, finiteOr(containerHeight, 1))
  const worldWidth = CANVAS_WORLD_SIZE * finiteViewport.zoom
  const worldHeight = CANVAS_WORLD_SIZE * finiteViewport.zoom

  const tx = worldWidth <= width
    ? (width - worldWidth) / 2 - CANVAS_WORLD_BOUNDS.minX * finiteViewport.zoom
    : clampNumber(
      finiteViewport.tx,
      width - CANVAS_WORLD_BOUNDS.maxX * finiteViewport.zoom,
      -CANVAS_WORLD_BOUNDS.minX * finiteViewport.zoom,
    )
  const ty = worldHeight <= height
    ? (height - worldHeight) / 2 - CANVAS_WORLD_BOUNDS.minY * finiteViewport.zoom
    : clampNumber(
      finiteViewport.ty,
      height - CANVAS_WORLD_BOUNDS.maxY * finiteViewport.zoom,
      -CANVAS_WORLD_BOUNDS.minY * finiteViewport.zoom,
    )

  return {
    tx,
    ty,
    zoom: finiteViewport.zoom,
  }
}
