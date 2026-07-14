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
