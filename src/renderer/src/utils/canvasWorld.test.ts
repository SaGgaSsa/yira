import {
  CANVAS_WORLD_BOUNDS,
  CANVAS_WORLD_SIZE,
  clampTileRectToWorld,
  clampViewportToWorld,
  normalizeFiniteViewport,
  normalizeFiniteTileRect,
} from './canvasWorld'

if (CANVAS_WORLD_SIZE !== 4560) {
  throw new Error(`canvas world size must be 4560, got ${CANVAS_WORLD_SIZE}`)
}

if (
  CANVAS_WORLD_BOUNDS.minX !== -2280 ||
  CANVAS_WORLD_BOUNDS.minY !== -2280 ||
  CANVAS_WORLD_BOUNDS.maxX !== 2280 ||
  CANVAS_WORLD_BOUNDS.maxY !== 2280
) {
  throw new Error('canvas world bounds must be centered on a 4560px square')
}

const rightEdgeTile = clampTileRectToWorld({ x: 5000, y: 100, width: 640, height: 420 })
if (rightEdgeTile.x !== 1640 || rightEdgeTile.y !== 100) {
  throw new Error(`tile must clamp fully inside the right edge, got ${JSON.stringify(rightEdgeTile)}`)
}

const topLeftTile = clampTileRectToWorld({ x: -9999, y: -9999, width: 640, height: 420 })
if (topLeftTile.x !== -2280 || topLeftTile.y !== -2280) {
  throw new Error(`tile must clamp fully inside the top-left edge, got ${JSON.stringify(topLeftTile)}`)
}

const oversizedTile = clampTileRectToWorld({ x: 400, y: 400, width: 6000, height: 7000 })
if (oversizedTile.x !== -2280 || oversizedTile.y !== -2280 || oversizedTile.width !== 4560 || oversizedTile.height !== 4560) {
  throw new Error(`oversized tile must normalize to the world size, got ${JSON.stringify(oversizedTile)}`)
}

const finiteTile = normalizeFiniteTileRect({ x: Number.POSITIVE_INFINITY, y: Number.NaN, width: -1, height: Number.NEGATIVE_INFINITY })
if (finiteTile.x !== 0 || finiteTile.y !== 0 || finiteTile.width !== 1 || finiteTile.height !== 1) {
  throw new Error(`non-finite tile rect must normalize safely, got ${JSON.stringify(finiteTile)}`)
}

const finiteViewport = normalizeFiniteViewport({ tx: Number.POSITIVE_INFINITY, ty: Number.NaN, zoom: 20 })
if (finiteViewport.tx !== 0 || finiteViewport.ty !== 0 || finiteViewport.zoom !== 5) {
  throw new Error(`non-finite viewport must normalize safely, got ${JSON.stringify(finiteViewport)}`)
}

const leftViewport = clampViewportToWorld({
  viewport: { tx: 99999, ty: 0, zoom: 1 },
  containerWidth: 1920,
  containerHeight: 1080,
})
if (leftViewport.tx !== 2280) {
  throw new Error(`viewport must clamp at the left world edge, got ${JSON.stringify(leftViewport)}`)
}

const rightViewport = clampViewportToWorld({
  viewport: { tx: -99999, ty: 0, zoom: 1 },
  containerWidth: 1920,
  containerHeight: 1080,
})
if (rightViewport.tx !== -360) {
  throw new Error(`viewport must clamp at the right world edge, got ${JSON.stringify(rightViewport)}`)
}

const centeredViewport = clampViewportToWorld({
  viewport: { tx: 99999, ty: -99999, zoom: 0.1 },
  containerWidth: 1920,
  containerHeight: 1080,
})
if (centeredViewport.tx !== 960 || centeredViewport.ty !== 540) {
  throw new Error(`viewport must center the world when it is smaller than the viewport, got ${JSON.stringify(centeredViewport)}`)
}
