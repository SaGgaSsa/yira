import { buildTerminalContextMenuItems } from './terminalContextMenu'

const calls: string[] = []
const items = buildTerminalContextMenuItems({
  selectedText: '',
  notificationsMuted: false,
  linkUrl: 'https://example.com/docs',
  onCopySelection: () => calls.push('copy-selection'),
  onPaste: () => calls.push('paste'),
  onSelectAll: () => calls.push('select-all'),
  onToggleNotifications: () => calls.push('toggle-notifications'),
  onOpenBrowserTile: (url) => calls.push(`browser:${url}`),
  onOpenExternal: (url) => calls.push(`external:${url}`),
  onCopyLink: (url) => calls.push(`copy-link:${url}`),
})

const labels = items.filter((item) => !item.divider).map((item) => item.label)
if (labels.join('|') !== 'Open in Browser tile|Open externally|Copy URL') {
  throw new Error(`unexpected terminal link menu: ${labels.join('|')}`)
}

items[0].action?.()
items[1].action?.()
items[2].action?.()

if (calls.join('|') !== 'browser:https://example.com/docs|external:https://example.com/docs|copy-link:https://example.com/docs') {
  throw new Error(`unexpected URL callbacks: ${calls.join('|')}`)
}

const activityItems = buildTerminalContextMenuItems({
  selectedText: '',
  notificationsMuted: false,
  onCopySelection: () => {},
  onPaste: () => {},
  onSelectAll: () => {},
  onToggleNotifications: () => {},
  onOpenExternal: () => {},
  onCopyLink: () => {},
})

if (!activityItems.some((item) => item.label === 'Mute Activity')) {
  throw new Error('terminal context menu must mute visual activity, not notifications')
}

const unmuteActivityItems = buildTerminalContextMenuItems({
  selectedText: '',
  notificationsMuted: true,
  onCopySelection: () => {},
  onPaste: () => {},
  onSelectAll: () => {},
  onToggleNotifications: () => {},
  onOpenExternal: () => {},
  onCopyLink: () => {},
})

if (!unmuteActivityItems.some((item) => item.label === 'Unmute Activity')) {
  throw new Error('muted terminal context menu must offer unmuting visual activity')
}
