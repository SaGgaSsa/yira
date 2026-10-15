import type { ShortcutId, ShortcutSettings } from '@shared/shortcuts'
import { DEFAULT_SHORTCUTS } from '@shared/shortcuts'

export interface ShortcutCatalogItem {
  label: string
  keys: string
  id?: ShortcutId
}

export interface ShortcutCatalogGroup {
  label: string
  items: ShortcutCatalogItem[]
}

/** Render named arrow keys as compact glyphs for the settings catalog. */
export function formatAccelerator(accelerator: string): string {
  return accelerator
    .replace(/ArrowLeft/g, '←')
    .replace(/ArrowRight/g, '→')
    .replace(/ArrowUp/g, '↑')
    .replace(/ArrowDown/g, '↓')
}

export function getShortcutCatalog(shortcuts: ShortcutSettings = DEFAULT_SHORTCUTS): ShortcutCatalogGroup[] {
  return [
  {
    label: 'Navigation',
    items: [
      { label: 'Open home', keys: formatAccelerator(shortcuts.openHome), id: 'openHome' },
      { label: 'Focus left split panel', keys: formatAccelerator(shortcuts.focusLeftPanel), id: 'focusLeftPanel' },
      { label: 'Focus right split panel', keys: formatAccelerator(shortcuts.focusRightPanel), id: 'focusRightPanel' },
      { label: 'Previous tab', keys: formatAccelerator(shortcuts.previousTab), id: 'previousTab' },
      { label: 'Next tab', keys: formatAccelerator(shortcuts.nextTab), id: 'nextTab' },
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
      { label: 'New agent session', keys: formatAccelerator(shortcuts.newAgentSession), id: 'newAgentSession' },
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
