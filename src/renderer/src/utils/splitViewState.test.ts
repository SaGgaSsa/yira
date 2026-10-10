import { normalizeSplitOrientation, placeTilesSideBySide, toggleSplitOrientation } from './splitViewState'
import type { SplitViewState } from '@shared/types'

const verticalState: SplitViewState = {
  leftTileIds: ['terminal-1'],
  rightTileIds: ['terminal-2'],
  activeLeftTileId: 'terminal-1',
  activeRightTileId: 'terminal-2',
  focusedPanel: 'right',
  orientation: 'vertical',
}

if (normalizeSplitOrientation(undefined) !== 'vertical') {
  throw new Error('missing split orientation must default to vertical')
}

if (normalizeSplitOrientation('horizontal') !== 'horizontal') {
  throw new Error('horizontal split orientation must be accepted')
}

if (normalizeSplitOrientation('diagonal') !== 'vertical') {
  throw new Error('invalid split orientation must default to vertical')
}

if (toggleSplitOrientation(verticalState.orientation) !== 'horizontal') {
  throw new Error('vertical split orientation must toggle to horizontal')
}

if (toggleSplitOrientation('horizontal') !== 'vertical') {
  throw new Error('horizontal split orientation must toggle to vertical')
}

const sideBySide = placeTilesSideBySide(
  { ...verticalState, leftTileIds: ['terminal-2', 'note-1'], rightTileIds: ['terminal-1'], focusedPanel: 'left' },
  'terminal-1',
  'agent-1',
)

if (sideBySide.leftTileIds.join(',') !== 'terminal-1,terminal-2,note-1') {
  throw new Error('side-by-side placement must put the left tile first and keep other left tabs')
}

if (sideBySide.rightTileIds.join(',') !== 'agent-1') {
  throw new Error('side-by-side placement must move the left tile out of the right panel')
}

if (sideBySide.activeLeftTileId !== 'terminal-1' || sideBySide.activeRightTileId !== 'agent-1' || sideBySide.focusedPanel !== 'right') {
  throw new Error('side-by-side placement must activate both tiles and focus the right panel')
}
