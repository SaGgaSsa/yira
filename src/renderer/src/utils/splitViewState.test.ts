import { normalizeSplitOrientation, toggleSplitOrientation } from './splitViewState'
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
