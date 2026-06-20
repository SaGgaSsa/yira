import assert from 'node:assert/strict'
import { calculateCanvasFitViewport } from './canvasViewportFit'

const viewport = calculateCanvasFitViewport({
  bounds: { minX: 100, minY: 200, maxX: 400, maxY: 400 },
  container: { width: 1200, height: 800 },
})

assert.equal(viewport.zoom, 3.88)
assert.equal(viewport.tx, -370)
assert.equal(viewport.ty, -764)
