import type { SplitPanelId, SplitViewState, TileGroup, TileState } from '@shared/types'

interface DuplicateTerminalTileOptions {
  source: TileState
  groups: TileGroup[]
  id: string
  position: Pick<TileState, 'x' | 'y'>
  zIndex: number
}

export function buildDuplicateTerminalTile({
  source,
  groups,
  id,
  position,
  zIndex,
}: DuplicateTerminalTileOptions): TileState | null {
  if (source.type !== 'terminal') return null

  const sourceGroup = source.groupId
    ? groups.find((group) => group.id === source.groupId)
    : null
  const targetGroupId = sourceGroup && !sourceGroup.locked ? sourceGroup.id : undefined

  return {
    id,
    type: 'terminal',
    x: position.x,
    y: position.y,
    width: source.width,
    height: source.height,
    zIndex,
    shellProfileId: source.shellProfileId,
    terminalConnection: source.terminalConnection,
    startupCommand: source.startupCommand,
    label: source.label,
    radiusIndex: source.radiusIndex,
    locked: false,
    groupId: targetGroupId,
  }
}

export function insertDuplicateIntoSplitPanel(
  splitViewState: SplitViewState,
  panel: SplitPanelId,
  tileId: string,
): SplitViewState {
  const leftTileIds = splitViewState.leftTileIds.filter((id) => id !== tileId)
  const rightTileIds = splitViewState.rightTileIds.filter((id) => id !== tileId)

  if (panel === 'left') {
    return {
      ...splitViewState,
      leftTileIds: [tileId, ...leftTileIds],
      rightTileIds,
      activeLeftTileId: tileId,
      focusedPanel: 'left',
    }
  }

  return {
    ...splitViewState,
    leftTileIds,
    rightTileIds: [tileId, ...rightTileIds],
    activeRightTileId: tileId,
    focusedPanel: 'right',
  }
}
