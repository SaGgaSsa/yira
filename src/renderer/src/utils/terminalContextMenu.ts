import type { MenuItem } from '../components/ContextMenu'
import type { FileTileOpenOptions } from '@shared/types'

export type TerminalLinkTarget =
  | { kind: 'web'; value: string; activate?: () => void }
  | { kind: 'markdown'; value: string; activate?: () => void }
  | { kind: 'source'; value: string; activate?: () => void }

export interface TerminalContextMenuInput {
  translate?: (key: string) => string
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
  const label = (key: string, fallback: string): string => input.translate?.(key) ?? fallback
  const linkTarget = input.linkTarget
  const linkItems: MenuItem[] = linkTarget?.kind === 'source'
    ? [
        { label: label('ui.openFileTile', 'Open in file tile'), action: () => { linkTarget.activate?.() } },
        { label: label('ui.copyPath', 'Copy path'), action: () => input.onCopyLink(linkTarget.value) },
      ]
    : linkTarget?.kind === 'markdown'
    ? [
        {
          label: label('ui.openMarkdownTile', 'Open in Markdown tile'),
          action: () => {
            void input.onOpenFileTile?.(linkTarget.value, { markdownView: 'preview' })
          },
        },
        {
          label: label('ui.copyPath', 'Copy path'),
          action: () => input.onCopyLink(linkTarget.value),
        },
      ]
    : linkTarget?.kind === 'web'
      ? [
          ...(input.onOpenBrowserTile ? [{
            label: label('ui.openBrowserTile', 'Open in Browser tile'),
            action: () => input.onOpenBrowserTile?.(linkTarget.value),
          }] : []),
          {
            label: label('ui.openExternally', 'Open externally'),
            action: () => input.onOpenExternal(linkTarget.value),
          },
          {
            label: label('ui.copyUrl', 'Copy URL'),
            action: () => input.onCopyLink(linkTarget.value),
          },
        ]
      : []

  if (linkItems.length > 0) return linkItems

  return [
    {
      label: label('ui.copyText', 'Copy'),
      disabled: !input.selectedText,
      action: input.onCopySelection,
    },
    {
      label: label('ui.paste', 'Paste'),
      action: input.onPaste,
    },
    {
      label: label('ui.selectAll', 'Select All'),
      action: input.onSelectAll,
    },
    {
      label: input.notificationsMuted ? label('ui.unmuteActivity', 'Unmute Activity') : label('ui.muteActivity', 'Mute Activity'),
      action: input.onToggleNotifications,
    },
  ]
}
