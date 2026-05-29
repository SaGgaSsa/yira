import { useEffect } from 'react'
import {
  focusSplitPanelByShortcut,
  switchFocusViewTabByShortcut,
  switchSplitPanelTabByShortcut,
  type TabShortcutDirection,
} from '@/utils/shortcutNavigation'
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
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('.xterm')) return false

  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable ||
    target.getAttribute('contenteditable') === 'true'
  )
}

function getTabShortcutDirection(e: KeyboardEvent): TabShortcutDirection | null {
  if (!e.ctrlKey || !e.altKey || e.metaKey || e.shiftKey) return null
  if (e.key === 'ArrowLeft') return 'previous'
  if (e.key === 'ArrowRight') return 'next'
  return null
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
    const onKeyDown = (e: KeyboardEvent) => {
      const isEditableTarget = isEditableShortcutTarget(e.target)

      if (!isEditableTarget && viewMode === 'splitview' && e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        if (e.key === '1' || e.key === '2') {
          e.preventDefault()
          setSplitViewState(focusSplitPanelByShortcut(splitViewState, e.key === '1' ? 'left' : 'right'))
          return
        }
      }

      const tabDirection = isEditableTarget ? null : getTabShortcutDirection(e)
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
