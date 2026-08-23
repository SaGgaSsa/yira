import { useCanvasStore } from './canvasStore'
import type { CanvasState } from '@shared/types'

const state: CanvasState = {
  tiles: [
    { id: 'terminal', type: 'terminal', x: 0, y: 0, width: 10, height: 10, zIndex: 1 },
    { id: 'note', type: 'note', x: 0, y: 0, width: 10, height: 10, zIndex: 2 },
    { id: 'browser', type: 'browser', x: 0, y: 0, width: 10, height: 10, zIndex: 3 },
    { id: 'kanban', type: 'kanban', x: 0, y: 0, width: 10, height: 10, zIndex: 4 } as unknown as CanvasState['tiles'][number],
    { id: 'timer', type: 'timer', x: 0, y: 0, width: 10, height: 10, zIndex: 5 },
    { id: 'files', type: 'files', x: 0, y: 0, width: 10, height: 10, zIndex: 6 } as unknown as CanvasState['tiles'][number],
    {
      id: 'restored-file',
      type: 'files',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      zIndex: 7,
      filePath: 'src/restored.ts',
      filePreview: true,
      fileDraft: 'restored draft',
      fileVersion: 'expected-sha-256',
      fileChangeToken: 'metadata-token',
      fileMarkdownView: 'live',
    } as unknown as CanvasState['tiles'][number],
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

useCanvasStore.getState().updateTile('terminal', {
  label: 'Development',
  startupCommand: 'npm run dev',
  notificationsMuted: true,
})
const configuredTerminal = useCanvasStore.getState().tiles.find((tile) => tile.id === 'terminal')
if (
  configuredTerminal?.label !== 'Development' ||
  configuredTerminal.startupCommand !== 'npm run dev' ||
  configuredTerminal.notificationsMuted !== true
) {
  throw new Error('tile settings must update every configurable terminal field')
}

useCanvasStore.getState().updateTile('terminal', {
  label: undefined,
  startupCommand: undefined,
  notificationsMuted: undefined,
})
const clearedTerminal = useCanvasStore.getState().tiles.find((tile) => tile.id === 'terminal')
if (
  !clearedTerminal ||
  clearedTerminal.label !== undefined ||
  clearedTerminal.startupCommand !== undefined ||
  clearedTerminal.notificationsMuted !== undefined
) {
  throw new Error('tile settings must clear optional terminal fields')
}

const expected = new Map([
  ['terminal', { width: 900, height: 400 }],
  ['note', { width: 900, height: 800 }],
  ['browser', { width: 1800, height: 800 }],
  ['timer', { width: 900, height: 400 }],
  ['restored-file', { width: 900, height: 500 }],
])

for (const tile of useCanvasStore.getState().tiles) {
  const size = expected.get(tile.id)
  if (!size) throw new Error(`unexpected tile ${tile.id}`)
  if (tile.width !== size.width || tile.height !== size.height) {
    throw new Error(`restored ${tile.id} must normalize to ${size.width}x${size.height}, got ${tile.width}x${tile.height}`)
  }
}

if (useCanvasStore.getState().tiles.some((tile) => tile.id === 'kanban' || tile.id === 'files')) {
  throw new Error('legacy files and kanban tiles must be dropped when restoring canvas state')
}

const restoredFile = useCanvasStore.getState().tiles.find((tile) => tile.id === 'restored-file')
if (
  !restoredFile ||
  restoredFile.filePath !== 'src/restored.ts' ||
  restoredFile.filePreview !== true ||
  restoredFile.fileDraft !== 'restored draft' ||
  restoredFile.fileVersion !== 'expected-sha-256' ||
  restoredFile.fileChangeToken !== 'metadata-token'
  || restoredFile.fileMarkdownView !== 'live'
) {
  throw new Error('canvas store must restore path-backed file tiles and their persisted state')
}

useCanvasStore.getState().updateTile('restored-file', { fileMarkdownView: 'preview' })
const changedView = useCanvasStore.getState().tiles.find((tile) => tile.id === 'restored-file')
if (changedView?.fileMarkdownView !== 'preview' || changedView.filePreview !== true) {
  throw new Error('changing the Markdown view must persist it without pinning a reusable file tile')
}

useCanvasStore.getState().updateTile('restored-file', {
  fileDraft: 'edited draft',
  filePreview: true,
})
const editedPreview = useCanvasStore.getState().tiles.find((tile) => tile.id === 'restored-file')
if (editedPreview?.filePreview !== false || editedPreview.fileDraft !== 'edited draft') {
  throw new Error('editing a preview through the store must pin it even when the patch includes a preview flag')
}

useCanvasStore.getState().updateTile('restored-file', {
  label: 'Renamed file',
  filePreview: true,
})
const renamedPreview = useCanvasStore.getState().tiles.find((tile) => tile.id === 'restored-file')
if (renamedPreview?.filePreview !== false || renamedPreview.label !== 'Renamed file') {
  throw new Error('renaming a preview through the store must pin it even when the patch includes a preview flag')
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
