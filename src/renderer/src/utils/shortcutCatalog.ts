export interface ShortcutCatalogItem {
  label: string
  keys: string
}

export interface ShortcutCatalogGroup {
  label: string
  items: ShortcutCatalogItem[]
}

export const SHORTCUT_CATALOG: ShortcutCatalogGroup[] = [
  {
    label: 'Navigation',
    items: [
      { label: 'Focus left split panel', keys: 'Ctrl+1' },
      { label: 'Focus right split panel', keys: 'Ctrl+2' },
      { label: 'Previous tab', keys: 'Ctrl+Alt+←' },
      { label: 'Next tab', keys: 'Ctrl+Alt+→' },
    ],
  },
  {
    label: 'Window',
    items: [
      { label: 'Toggle fullscreen', keys: 'F11' },
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
