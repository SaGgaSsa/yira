import type { MenuItem } from '../components/ContextMenu'
import type { FileTileOpenOptions } from '@shared/types'

export type TerminalLinkTarget =
  | { kind: 'web'; value: string }
  | { kind: 'markdown'; value: string }

export interface TerminalContextMenuInput {
  selectedText: string
  notificationsMuted: boolean
  linkTarget?: TerminalLinkTarget
  onCopySelection: () => void
  onPaste: () => void
  onSelectAll: () => void
  onToggleNotifications: () => void
  onOpenBrowserTile?: (url: string) => void
  onOpenFileTile?: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
  onOpenExternal: (url: string) => void
  onCopyLink: (url: string) => void
}

export function buildTerminalContextMenuItems(input: TerminalContextMenuInput): MenuItem[] {
  const linkTarget = input.linkTarget
  const linkItems: MenuItem[] = linkTarget?.kind === 'markdown'
    ? [
        {
          label: 'Open in Markdown tile',
          action: () => {
            void input.onOpenFileTile?.(linkTarget.value, { markdownView: 'preview' })
          },
        },
        {
          label: 'Copy path',
          action: () => input.onCopyLink(linkTarget.value),
        },
      ]
    : linkTarget?.kind === 'web'
      ? [
          ...(input.onOpenBrowserTile ? [{
            label: 'Open in Browser tile',
            action: () => input.onOpenBrowserTile?.(linkTarget.value),
          }] : []),
          {
            label: 'Open externally',
            action: () => input.onOpenExternal(linkTarget.value),
          },
          {
            label: 'Copy URL',
            action: () => input.onCopyLink(linkTarget.value),
          },
        ]
      : []

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
