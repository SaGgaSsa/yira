import type { TileState } from '@shared/types'
import { getAttachedTiles } from '@shared/floatingTiles'

export function shouldKeepSidebarOpenForWorkspace(tiles: TileState[]): boolean {
  return getAttachedTiles(tiles).length === 0
}
