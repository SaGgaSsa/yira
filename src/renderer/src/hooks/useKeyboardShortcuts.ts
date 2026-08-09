import { useEffect } from 'react'
import {
  focusSplitPanelByShortcut,
  switchFocusViewTabByShortcut,
  switchSplitPanelTabByShortcut,
  type TabShortcutDirection,
} from '@/utils/shortcutNavigation'
import {
  isTerminalShortcutTarget,
  resolveKeyboardShortcut,
} from '@/utils/shortcutResolver'
import type { SplitViewState, ViewMode } from '@shared/types'

interface UseKeyboardShortcutsDeps {
  tiles: Array<{ id: string; zIndex: number }>
  focusedTileId: string | null
  selectedTileIds: string[]
  viewMode: ViewMode
  fullviewActiveTileId: string | null
  splitViewState: SplitViewState
  focusTile: (id: string | null) => void
  selectTiles: (ids: string[]) => void
  setFullviewActiveTileId: (id: string | null) => void
  setSplitViewState: (state: SplitViewState) => void
  onClosePicker?: () => void
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false

  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable ||
    target.getAttribute('contenteditable') === 'true'
  )
}

export function handleKeyboardShortcut(e: KeyboardEvent, deps: UseKeyboardShortcutsDeps): void {
  const {
    tiles,
    focusedTileId,
    selectedTileIds,
    viewMode,
    fullviewActiveTileId,
    splitViewState,
    focusTile,
    selectTiles,
    setFullviewActiveTileId,
    setSplitViewState,
    onClosePicker,
  } = deps

  if (isTerminalShortcutTarget(e.target)) return

  const isEditableTarget = isEditableShortcutTarget(e.target)
  const shortcut = resolveKeyboardShortcut(e)

  if (!isEditableTarget && viewMode === 'splitview') {
    if (shortcut === 'focus-left-panel' || shortcut === 'focus-right-panel') {
      e.preventDefault()
      setSplitViewState(focusSplitPanelByShortcut(
        splitViewState,
        shortcut === 'focus-left-panel' ? 'left' : 'right',
      ))
      return
    }
  }

  const tabDirection: TabShortcutDirection | null = isEditableTarget
    ? null
    : shortcut === 'previous-tab'
      ? 'previous'
      : shortcut === 'next-tab'
        ? 'next'
        : null
  if (tabDirection) {
    if (viewMode === 'splitview') {
      e.preventDefault()
      const nextState = switchSplitPanelTabByShortcut(splitViewState, tabDirection)
      setSplitViewState(nextState)

      const activeTileId = nextState.focusedPanel === 'left'
        ? nextState.activeLeftTileId
        : nextState.activeRightTileId
      if (activeTileId) {
        focusTile(activeTileId)
        selectTiles([activeTileId])
        setFullviewActiveTileId(activeTileId)
      }
      return
    }

    if (viewMode === 'fullview') {
      e.preventDefault()
      const orderedTileIds = tiles
        .slice()
        .sort((a, b) => b.zIndex - a.zIndex)
        .map((tile) => tile.id)
      const nextTileId = switchFocusViewTabByShortcut(orderedTileIds, fullviewActiveTileId, tabDirection)

      if (nextTileId && nextTileId !== fullviewActiveTileId) {
        focusTile(nextTileId)
        selectTiles([nextTileId])
        setFullviewActiveTileId(nextTileId)
      }
      return
    }
  }

  // Escape clears focus or closes pickers
  if (e.key === 'Escape') {
    onClosePicker?.()
    if (focusedTileId) focusTile(null)
    if (selectedTileIds.length > 0) selectTiles([])
  }
}

export function useKeyboardShortcuts(deps: UseKeyboardShortcutsDeps) {
  const {
    tiles,
    focusedTileId,
    selectedTileIds,
    viewMode,
    fullviewActiveTileId,
    splitViewState,
    focusTile,
    selectTiles,
    setFullviewActiveTileId,
    setSplitViewState,
    onClosePicker,
  } = deps

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => handleKeyboardShortcut(e, {
      tiles,
      focusedTileId,
      selectedTileIds,
      viewMode,
      fullviewActiveTileId,
      splitViewState,
      focusTile,
      selectTiles,
      setFullviewActiveTileId,
      setSplitViewState,
      onClosePicker,
    })

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    focusedTileId,
    fullviewActiveTileId,
    selectedTileIds,
    splitViewState,
    tiles,
    viewMode,
    focusTile,
    selectTiles,
    setFullviewActiveTileId,
    setSplitViewState,
    onClosePicker,
  ])
}
