import { normalizeCanvasStateForJson } from './canvasStateNormalization'
import type { CanvasState } from '@shared/types'

const state: CanvasState = {
  tiles: [
    { id: 'terminal', type: 'terminal', x: 0, y: 0, width: 10, height: 20, zIndex: 1, hideTitlebar: true } as CanvasState['tiles'][number] & { hideTitlebar: true },
    { id: 'note', type: 'note', x: 0, y: 0, width: 10, height: 20, zIndex: 2 },
    { id: 'browser', type: 'browser', x: 0, y: 0, width: 10, height: 20, zIndex: 3 },
    { id: 'kanban', type: 'kanban', x: 0, y: 0, width: 10, height: 20, zIndex: 4 } as unknown as CanvasState['tiles'][number],
    { id: 'timer', type: 'timer', x: 0, y: 0, width: 10, height: 20, zIndex: 5 },
    { id: 'files', type: 'files', x: 0, y: 0, width: 10, height: 20, zIndex: 6 },
  ],
  groups: [],
  viewport: { tx: 0, ty: 0, zoom: 1 },
  nextZIndex: 7,
  focusedTileId: null,
  viewMode: 'canvas',
  fullviewActiveTileId: null,
  splitViewState: {
    leftTileIds: ['terminal'],
    rightTileIds: ['note'],
    activeLeftTileId: 'terminal',
    activeRightTileId: 'note',
    focusedPanel: 'left',
    orientation: 'vertical',
  },
}

const normalized = normalizeCanvasStateForJson(state)
const expected = new Map([
  ['terminal', { width: 900, height: 400 }],
  ['note', { width: 900, height: 800 }],
  ['browser', { width: 1800, height: 800 }],
  ['timer', { width: 900, height: 400 }],
  ['files', { width: 900, height: 400 }],
])

if (normalized.tiles.some((tile) => tile.id === 'kanban')) {
  throw new Error('legacy kanban tiles must be dropped from normalized canvas JSON')
}

for (const tile of normalized.tiles) {
  const size = expected.get(tile.id)
  if (!size) throw new Error(`unexpected tile ${tile.id}`)
  if (tile.width !== size.width || tile.height !== size.height) {
    throw new Error(`${tile.id} must normalize to ${size.width}x${size.height}, got ${tile.width}x${tile.height}`)
  }
  if ('hideTitlebar' in tile) {
    throw new Error(`${tile.id} must not persist hideTitlebar`)
  }
}
