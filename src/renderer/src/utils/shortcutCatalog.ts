import type { ShortcutId, ShortcutSettings } from '@shared/shortcuts'
import { DEFAULT_SHORTCUTS } from '@shared/shortcuts'

export interface ShortcutCatalogItem {
  labelKey: string
  keys: string
  id?: ShortcutId
}

export interface ShortcutCatalogGroup {
  labelKey: string
  items: ShortcutCatalogItem[]
}

export const SHORTCUT_LABEL_KEYS: Record<ShortcutId, string> = {
  openHome: 'settings.shortcutOpenHome',
  newAgentSession: 'settings.shortcutNewAgentSession',
  focusLeftPanel: 'settings.shortcutFocusLeftSplitPanel',
  focusRightPanel: 'settings.shortcutFocusRightSplitPanel',
  previousTab: 'settings.shortcutPreviousTab',
  nextTab: 'settings.shortcutNextTab',
  findInTerminal: 'settings.shortcutFindInTerminal',
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
    labelKey: 'settings.shortcutNavigation',
    items: [
      { labelKey: SHORTCUT_LABEL_KEYS.openHome, keys: formatAccelerator(shortcuts.openHome), id: 'openHome' },
      { labelKey: SHORTCUT_LABEL_KEYS.focusLeftPanel, keys: formatAccelerator(shortcuts.focusLeftPanel), id: 'focusLeftPanel' },
      { labelKey: SHORTCUT_LABEL_KEYS.focusRightPanel, keys: formatAccelerator(shortcuts.focusRightPanel), id: 'focusRightPanel' },
      { labelKey: SHORTCUT_LABEL_KEYS.previousTab, keys: formatAccelerator(shortcuts.previousTab), id: 'previousTab' },
      { labelKey: SHORTCUT_LABEL_KEYS.nextTab, keys: formatAccelerator(shortcuts.nextTab), id: 'nextTab' },
    ],
  },
  {
    labelKey: 'settings.agents',
    items: [
      { labelKey: SHORTCUT_LABEL_KEYS.newAgentSession, keys: formatAccelerator(shortcuts.newAgentSession), id: 'newAgentSession' },
      { labelKey: 'settings.shortcutNewlineInPrompt', keys: 'Shift+Enter / Alt+Enter' },
    ],
  },
  {
    labelKey: 'settings.terminal',
    items: [
      { labelKey: SHORTCUT_LABEL_KEYS.findInTerminal, keys: formatAccelerator(shortcuts.findInTerminal), id: 'findInTerminal' },
      { labelKey: 'settings.shortcutCopySelection', keys: 'Ctrl+Shift+C' },
      { labelKey: 'settings.shortcutPaste', keys: 'Ctrl+V / Ctrl+Shift+V' },
      { labelKey: 'settings.shortcutOpenLink', keys: 'Ctrl+Click' },
    ],
  },
  {
    labelKey: 'settings.shortcutEditor',
    items: [
      { labelKey: 'settings.shortcutSaveFile', keys: 'Ctrl+S' },
    ],
  },
  {
    labelKey: 'settings.shortcutExplorer',
    items: [
      { labelKey: 'settings.shortcutRename', keys: 'F2' },
      { labelKey: 'settings.shortcutMoveToTrash', keys: 'Delete' },
    ],
  },
  {
    labelKey: 'settings.shortcutWindow',
    items: [
      { labelKey: 'settings.shortcutToggleFullscreen', keys: 'F11' },
    ],
  },
  {
    labelKey: 'settings.shortcutContextual',
    items: [
      { labelKey: 'settings.shortcutClosePanelsOrClearSelection', keys: 'Esc' },
      { labelKey: 'settings.shortcutConfirmDialogAction', keys: 'Enter' },
    ],
  },
  ]
}

export const SHORTCUT_CATALOG: ShortcutCatalogGroup[] = getShortcutCatalog()
