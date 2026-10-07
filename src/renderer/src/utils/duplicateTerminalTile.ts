import type { SplitPanelId, SplitViewState, TileState } from '@shared/types'

interface DuplicateTerminalTileOptions {
  source: TileState
  id: string
  position: Pick<TileState, 'x' | 'y'>
  zIndex: number
}

export function buildDuplicateTerminalTile({
  source,
  id,
  position,
  zIndex,
}: DuplicateTerminalTileOptions): TileState | null {
  if (source.type !== 'terminal') return null

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
