import { useCanvasStore } from './canvasStore'
import type { CanvasState } from '@shared/types'

const state: CanvasState = {
  tiles: [
    { id: 'terminal', type: 'terminal', x: 0, y: 0, width: 10, height: 10, zIndex: 1 },
    { id: 'note', type: 'note', x: 0, y: 0, width: 10, height: 10, zIndex: 2 },
    { id: 'browser', type: 'browser', x: 0, y: 0, width: 10, height: 10, zIndex: 3 },
    { id: 'kanban', type: 'kanban', x: 0, y: 0, width: 10, height: 10, zIndex: 4 },
    { id: 'timer', type: 'timer', x: 0, y: 0, width: 10, height: 10, zIndex: 5 },
    { id: 'files', type: 'files', x: 0, y: 0, width: 10, height: 10, zIndex: 6 },
  ],
  groups: [],
  viewport: { tx: 0, ty: 0, zoom: 1 },
  nextZIndex: 7,
  focusedTileId: null,
  viewMode: 'canvas',
  fullviewActiveTileId: null,
  splitViewState: {
    leftTileIds: [],
    rightTileIds: [],
    activeLeftTileId: null,
    activeRightTileId: null,
    focusedPanel: 'left',
    orientation: 'vertical',
  },
}

useCanvasStore.getState().restoreState(state)

const expected = new Map([
  ['terminal', { width: 900, height: 400 }],
  ['note', { width: 900, height: 800 }],
  ['browser', { width: 1800, height: 800 }],
  ['kanban', { width: 1800, height: 800 }],
  ['timer', { width: 900, height: 400 }],
  ['files', { width: 900, height: 400 }],
])

for (const tile of useCanvasStore.getState().tiles) {
  const size = expected.get(tile.id)
  if (!size) throw new Error(`unexpected tile ${tile.id}`)
  if (tile.width !== size.width || tile.height !== size.height) {
    throw new Error(`restored ${tile.id} must normalize to ${size.width}x${size.height}, got ${tile.width}x${tile.height}`)
  }
}

useCanvasStore.getState().updateTile('note', { width: 2400, height: 1200 })
const largeNote = useCanvasStore.getState().tiles.find((tile) => tile.id === 'note')
if (!largeNote || largeNote.width !== 2400 || largeNote.height !== 1200) {
  throw new Error(`note update must not cap growth, got ${largeNote ? `${largeNote.width}x${largeNote.height}` : 'missing note'}`)
}

for (const tileId of expected.keys()) {
  useCanvasStore.getState().updateTile(tileId, { width: 1, height: 1 })
  const tile = useCanvasStore.getState().tiles.find((entry) => entry.id === tileId)
  const size = expected.get(tileId)
  if (!tile || !size) throw new Error(`missing tile ${tileId}`)
  if (tile.width !== size.width || tile.height !== size.height) {
    throw new Error(`updated ${tileId} must clamp to ${size.width}x${size.height}, got ${tile.width}x${tile.height}`)
  }
}
