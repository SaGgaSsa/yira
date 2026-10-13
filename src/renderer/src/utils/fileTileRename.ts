import type { TileState } from '@shared/types'
import { deriveFileTileTitle } from './fileTileLifecycle'

export interface FileTileRenameUpdate {
  tileId: string
  patch: Pick<TileState, 'filePath' | 'label'>
}

// Comparison is exact on purpose: a case-only rename must still remap tiles.
function isSameOrDescendant(filePath: string, entryPath: string): boolean {
  return filePath === entryPath || filePath.startsWith(`${entryPath}/`)
}

export function planFileTileRenames(
  tiles: readonly TileState[],
  oldPath: string,
  newPath: string,
  diffSuffix: (tile: TileState) => string = () => '',
): FileTileRenameUpdate[] {
  const updates: FileTileRenameUpdate[] = []
  for (const tile of tiles) {
    if (tile.type !== 'files' || !tile.filePath || !isSameOrDescendant(tile.filePath, oldPath)) continue
    const filePath = newPath + tile.filePath.slice(oldPath.length)
    const label = deriveFileTileTitle(filePath) + (tile.fileDiff ? diffSuffix(tile) : '')
    updates.push({ tileId: tile.id, patch: { filePath, label } })
  }
  return updates
}

// Tiles with unsaved edits stay open so the user can still save elsewhere or copy the content.
export function planFileTileClosures(tiles: readonly TileState[], trashedPath: string): string[] {
  return tiles
    .filter((tile) => (
      tile.type === 'files' &&
      Boolean(tile.filePath) &&
      isSameOrDescendant(tile.filePath as string, trashedPath) &&
      tile.fileDraft === undefined
    ))
    .map((tile) => tile.id)
}
