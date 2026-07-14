import type { TileState } from '@shared/types'

export function refreshGridTileContent(
  refreshKeys: Record<string, number>,
  tiles: Array<Pick<TileState, 'id' | 'type' | 'floating'>>,
): Record<string, number> {
  const remainingTileIds = new Set(tiles.map((tile) => tile.id))
  const nextRefreshKeys = Object.fromEntries(
    Object.entries(refreshKeys).filter(([tileId]) => remainingTileIds.has(tileId)),
  )

  for (const tile of tiles) {
    if (tile.type !== 'terminal' || tile.floating?.detached) continue
    nextRefreshKeys[tile.id] = (nextRefreshKeys[tile.id] ?? 0) + 1
  }

  return nextRefreshKeys
}
