import { buildDuplicateTerminalTile, insertDuplicateIntoSplitPanel } from './duplicateTerminalTile'
import type { SplitViewState, TileGroup, TileState } from '@shared/types'

const sourceTerminal: TileState = {
  id: 'terminal-1',
  type: 'terminal',
  x: 100,
  y: 120,
  width: 800,
  height: 500,
  zIndex: 3,
  shellProfileId: 'bash',
  startupCommand: 'npm run dev',
  label: 'API',
  hideTitlebar: true,
  radiusIndex: 2,
  locked: true,
  groupId: 'group-1',
}

const unlockedGroup: TileGroup = {
  id: 'group-1',
  name: 'Backend',
  colorId: 'blue',
  tileIds: ['terminal-1'],
  locked: false,
}

const lockedGroup: TileGroup = {
  ...unlockedGroup,
  locked: true,
}

const duplicate = buildDuplicateTerminalTile({
  source: sourceTerminal,
  groups: [unlockedGroup],
  id: 'terminal-2',
  position: { x: 940, y: 120 },
  zIndex: 8,
})

if (!duplicate) throw new Error('terminal duplicate must be created')
duplicate satisfies TileState

if (duplicate.type !== 'terminal') throw new Error('duplicate must stay a terminal')
if (duplicate.id !== 'terminal-2') throw new Error('duplicate must use a new id')
if (duplicate.shellProfileId !== 'bash') throw new Error('duplicate must copy shell profile')
if (duplicate.startupCommand !== 'npm run dev') throw new Error('duplicate must copy startup command')
if (duplicate.label !== 'API') throw new Error('duplicate must copy label')
if (duplicate.width !== 800 || duplicate.height !== 500) throw new Error('duplicate must copy dimensions')
if (!duplicate.hideTitlebar || duplicate.radiusIndex !== 2) throw new Error('duplicate must copy visual settings')
if (duplicate.locked !== false) throw new Error('duplicate must always be unlocked')
if (duplicate.groupId !== 'group-1') throw new Error('duplicate must stay in an unlocked group')

const duplicateFromLockedGroup = buildDuplicateTerminalTile({
  source: sourceTerminal,
  groups: [lockedGroup],
  id: 'terminal-3',
  position: { x: 940, y: 120 },
  zIndex: 9,
})

if (!duplicateFromLockedGroup) throw new Error('locked-group terminal duplicate must be created')
if (duplicateFromLockedGroup.groupId !== undefined) throw new Error('duplicate must leave locked groups')

const noteTile: TileState = {
  ...sourceTerminal,
  id: 'note-1',
  type: 'note',
}

if (buildDuplicateTerminalTile({
  source: noteTile,
  groups: [],
  id: 'note-2',
  position: { x: 200, y: 200 },
  zIndex: 10,
}) !== null) {
  throw new Error('non-terminal tiles must not duplicate')
}

const splitState: SplitViewState = {
  leftTileIds: ['terminal-1', 'note-1'],
  rightTileIds: ['terminal-4'],
  activeLeftTileId: 'terminal-1',
  activeRightTileId: 'terminal-4',
  focusedPanel: 'left',
}

const nextSplitState = insertDuplicateIntoSplitPanel(splitState, 'left', 'terminal-2')

if (nextSplitState.leftTileIds[0] !== 'terminal-2') throw new Error('duplicate must be first in target split panel')
if (nextSplitState.activeLeftTileId !== 'terminal-2') throw new Error('duplicate must become active in target split panel')
if (nextSplitState.focusedPanel !== 'left') throw new Error('duplicate must focus the target split panel')
if (nextSplitState.rightTileIds.length !== splitState.rightTileIds.length) throw new Error('other split panel must stay unchanged')
