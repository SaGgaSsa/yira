export interface ShortcutCatalogItem {
  label: string
  keys: string
}

export interface ShortcutCatalogGroup {
  label: string
  items: ShortcutCatalogItem[]
}

export function getShortcutCatalog(newAgentSessionShortcut = 'Ctrl+N'): ShortcutCatalogGroup[] {
  return [
  {
    label: 'Navigation',
    items: [
      { label: 'Focus left split panel', keys: 'Ctrl+Alt+←' },
      { label: 'Focus right split panel', keys: 'Ctrl+Alt+→' },
      { label: 'Previous tab', keys: 'Ctrl+Shift+Tab' },
      { label: 'Next tab', keys: 'Ctrl+Tab' },
    ],
  },
  {
    label: 'Window',
    items: [
      { label: 'Toggle fullscreen', keys: 'F11' },
    ],
  },
  {
    label: 'Agents',
    items: [
      { label: 'New agent session', keys: newAgentSessionShortcut },
    ],
  },
  {
    label: 'Contextual',
    items: [
      { label: 'Close panels or clear selection', keys: 'Esc' },
      { label: 'Confirm dialog action', keys: 'Enter' },
    ],
  },
  ]
}

export const SHORTCUT_CATALOG: ShortcutCatalogGroup[] = getShortcutCatalog()
