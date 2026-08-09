import type { MenuItem } from '../components/ContextMenu'

export interface TerminalContextMenuInput {
  selectedText: string
  notificationsMuted: boolean
  linkUrl?: string
  onCopySelection: () => void
  onPaste: () => void
  onSelectAll: () => void
  onToggleNotifications: () => void
  onOpenBrowserTile?: (url: string) => void
  onOpenExternal: (url: string) => void
  onCopyLink: (url: string) => void
}

export function buildTerminalContextMenuItems(input: TerminalContextMenuInput): MenuItem[] {
  const linkItems: MenuItem[] = input.linkUrl ? [
    ...(input.onOpenBrowserTile ? [{
      label: 'Open in Browser tile',
      action: () => input.onOpenBrowserTile?.(input.linkUrl!),
    }] : []),
    {
      label: 'Open externally',
      action: () => input.onOpenExternal(input.linkUrl!),
    },
    {
      label: 'Copy URL',
      action: () => input.onCopyLink(input.linkUrl!),
    },
  ] : []

  if (linkItems.length > 0) return linkItems

  return [
    {
      label: 'Copy',
      disabled: !input.selectedText,
      action: input.onCopySelection,
    },
    {
      label: 'Paste',
      action: input.onPaste,
    },
    {
      label: 'Select All',
      action: input.onSelectAll,
    },
    {
      label: input.notificationsMuted ? 'Unmute Activity' : 'Mute Activity',
      action: input.onToggleNotifications,
    },
  ]
}
