import { Bell, BellOff, CopyPlus, Lock, Pencil, Pin, RefreshCw, LockOpen } from 'lucide-react'
import type { TileState } from '@shared/types'
import { isAgentSessionTile } from '@/utils/agentSessionTiles'
import type { MenuItem } from './ContextMenu'

interface TileConfigurationMenuOptions {
  translate?: (key: string) => string
  tile: TileState
  onEdit: (tile: TileState) => void
  onDuplicate?: (tile: TileState) => void
  onPinSession?: (tile: TileState) => void
  onRefresh: (tile: TileState) => void | Promise<void>
  onToggleNotificationsMuted: (tile: TileState) => void
  onToggleLock: (tile: TileState) => void
  onBeforeAction?: () => void
}

function runTileAction(
  tile: TileState,
  action: (tile: TileState) => void | Promise<void>,
  onBeforeAction?: () => void,
): () => void {
  return () => {
    onBeforeAction?.()
    void action(tile)
  }
}

export function buildTileConfigurationMenuItems({
  tile,
  onEdit,
  onDuplicate,
  onPinSession,
  onRefresh,
  onToggleNotificationsMuted,
  onToggleLock,
  onBeforeAction,
  translate,
}: TileConfigurationMenuOptions): MenuItem[] {
  const label = (key: string, fallback: string): string => translate?.(key) ?? fallback
  const agentSessionTile = isAgentSessionTile(tile)
  return [
    ...(agentSessionTile
      ? []
      : [{
          label: tile.type === 'terminal' ? label('ui.editAction', 'Edit') : label('ui.renameAction', 'Rename'),
          icon: Pencil,
          action: runTileAction(tile, onEdit, onBeforeAction),
        }]),
    ...(!agentSessionTile && tile.type === 'terminal' && onDuplicate
      ? [{
          label: label('ui.duplicateAction', 'Duplicate'),
          icon: CopyPlus,
          action: runTileAction(tile, onDuplicate, onBeforeAction),
        }]
      : []),
    ...(agentSessionTile && onPinSession
      ? [{
          label: label('agentsView.pinSession', 'Keep as agent tile'),
          icon: Pin,
          action: runTileAction(tile, onPinSession, onBeforeAction),
        }]
      : []),
    {
      label: label('ui.refreshAction', 'Refresh'),
      icon: RefreshCw,
      action: runTileAction(tile, onRefresh, onBeforeAction),
    },
    ...(tile.type === 'terminal'
      ? [{
          label: tile.notificationsMuted ? label('ui.unmuteActivity', 'Unmute Activity') : label('ui.muteActivity', 'Mute Activity'),
          icon: tile.notificationsMuted ? Bell : BellOff,
          action: runTileAction(tile, onToggleNotificationsMuted, onBeforeAction),
        }]
      : []),
    {
      label: tile.locked ? label('ui.unlock', 'Unlock') : label('ui.lock', 'Lock'),
      icon: tile.locked ? LockOpen : Lock,
      action: runTileAction(tile, onToggleLock, onBeforeAction),
    },
  ]
}
