import { buildTerminalContextMenuItems } from './terminalContextMenu'

const calls: string[] = []
const items = buildTerminalContextMenuItems({
  selectedText: '',
  notificationsMuted: false,
  linkTarget: { kind: 'web', value: 'https://example.com/docs' },
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

const markdownCalls: string[] = []
const markdownItems = buildTerminalContextMenuItems({
  selectedText: '',
  notificationsMuted: false,
  linkTarget: { kind: 'markdown', value: 'docs/guide.md' },
  onCopySelection: () => markdownCalls.push('copy-selection'),
  onPaste: () => markdownCalls.push('paste'),
  onSelectAll: () => markdownCalls.push('select-all'),
  onToggleNotifications: () => markdownCalls.push('toggle-notifications'),
  onOpenFileTile: (path, options) => {
    markdownCalls.push(`markdown:${path}`)
    if (options?.markdownView !== 'preview') throw new Error('Markdown tile must open in preview mode')
  },
  onOpenExternal: () => markdownCalls.push('external'),
  onCopyLink: (path) => markdownCalls.push(`copy-path:${path}`),
})

const markdownLabels = markdownItems.filter((item) => !item.divider).map((item) => item.label)
if (markdownLabels.join('|') !== 'Open in Markdown tile|Copy path') {
  throw new Error(`unexpected Markdown link menu: ${markdownLabels.join('|')}`)
}

markdownItems[0].action?.()
markdownItems[1].action?.()

if (markdownCalls.join('|') !== 'markdown:docs/guide.md|copy-path:docs/guide.md') {
  throw new Error(`unexpected Markdown callbacks: ${markdownCalls.join('|')}`)
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

if (activityItems.some((item) => item.label === 'Send to agent')) {
  throw new Error('terminal context menu must omit agent sending without a callback')
}

let sentTo = ''
const agentItems = buildTerminalContextMenuItems({
  selectedText: 'selected command',
  notificationsMuted: false,
  agentTargets: [{ id: 'agent-one', label: 'Claude task' }],
  onCopySelection: () => {},
  onPaste: () => {},
  onSelectAll: () => {},
  onToggleNotifications: () => {},
  onSendToAgent: (id) => { sentTo = id },
  onOpenExternal: () => {},
  onCopyLink: () => {},
})
const sendItem = agentItems.find((item) => item.label === 'Send to agent')

if (!sendItem || sendItem.disabled || sendItem.submenu?.[0].label !== 'Claude task') {
  throw new Error('terminal context menu must add a submenu for available agents')
}
sendItem.submenu[0].action?.()
if (sentTo !== 'agent-one') throw new Error(`unexpected agent destination: ${sentTo}`)

const noAgentItems = buildTerminalContextMenuItems({
  selectedText: '',
  notificationsMuted: false,
  agentTargets: [],
  onCopySelection: () => {},
  onPaste: () => {},
  onSelectAll: () => {},
  onToggleNotifications: () => {},
  onSendToAgent: () => {},
  onOpenExternal: () => {},
  onCopyLink: () => {},
})
const noAgentsItem = noAgentItems.find((item) => item.label === 'No agents in this workspace')
if (!noAgentsItem?.disabled || noAgentsItem.submenu) {
  throw new Error('terminal menu must show a disabled no-agents item without a submenu')
}
