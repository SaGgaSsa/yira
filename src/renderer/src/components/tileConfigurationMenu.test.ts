import type { TileState } from '@shared/types'
import { buildTileConfigurationMenuItems } from './tileConfigurationMenu'

const terminalTile: TileState = {
  id: 'terminal-1',
  type: 'terminal',
  x: 0,
  y: 0,
  width: 900,
  height: 400,
  zIndex: 1,
  shellProfileId: 'bash',
}

const mutedTerminalTile: TileState = {
  ...terminalTile,
  id: 'muted-terminal-1',
  notificationsMuted: true,
}

const noteTile: TileState = {
  ...terminalTile,
  id: 'note-1',
  type: 'note',
}

function labelsFor(tile: TileState): string[] {
  return buildTileConfigurationMenuItems({
    tile,
    onEdit: () => {},
    onDuplicate: () => {},
    onRefresh: () => {},
    onToggleNotificationsMuted: () => {},
    onToggleLock: () => {},
  }).map((item) => item.label)
}

const terminalLabels = labelsFor(terminalTile)

for (const removedLabel of ['Focus', 'Close', 'Hide Titlebar', 'Show Titlebar']) {
  if (terminalLabels.includes(removedLabel)) {
    throw new Error(`configuration menu must not include ${removedLabel}`)
  }
}

for (const expectedLabel of ['Edit', 'Duplicate', 'Refresh', 'Mute Activity', 'Lock']) {
  if (!terminalLabels.includes(expectedLabel)) {
    throw new Error(`terminal configuration menu must include ${expectedLabel}`)
  }
}

const mutedTerminalLabels = labelsFor(mutedTerminalTile)
if (!mutedTerminalLabels.includes('Unmute Activity')) {
  throw new Error('terminal configuration menu must include unmute when muted')
}

const unmutedTerminalLabels = labelsFor({ ...mutedTerminalTile, notificationsMuted: false })
if (!unmutedTerminalLabels.includes('Mute Activity')) {
  throw new Error('terminal configuration menu must include mute when unmuted')
}

const noteLabels = labelsFor(noteTile)
if (!noteLabels.includes('Rename')) throw new Error('non-terminal configuration menu must use Rename')
if (noteLabels.includes('Duplicate')) throw new Error('non-terminal configuration menu must not include Duplicate')
if (noteLabels.includes('Mute Notifications')) throw new Error('non-notifying tiles must not include notification controls')
