import type { TileState } from '@shared/types'

export function shouldKeepSidebarOpenForWorkspace(tiles: TileState[]): boolean {
  return tiles.length === 0
}
