import { buildDuplicateTerminalTile, insertDuplicateIntoSplitPanel } from './duplicateTerminalTile'
import type { SplitViewState, TileState } from '@shared/types'

const sourceTerminal: TileState = {
  id: 'terminal-1',
  type: 'terminal',
  x: 100,
  y: 120,
  width: 800,
  height: 500,
  zIndex: 3,
  shellProfileId: 'bash',
  terminalConnection: 'remote-ssh',
  startupCommand: 'npm run dev',
  label: 'API',
  radiusIndex: 2,
  locked: true,
}

const duplicate = buildDuplicateTerminalTile({
  source: sourceTerminal,
  id: 'terminal-2',
  position: { x: 940, y: 120 },
  zIndex: 8,
})

if (!duplicate) throw new Error('terminal duplicate must be created')
duplicate satisfies TileState

if (duplicate.type !== 'terminal') throw new Error('duplicate must stay a terminal')
if (duplicate.id !== 'terminal-2') throw new Error('duplicate must use a new id')
if (duplicate.shellProfileId !== 'bash') throw new Error('duplicate must copy shell profile')
if (duplicate.terminalConnection !== 'remote-ssh') throw new Error('duplicate must stay remote when source is remote')
if (duplicate.startupCommand !== 'npm run dev') throw new Error('duplicate must copy startup command')
if (duplicate.label !== 'API') throw new Error('duplicate must copy label')
if (duplicate.width !== 800 || duplicate.height !== 500) throw new Error('duplicate must copy dimensions')
if (duplicate.radiusIndex !== 2) throw new Error('duplicate must copy visual settings')
if (duplicate.locked !== false) throw new Error('duplicate must always be unlocked')

const noteTile: TileState = {
  ...sourceTerminal,
  id: 'note-1',
  type: 'note',
}

if (buildDuplicateTerminalTile({
  source: noteTile,
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
  orientation: 'vertical',
}

const nextSplitState = insertDuplicateIntoSplitPanel(splitState, 'left', 'terminal-2')

if (nextSplitState.leftTileIds[0] !== 'terminal-2') throw new Error('duplicate must be first in target split panel')
if (nextSplitState.activeLeftTileId !== 'terminal-2') throw new Error('duplicate must become active in target split panel')
if (nextSplitState.focusedPanel !== 'left') throw new Error('duplicate must focus the target split panel')
if (nextSplitState.rightTileIds.length !== splitState.rightTileIds.length) throw new Error('other split panel must stay unchanged')
