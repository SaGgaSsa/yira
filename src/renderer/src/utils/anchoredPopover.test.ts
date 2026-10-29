import assert from 'node:assert/strict'
import test from 'node:test'
import { getAnchoredPopoverPosition } from './anchoredPopover'

const size = { width: 300, maxHeight: 400, minHeightBelow: 240 }

function rect(left: number, top: number, width = 100, height = 20) {
  return { left, top, right: left + width, bottom: top + height, width }
}

test('opens below the trigger, aligned to its left edge', () => {
  assert.deepEqual(getAnchoredPopoverPosition(rect(100, 50), 1200, 800, size), {
    top: 74,
    left: 100,
    width: 300,
    maxHeight: 400,
  })
})

test('aligns to the trigger right edge when the popover would overflow the viewport', () => {
  const position = getAnchoredPopoverPosition(rect(1050, 50), 1200, 800, size)
  assert.equal(position.left, 850)
})

test('opens above the trigger when there is not enough room below', () => {
  const position = getAnchoredPopoverPosition(rect(100, 700), 1200, 800, size)
  assert.equal(position.top, undefined)
  assert.equal(position.bottom, 104)
  assert.equal(position.maxHeight, 400)
})

test('grows to the trigger width when asked to', () => {
  const position = getAnchoredPopoverPosition(rect(100, 50, 360), 1200, 800, { ...size, matchTriggerWidth: true })
  assert.equal(position.width, 360)
})

test('never gets wider than the viewport', () => {
  const position = getAnchoredPopoverPosition(rect(10, 50), 250, 800, size)
  assert.deepEqual([position.left, position.width], [8, 234])
})
