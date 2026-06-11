import { Bell, BellOff, CopyPlus, Lock, Pencil, RefreshCw, Unlock } from 'lucide-react'
import type { TileState } from '@shared/types'
import type { MenuItem } from './ContextMenu'

interface TileConfigurationMenuOptions {
  tile: TileState
  onEdit: (tile: TileState) => void
  onDuplicate?: (tile: TileState) => void
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
  onRefresh,
  onToggleNotificationsMuted,
  onToggleLock,
  onBeforeAction,
}: TileConfigurationMenuOptions): MenuItem[] {
  return [
    {
      label: tile.type === 'terminal' ? 'Edit' : 'Rename',
      icon: Pencil,
      action: runTileAction(tile, onEdit, onBeforeAction),
    },
    ...(tile.type === 'terminal' && onDuplicate
      ? [{
          label: 'Duplicate',
          icon: CopyPlus,
          action: runTileAction(tile, onDuplicate, onBeforeAction),
        }]
      : []),
    {
      label: 'Refresh',
      icon: RefreshCw,
      action: runTileAction(tile, onRefresh, onBeforeAction),
    },
    ...(tile.type === 'terminal' || tile.type === 'timer'
      ? [{
          label: tile.notificationsMuted ? 'Unmute Notifications' : 'Mute Notifications',
          icon: tile.notificationsMuted ? Bell : BellOff,
          action: runTileAction(tile, onToggleNotificationsMuted, onBeforeAction),
        }]
      : []),
    {
      label: tile.locked ? 'Unlock' : 'Lock',
      icon: tile.locked ? Unlock : Lock,
      action: runTileAction(tile, onToggleLock, onBeforeAction),
    },
  ]
}
