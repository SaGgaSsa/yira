import type { GridLayoutNode } from '@shared/types'
import {
  getGridDragPreviewRect,
  resolveGridDragPreview,
  samePendingGridDragAction,
} from './gridDragPreview'

const targetRect = { left: 100, top: 200, width: 400, height: 300 }
const swap = getGridDragPreviewRect({ type: 'swap', sourceTileId: 'a', targetTileId: 'b' }, targetRect)
if (JSON.stringify(swap) !== JSON.stringify(targetRect)) throw new Error('swap preview must cover the fixed target')

const left = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'left' }, targetRect)
if (!left || left.left !== 100 || left.top !== 200 || left.width !== 200 || left.height !== 300) {
  throw new Error('left preview must occupy the target’s stable left half')
}

const bottom = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'outer-bottom' }, targetRect)
if (!bottom || bottom.left !== 100 || bottom.top !== 350 || bottom.width !== 400 || bottom.height !== 150) {
  throw new Error('outer-bottom preview must occupy the target’s stable bottom half')
}

const innerBottom = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'bottom' }, targetRect)
if (!innerBottom || innerBottom.left !== 100 || innerBottom.top !== 350 || innerBottom.width !== 400 || innerBottom.height !== 150) {
  throw new Error('bottom preview must occupy the target’s stable bottom half')
}

if (getGridDragPreviewRect({ type: 'none' }, targetRect) !== null) throw new Error('no action must have no preview')
if (!samePendingGridDragAction({ type: 'none' }, { type: 'none' })) throw new Error('equal no-op actions must be deduplicated')
if (samePendingGridDragAction({ type: 'swap', sourceTileId: 'a', targetTileId: 'b' }, { type: 'swap', sourceTileId: 'a', targetTileId: 'c' })) {
  throw new Error('different targets must not be deduplicated')
}

const right = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'right' }, targetRect)
const top = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'top' }, targetRect)
const outerLeft = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'outer-left' }, targetRect)
const outerRight = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'outer-right' }, targetRect)
const outerTop = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'outer-top' }, targetRect)
if (!right || right.left !== 300 || right.width !== 200) throw new Error('right preview must occupy the right half')
if (!top || top.top !== 200 || top.height !== 150) throw new Error('top preview must occupy the top half')
if (!outerLeft || outerLeft.left !== 100 || outerLeft.width !== 200) throw new Error('outer-left preview must occupy the left half')
if (!outerRight || outerRight.left !== 300 || outerRight.width !== 200) throw new Error('outer-right preview must occupy the right half')
if (!outerTop || outerTop.top !== 200 || outerTop.height !== 150) throw new Error('outer-top preview must occupy the top half')

const committedRoot: GridLayoutNode = {
  id: 'root',
  type: 'split',
  direction: 'row',
  sizes: [10, 10, 10],
  children: [
    { id: 'leaf-a', type: 'leaf', tileId: 'a' },
    { id: 'leaf-b', type: 'leaf', tileId: 'b' },
    { id: 'leaf-c', type: 'leaf', tileId: 'c' },
  ],
}
const fixedTargetRect = { left: 100, top: 200, width: 400, height: 300 }
const committedRootSnapshot = JSON.stringify(committedRoot)

function assertCommittedRootUnchanged(): void {
  if (JSON.stringify(committedRoot) !== committedRootSnapshot) {
    throw new Error('resolving a drag preview must not mutate or commit the root tree')
  }
}

const firstCenterResolution = resolveGridDragPreview(
  committedRoot,
  'a',
  'c',
  fixedTargetRect,
  { x: 300, y: 350 },
)
assertCommittedRootUnchanged()
const secondCenterResolution = resolveGridDragPreview(
  committedRoot,
  'a',
  'c',
  fixedTargetRect,
  { x: 300, y: 350 },
)
assertCommittedRootUnchanged()
if (firstCenterResolution.pendingAction.type === 'none' || secondCenterResolution.pendingAction.type === 'none') {
  throw new Error('resolving a valid fixed target must produce a non-noop action')
}
if (!samePendingGridDragAction(firstCenterResolution.pendingAction, secondCenterResolution.pendingAction)) {
  throw new Error('resolving the same fixed target twice must produce equal actions')
}
if (JSON.stringify(firstCenterResolution.targetRect) !== JSON.stringify(secondCenterResolution.targetRect)) {
  throw new Error('resolving the same fixed target twice must produce equal preview rectangles')
}

const leftEdgeResolution = resolveGridDragPreview(
  committedRoot,
  'a',
  'c',
  fixedTargetRect,
  { x: 100, y: 350 },
)
assertCommittedRootUnchanged()
if (leftEdgeResolution.pendingAction.type === 'none') {
  throw new Error('resolving a valid target edge must produce a non-noop action')
}
if (samePendingGridDragAction(firstCenterResolution.pendingAction, leftEdgeResolution.pendingAction)) {
  throw new Error('moving from the target center to its left edge must change the resolved action')
}
const centerPreview = getGridDragPreviewRect(firstCenterResolution.pendingAction, firstCenterResolution.targetRect)
const leftPreview = getGridDragPreviewRect(leftEdgeResolution.pendingAction, leftEdgeResolution.targetRect)
if (JSON.stringify(centerPreview) === JSON.stringify(leftPreview)) {
  throw new Error('moving from the target center to its left edge must change the resolved preview')
}

for (const [targetTileId, nextTargetRect] of [
  ['a', fixedTargetRect],
  [null, fixedTargetRect],
  ['c', null],
] as const) {
  const resolution = resolveGridDragPreview(
    committedRoot,
    'a',
    targetTileId,
    nextTargetRect,
    { x: 300, y: 350 },
  )
  assertCommittedRootUnchanged()
  if (JSON.stringify(resolution) !== JSON.stringify({ pendingAction: { type: 'none' }, targetRect: null })) {
    throw new Error('invalid fixed targets must resolve to an empty preview state')
  }
}

const staleSourceResolution = resolveGridDragPreview(
  committedRoot,
  'missing-source',
  'c',
  fixedTargetRect,
  { x: 300, y: 350 },
)
assertCommittedRootUnchanged()
if (JSON.stringify(staleSourceResolution) !== JSON.stringify({ pendingAction: { type: 'none' }, targetRect: null })) {
  throw new Error('a source missing from the committed root must resolve to the exact empty preview state')
}

const missingTargetResolution = resolveGridDragPreview(
  committedRoot,
  'a',
  'missing-target',
  fixedTargetRect,
  { x: 300, y: 350 },
)
assertCommittedRootUnchanged()
if (JSON.stringify(missingTargetResolution) !== JSON.stringify({ pendingAction: { type: 'none' }, targetRect: null })) {
  throw new Error('a target missing from the committed root must resolve to the exact empty preview state')
}
