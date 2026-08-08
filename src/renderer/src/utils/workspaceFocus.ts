import type { TileState } from '@shared/types'

export type WorkspaceFocusTile = Pick<TileState, 'id' | 'floating'>

export function resolveWorkspaceFocusTarget(
  tiles: readonly WorkspaceFocusTile[],
  rememberedTileId: string | null | undefined,
): string | null {
  if (!rememberedTileId) return null

  const rememberedTile = tiles.find((tile) => tile.id === rememberedTileId)
  if (!rememberedTile || rememberedTile.floating?.detached === true) return null

  return rememberedTile.id
}
