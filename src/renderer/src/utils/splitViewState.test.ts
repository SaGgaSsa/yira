import {
  canDropTileInSplit,
  normalizeSplitOrientation,
  placeTileBeside,
  placeTilesSideBySide,
  showTileInSplitPanel,
  toggleSplitOrientation,
} from './splitViewState'
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

if (!canDropTileInSplit('splitview', 'agent-1', 'terminal-1')) {
  throw new Error('split view must accept any tile drop')
}

if (!canDropTileInSplit('splitview', 'agent-1', null)) {
  throw new Error('split view must accept a tile drop without an active fullview tile')
}

if (canDropTileInSplit('fullview', 'terminal-1', 'terminal-1')) {
  throw new Error('focus view must reject the tile already shown')
}

if (canDropTileInSplit('fullview', 'agent-1', null)) {
  throw new Error('focus view must reject a drop without an active tile to pair with')
}

if (!canDropTileInSplit('fullview', 'agent-1', 'terminal-1')) {
  throw new Error('focus view must accept a different tile to pair with')
}

if (canDropTileInSplit('gridview', 'agent-1', 'terminal-1') || canDropTileInSplit('board', 'agent-1', 'terminal-1')) {
  throw new Error('only focus and split views can accept tile drops')
}

const besideLeft = placeTileBeside(verticalState, 'agent-1', 'terminal-2', 'left')

if (besideLeft.activeLeftTileId !== 'agent-1' || besideLeft.activeRightTileId !== 'terminal-2') {
  throw new Error('left placement must put the tile in the left panel opposite the given tile')
}

if (besideLeft.focusedPanel !== 'left' || besideLeft.orientation !== 'vertical') {
  throw new Error('left placement must focus the left panel and keep the orientation')
}

const besideRight = placeTileBeside(verticalState, 'agent-1', 'terminal-1', 'right')

if (besideRight.activeLeftTileId !== 'terminal-1' || besideRight.activeRightTileId !== 'agent-1') {
  throw new Error('right placement must put the tile in the right panel opposite the given tile')
}

if (besideRight.focusedPanel !== 'right') {
  throw new Error('right placement must focus the right panel')
}

const alreadyInPanel = showTileInSplitPanel({
  ...verticalState,
  leftTileIds: ['terminal-1', 'note-1'],
  rightTileIds: ['terminal-2'],
  activeLeftTileId: 'terminal-1',
}, 'note-1', 'left')

if (alreadyInPanel.leftTileIds.join(',') !== 'note-1,terminal-1' || alreadyInPanel.activeLeftTileId !== 'note-1') {
  throw new Error('showing a tile already in the panel must move it to the front and activate it')
}

if (alreadyInPanel.rightTileIds.join(',') !== 'terminal-2' || alreadyInPanel.activeRightTileId !== 'terminal-2') {
  throw new Error('showing a tile already in the panel must not change the other panel')
}

if (alreadyInPanel.focusedPanel !== 'left') {
  throw new Error('showing a tile must focus its panel')
}

const movedFromOtherPanel = showTileInSplitPanel({
  ...verticalState,
  leftTileIds: ['terminal-1'],
  rightTileIds: ['terminal-2', 'agent-1'],
  activeLeftTileId: 'terminal-1',
  activeRightTileId: 'agent-1',
}, 'terminal-2', 'left')

if (movedFromOtherPanel.leftTileIds.join(',') !== 'terminal-2,terminal-1' || movedFromOtherPanel.activeLeftTileId !== 'terminal-2') {
  throw new Error('showing a tile from the other panel must move it to the front and activate it')
}

if (movedFromOtherPanel.rightTileIds.join(',') !== 'agent-1' || movedFromOtherPanel.activeRightTileId !== 'agent-1') {
  throw new Error('showing the active tile of the other panel must activate the first remaining tile')
}

if (movedFromOtherPanel.focusedPanel !== 'left') {
  throw new Error('showing a tile from the other panel must focus its panel')
}

const swapped = showTileInSplitPanel(verticalState, 'terminal-2', 'left')

if (swapped.leftTileIds.join(',') !== 'terminal-2' || swapped.rightTileIds.join(',') !== 'terminal-1') {
  throw new Error('showing a lone tile from the other panel must trade places with the active tile')
}

if (swapped.activeLeftTileId !== 'terminal-2' || swapped.activeRightTileId !== 'terminal-1' || swapped.focusedPanel !== 'left') {
  throw new Error('swapping a lone tile must activate both tiles and focus the requested panel')
}

if (swapped.leftTileIds.length === 0 || swapped.rightTileIds.length === 0) {
  throw new Error('swapping a lone tile must not leave a panel empty')
}

const addedTile = showTileInSplitPanel(verticalState, 'agent-1', 'right')

if (addedTile.rightTileIds.join(',') !== 'agent-1,terminal-2' || addedTile.activeRightTileId !== 'agent-1') {
  throw new Error('showing a new tile must add it to the front of the panel and activate it')
}

if (addedTile.leftTileIds.join(',') !== 'terminal-1' || addedTile.activeLeftTileId !== 'terminal-1') {
  throw new Error('showing a new tile must not change the other panel')
}

if (addedTile.focusedPanel !== 'right' || addedTile.orientation !== 'vertical') {
  throw new Error('showing a new tile must focus its panel and keep the orientation')
}
