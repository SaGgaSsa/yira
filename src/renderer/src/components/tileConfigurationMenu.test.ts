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

function labelsFor(tile: TileState, onPinSession?: (tile: TileState) => void): string[] {
  return buildTileConfigurationMenuItems({
    tile,
    onEdit: () => {},
    onDuplicate: () => {},
    onPinSession,
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

const agentSessionTile: TileState = {
  ...terminalTile,
  id: 'agent-session-1',
  agent: { provider: 'claude', surface: 'agents-view' },
}

const agentSessionLabels = labelsFor(agentSessionTile)
if (agentSessionLabels.includes('Edit')) throw new Error('agent session configuration menu must not include Edit')
if (agentSessionLabels.includes('Duplicate')) throw new Error('agent session configuration menu must not include Duplicate')
if (agentSessionLabels.includes('Keep as agent tile')) throw new Error('agent session menu must hide pin without onPinSession')
for (const expectedLabel of ['Refresh', 'Mute Activity', 'Lock']) {
  if (!agentSessionLabels.includes(expectedLabel)) {
    throw new Error(`agent session configuration menu must include ${expectedLabel}`)
  }
}

const pinnableSessionLabels = labelsFor(agentSessionTile, () => {})
if (pinnableSessionLabels[0] !== 'Keep as agent tile') {
  throw new Error('agent session configuration menu must pin first')
}
if (!pinnableSessionLabels.includes('Refresh')) {
  throw new Error('agent session configuration menu must keep Refresh when pinning')
}
