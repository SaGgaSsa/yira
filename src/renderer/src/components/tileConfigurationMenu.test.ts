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

const timerTile: TileState = {
  ...terminalTile,
  id: 'timer-1',
  type: 'timer',
}

const boardTile: TileState = {
  ...terminalTile,
  id: 'board-1',
  type: 'kanban',
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

for (const expectedLabel of ['Edit', 'Duplicate', 'Refresh', 'Mute Notifications', 'Lock']) {
  if (!terminalLabels.includes(expectedLabel)) {
    throw new Error(`terminal configuration menu must include ${expectedLabel}`)
  }
}

const mutedTimerLabels = labelsFor({ ...timerTile, notificationsMuted: true })
if (!mutedTimerLabels.includes('Unmute Notifications')) {
  throw new Error('timer configuration menu must include unmute when muted')
}

const boardLabels = labelsFor(boardTile)
if (!boardLabels.includes('Rename')) throw new Error('non-terminal configuration menu must use Rename')
if (boardLabels.includes('Duplicate')) throw new Error('non-terminal configuration menu must not include Duplicate')
if (boardLabels.includes('Mute Notifications')) throw new Error('non-notifying tiles must not include notification controls')
