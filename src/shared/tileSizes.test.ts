import {
  NOTE_TILE_DEFAULT_HEIGHT,
  NOTE_TILE_DEFAULT_WIDTH,
  NOTE_TILE_MIN_HEIGHT,
  NOTE_TILE_MIN_WIDTH,
  getTileSizePreset,
  normalizeTileSize,
} from './types'
import type { TileType } from './types'

const expected: Record<TileType, { defaultWidth: number; defaultHeight: number; minWidth: number; minHeight: number }> = {
  terminal: { defaultWidth: 900, defaultHeight: 400, minWidth: 900, minHeight: 400 },
  note: { defaultWidth: 900, defaultHeight: 800, minWidth: 900, minHeight: 800 },
  browser: { defaultWidth: 1800, defaultHeight: 800, minWidth: 1800, minHeight: 800 },
  kanban: { defaultWidth: 1800, defaultHeight: 800, minWidth: 1800, minHeight: 800 },
  timer: { defaultWidth: 900, defaultHeight: 400, minWidth: 900, minHeight: 400 },
  files: { defaultWidth: 900, defaultHeight: 400, minWidth: 900, minHeight: 400 },
}

for (const [type, preset] of Object.entries(expected) as Array<[TileType, typeof expected[TileType]]>) {
  const actual = getTileSizePreset(type)
  if (actual.defaultWidth !== preset.defaultWidth || actual.defaultHeight !== preset.defaultHeight) {
    throw new Error(`${type} default size must be ${preset.defaultWidth}x${preset.defaultHeight}, got ${actual.defaultWidth}x${actual.defaultHeight}`)
  }
  if (actual.minWidth !== preset.minWidth || actual.minHeight !== preset.minHeight) {
    throw new Error(`${type} minimum size must be ${preset.minWidth}x${preset.minHeight}, got ${actual.minWidth}x${actual.minHeight}`)
  }
}

if (NOTE_TILE_DEFAULT_WIDTH !== 900 || NOTE_TILE_DEFAULT_HEIGHT !== 800) {
  throw new Error('note legacy default constants must derive to 900x800')
}

if (NOTE_TILE_MIN_WIDTH !== 900 || NOTE_TILE_MIN_HEIGHT !== 800) {
  throw new Error('note legacy minimum constants must derive to 900x800')
}

const smallNote = normalizeTileSize('note', { width: 100, height: 100 })
if (smallNote.width !== 900 || smallNote.height !== 800) {
  throw new Error(`note size must normalize to 900x800, got ${smallNote.width}x${smallNote.height}`)
}

const largeNote = normalizeTileSize('note', { width: 2400, height: 1200 })
if (largeNote.width !== 2400 || largeNote.height !== 1200) {
  throw new Error(`note size must not be capped, got ${largeNote.width}x${largeNote.height}`)
}

const smallBoard = normalizeTileSize('kanban', { width: 100, height: 100 })
if (smallBoard.width !== 1800 || smallBoard.height !== 800) {
  throw new Error(`board size must normalize to 1800x800, got ${smallBoard.width}x${smallBoard.height}`)
}
