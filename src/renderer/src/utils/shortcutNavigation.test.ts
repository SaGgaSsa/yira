import {
  focusSplitPanelByShortcut,
  switchFocusViewTabByShortcut,
  switchSplitPanelTabByShortcut,
} from './shortcutNavigation'
import type { SplitViewState } from '@shared/types'

const splitState: SplitViewState = {
  leftTileIds: ['left-a', 'left-b', 'left-c'],
  rightTileIds: ['right-a', 'right-b'],
  activeLeftTileId: 'left-b',
  activeRightTileId: 'right-a',
  focusedPanel: 'left',
  orientation: 'vertical',
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const focusedLeft = focusSplitPanelByShortcut({ ...splitState, focusedPanel: 'right' }, 'left')
assert(focusedLeft.focusedPanel === 'left', 'Ctrl+Alt+ArrowLeft must focus the left split panel')

const focusedRight = focusSplitPanelByShortcut(splitState, 'right')
assert(focusedRight.focusedPanel === 'right', 'Ctrl+Alt+ArrowRight must focus the right split panel')

const nextLeftTab = switchSplitPanelTabByShortcut(splitState, 'next')
assert(nextLeftTab.activeLeftTileId === 'left-c', 'next split tab must activate the next tile in the focused panel')
assert(nextLeftTab.focusedPanel === 'left', 'split tab navigation must keep the focused panel')
assert(nextLeftTab.leftTileIds.join(',') === splitState.leftTileIds.join(','), 'split tab navigation must not reorder tabs')

const previousRightTab = switchSplitPanelTabByShortcut({ ...splitState, focusedPanel: 'right', activeRightTileId: 'right-b' }, 'previous')
assert(previousRightTab.activeRightTileId === 'right-a', 'previous split tab must activate the previous tile in the focused panel')

const firstSplitState = { ...splitState, activeLeftTileId: 'left-a' }
const firstSplitTab = switchSplitPanelTabByShortcut(firstSplitState, 'previous')
assert(firstSplitTab === firstSplitState, 'previous split tab at the first tab must preserve the current state')
assert(firstSplitTab.activeLeftTileId === 'left-a', 'previous split tab at the first tab must be a no-op')

const lastSplitState = { ...splitState, activeLeftTileId: 'left-c' }
const lastSplitTab = switchSplitPanelTabByShortcut(lastSplitState, 'next')
assert(lastSplitTab === lastSplitState, 'next split tab at the last tab must preserve the current state')
assert(lastSplitTab.activeLeftTileId === 'left-c', 'next split tab at the last tab must be a no-op')

const focusTabs = ['focus-a', 'focus-b', 'focus-c']
assert(
  switchFocusViewTabByShortcut(focusTabs, 'focus-b', 'previous') === 'focus-a',
  'previous Focus View tab must activate the previous tab',
)
assert(
  switchFocusViewTabByShortcut(focusTabs, 'focus-b', 'next') === 'focus-c',
  'next Focus View tab must activate the next tab',
)
assert(
  switchFocusViewTabByShortcut(focusTabs, 'focus-a', 'previous') === 'focus-a',
  'previous Focus View tab at the first tab must be a no-op',
)
assert(
  switchFocusViewTabByShortcut(focusTabs, 'focus-c', 'next') === 'focus-c',
  'next Focus View tab at the last tab must be a no-op',
)
