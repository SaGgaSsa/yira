import { useEffect } from 'react'
import { useCanvasStore } from '@/store/canvasStore'
import { getCanvasMethods } from '@/components/Canvas'

interface UseKeyboardShortcutsDeps {
  tiles: Array<{ id: string }>
  focusedTileId: string | null
  viewMode: 'canvas' | 'fullview'
  deleteTile: (id: string) => void
  resetZoom: () => void
  focusTile: (id: string | null) => void
  setViewMode: (mode: 'canvas' | 'fullview') => void
  onClosePicker?: () => void
}

export function useKeyboardShortcuts(deps: UseKeyboardShortcutsDeps) {
  const { tiles, focusedTileId, viewMode, deleteTile, resetZoom, focusTile, setViewMode, onClosePicker } = deps

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.getAttribute('contenteditable') === 'true'

      // Delete focused tile
      if ((e.key === 'Backspace' || e.key === 'Delete') && !isInput) {
        if (focusedTileId) {
          deleteTile(focusedTileId)
          e.preventDefault()
        }
      }

      // Reset zoom: Ctrl+0 / Cmd+0
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        resetZoom()
      }

      // Center on focused tile: Z
      if (e.key === 'z' && !e.ctrlKey && !e.metaKey && !isInput) {
        e.preventDefault()
        const methods = getCanvasMethods()
        if (methods && focusedTileId) {
          methods.centerViewOnTile(focusedTileId)
        }
      }

      // Center canvas: Home
      if (e.key === 'Home' && !isInput) {
        e.preventDefault()
        getCanvasMethods()?.centerViewOnCanvas()
      }

      // Escape clears focus or closes pickers
      if (e.key === 'Escape') {
        onClosePicker?.()
        if (viewMode === 'fullview') {
          setViewMode('canvas')
        }
        if (focusedTileId) {
          focusTile(null)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusedTileId, tiles, viewMode, deleteTile, resetZoom, focusTile, setViewMode, onClosePicker])
}
