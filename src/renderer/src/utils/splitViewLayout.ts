import type { SplitOrientation, SplitPanelId } from '@shared/types'

export const SPLIT_TAB_STRIP_HEIGHT_PX = 56

interface SplitPanelFrame {
  left: number | string
  top: number | string
  width: string
  height: string
}

export function getSplitPanelFrame(orientation: SplitOrientation, panel: SplitPanelId): SplitPanelFrame {
  if (orientation === 'horizontal') {
    return {
      left: 0,
      top: panel === 'left' ? SPLIT_TAB_STRIP_HEIGHT_PX : `calc(50% + ${SPLIT_TAB_STRIP_HEIGHT_PX}px)`,
      width: '100%',
      height: `calc(50% - ${SPLIT_TAB_STRIP_HEIGHT_PX}px)`,
    }
  }

  return {
    left: panel === 'left' ? 0 : '50%',
    top: 0,
    width: '50%',
    height: '100%',
  }
}
