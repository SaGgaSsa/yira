import assert from 'node:assert/strict'
import test from 'node:test'
import { findFreeCanvasPosition, rectsOverlap } from './canvasPlacement'

const GAP = 10
const WIDTH = 100
const HEIGHT = 50

test('rectsOverlap keeps the gap around both rects', () => {
  const occupied = { x: 0, y: 0, width: WIDTH, height: HEIGHT }

  // Touching edges only overlap when no gap is required
  assert.equal(rectsOverlap({ x: WIDTH, y: 0, width: WIDTH, height: HEIGHT }, occupied, 0), false)
  assert.equal(rectsOverlap({ x: WIDTH, y: 0, width: WIDTH, height: HEIGHT }, occupied, GAP), true)
  // A rect placed exactly one gap away is still free
  assert.equal(
    rectsOverlap({ x: WIDTH + GAP, y: 0, width: WIDTH, height: HEIGHT }, occupied, GAP),
    false,
  )
  assert.equal(rectsOverlap({ x: 0, y: 20, width: WIDTH, height: HEIGHT }, occupied, GAP), true)
})

test('findFreeCanvasPosition keeps a preferred position that is free', () => {
  const occupied = [{ x: 0, y: 0, width: WIDTH, height: HEIGHT }]
  const preferred = { x: 400, y: 300 }

  assert.deepEqual(
    findFreeCanvasPosition({ occupied, width: WIDTH, height: HEIGHT, preferred, gap: GAP }),
    preferred,
  )
})

test('findFreeCanvasPosition moves a new tile away from an occupied preferred position', () => {
  const occupied = [{ x: 0, y: 0, width: WIDTH, height: HEIGHT }]
  const preferred = { x: 0, y: 0 }
  const position = findFreeCanvasPosition({
    occupied,
    width: WIDTH,
    height: HEIGHT,
    preferred,
    gap: GAP,
  })

  // The bottom side is closer to the preferred spot than the right side
  assert.deepEqual(position, { x: 0, y: HEIGHT + GAP })
  assert.equal(
    rectsOverlap({ ...position, width: WIDTH, height: HEIGHT }, occupied[0], GAP),
    false,
  )
})

test('findFreeCanvasPosition respects the gap when the preferred position is close to a tile', () => {
  const occupied = [{ x: 0, y: 0, width: WIDTH, height: HEIGHT }]
  const preferred = { x: WIDTH + 5, y: 0 }
  const position = findFreeCanvasPosition({
    occupied,
    width: WIDTH,
    height: HEIGHT,
    preferred,
    gap: GAP,
  })

  assert.deepEqual(position, { x: WIDTH + GAP, y: 0 })
  assert.equal(
    rectsOverlap({ ...position, width: WIDTH, height: HEIGHT }, occupied[0], GAP),
    false,
  )
})

test('findFreeCanvasPosition returns the preferred position when nothing is occupied', () => {
  const preferred = { x: -120, y: 80 }

  assert.deepEqual(
    findFreeCanvasPosition({ occupied: [], width: WIDTH, height: HEIGHT, preferred, gap: GAP }),
    preferred,
  )
})

test('findFreeCanvasPosition skips the blocked slots of a crowded cluster', () => {
  const occupied = [
    { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    { x: WIDTH + GAP, y: 0, width: WIDTH, height: HEIGHT },
    { x: 0, y: HEIGHT + GAP, width: WIDTH, height: HEIGHT },
    { x: WIDTH + GAP, y: HEIGHT + GAP, width: WIDTH, height: HEIGHT },
  ]
  const preferred = { x: 0, y: 0 }
  const position = findFreeCanvasPosition({
    occupied,
    width: WIDTH,
    height: HEIGHT,
    preferred,
    gap: GAP,
  })
  const placedRect = { ...position, width: WIDTH, height: HEIGHT }

  for (const tile of occupied) {
    assert.equal(rectsOverlap(placedRect, tile, GAP), false)
  }
  // Below the first column is the closest free slot of the cluster
  assert.deepEqual(position, { x: 0, y: HEIGHT * 2 + GAP * 2 })
})
