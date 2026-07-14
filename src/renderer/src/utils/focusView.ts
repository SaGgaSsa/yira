import type { ViewMode } from '@shared/types'

export function shouldAutoFocusTile(
  viewMode: ViewMode,
  tileId: string,
  fullviewActiveTileId: string | null,
  isVisible: boolean,
): boolean {
  return viewMode === 'fullview' && isVisible && tileId === fullviewActiveTileId
}
