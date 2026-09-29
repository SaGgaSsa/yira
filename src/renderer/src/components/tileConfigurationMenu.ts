import { Bell, BellOff, CopyPlus, Lock, Pencil, RefreshCw, Unlock } from 'lucide-react'
import type { TileState } from '@shared/types'
import type { MenuItem } from './ContextMenu'

interface TileConfigurationMenuOptions {
  translate?: (key: string) => string
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
  translate,
}: TileConfigurationMenuOptions): MenuItem[] {
  const label = (key: string, fallback: string): string => translate?.(key) ?? fallback
  return [
    {
      label: tile.type === 'terminal' ? label('ui.editAction', 'Edit') : label('ui.renameAction', 'Rename'),
      icon: Pencil,
      action: runTileAction(tile, onEdit, onBeforeAction),
    },
    ...(tile.type === 'terminal' && onDuplicate
      ? [{
          label: label('ui.duplicateAction', 'Duplicate'),
          icon: CopyPlus,
          action: runTileAction(tile, onDuplicate, onBeforeAction),
        }]
      : []),
    {
      label: label('ui.refreshAction', 'Refresh'),
      icon: RefreshCw,
      action: runTileAction(tile, onRefresh, onBeforeAction),
    },
    ...(tile.type === 'terminal' || tile.type === 'timer'
      ? [{
          label: tile.type === 'terminal'
            ? tile.notificationsMuted ? label('ui.unmuteActivity', 'Unmute Activity') : label('ui.muteActivity', 'Mute Activity')
            : tile.notificationsMuted ? label('ui.unmuteNotifications', 'Unmute Notifications') : label('ui.muteNotifications', 'Mute Notifications'),
          icon: tile.notificationsMuted ? Bell : BellOff,
          action: runTileAction(tile, onToggleNotificationsMuted, onBeforeAction),
        }]
      : []),
    {
      label: tile.locked ? label('ui.unlock', 'Unlock') : label('ui.lock', 'Lock'),
      icon: tile.locked ? Unlock : Lock,
      action: runTileAction(tile, onToggleLock, onBeforeAction),
    },
  ]
}
