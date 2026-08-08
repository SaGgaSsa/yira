import { normalizeCanvasStateForJson } from './canvasStateNormalization'
import { normalizeNoteKind, type CanvasState } from '@shared/types'

const state: CanvasState = {
  tiles: [
    { id: 'terminal', type: 'terminal', x: 0, y: 0, width: 10, height: 20, zIndex: 1, hideTitlebar: true } as CanvasState['tiles'][number] & { hideTitlebar: true },
    { id: 'note', type: 'note', x: 0, y: 0, width: 10, height: 20, zIndex: 2, noteKind: 'markdown', markdown: '# Hello', markdownView: 'preview' },
    { id: 'new-markdown', type: 'note', x: 0, y: 0, width: 10, height: 20, zIndex: 8, noteKind: 'markdown' },
    { id: 'legacy-note', type: 'note', x: 0, y: 0, width: 10, height: 20, zIndex: 7 },
    { id: 'browser', type: 'browser', x: 0, y: 0, width: 10, height: 20, zIndex: 3 },
    { id: 'kanban', type: 'kanban', x: 0, y: 0, width: 10, height: 20, zIndex: 4 } as unknown as CanvasState['tiles'][number],
    { id: 'timer', type: 'timer', x: 0, y: 0, width: 10, height: 20, zIndex: 5 },
    { id: 'legacy-files', type: 'files', x: 0, y: 0, width: 10, height: 20, zIndex: 6 } as unknown as CanvasState['tiles'][number],
    {
      id: 'files',
      type: 'files',
      x: 0,
      y: 0,
      width: 10,
      height: 20,
      zIndex: 9,
      filePath: 'src/main/index.ts',
      filePreview: true,
      fileDraft: 'const restored = true',
      fileVersion: 'expected-sha-256',
      fileChangeToken: 'mtime-size-token',
    } as unknown as CanvasState['tiles'][number],
  ],
  groups: [
    { id: 'keep', name: 'Keep', colorId: 'blue', tileIds: ['terminal', 'files'] },
    { id: 'drop', name: 'Drop', colorId: 'blue', tileIds: ['legacy-files'] },
  ],
  viewport: { tx: 0, ty: 0, zoom: 1 },
  nextZIndex: 9,
  focusedTileId: null,
  viewMode: 'canvas',
  fullviewActiveTileId: null,
  splitViewState: {
    leftTileIds: ['terminal', 'files'],
    rightTileIds: ['note', 'legacy-files'],
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
  ['new-markdown', { width: 900, height: 800 }],
  ['legacy-note', { width: 900, height: 800 }],
  ['browser', { width: 1800, height: 800 }],
  ['timer', { width: 900, height: 400 }],
  ['files', { width: 900, height: 500 }],
])

if (normalized.tiles.some((tile) => tile.id === 'kanban' || tile.id === 'legacy-files')) {
  throw new Error('legacy pathless files and kanban tiles must be dropped from normalized canvas JSON')
}
if (normalized.groups.length !== 1 || normalized.groups[0]?.tileIds.join(',') !== 'terminal,files') {
  throw new Error('canvas normalization must preserve groups for path-backed file tiles only')
}
if (!normalized.splitViewState?.leftTileIds.includes('files') || normalized.splitViewState?.rightTileIds.includes('legacy-files')) {
  throw new Error('canvas normalization must preserve only path-backed file references in split layout')
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

const markdownNote = normalized.tiles.find((tile) => tile.id === 'note')
if (markdownNote?.noteKind !== 'markdown' || markdownNote.markdown !== '# Hello' || markdownNote.markdownView !== 'preview') {
  throw new Error('Markdown note data and its selected view must persist through normalization')
}

const legacyNote = normalized.tiles.find((tile) => tile.id === 'legacy-note')
if (normalizeNoteKind(legacyNote?.noteKind) !== 'rich') {
  throw new Error('notes without a note kind must normalize as rich notes')
}

const newMarkdownNote = normalized.tiles.find((tile) => tile.id === 'new-markdown')
if (newMarkdownNote?.markdown !== '' || newMarkdownNote.markdownView !== 'live') {
  throw new Error('new Markdown notes must default to an empty source and split view')
}

const restoredFiles = normalized.tiles.find((tile) => tile.id === 'files')
if (
  restoredFiles?.filePath !== 'src/main/index.ts' ||
  restoredFiles.filePreview !== true ||
  restoredFiles.fileDraft !== 'const restored = true' ||
  restoredFiles.fileVersion !== 'expected-sha-256' ||
  restoredFiles.fileChangeToken !== 'mtime-size-token'
) {
  throw new Error('canvas normalization must restore every persisted files tile field')
}
