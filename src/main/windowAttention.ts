export type WindowAttentionReason = 'marked' | 'already-marked' | 'window-focused'

export interface AttentionWindow {
  isDestroyed: () => boolean
  isFocused: () => boolean
  flashFrame: (flag: boolean) => void
  on: (event: 'focus', listener: () => void) => void
}

export interface WindowAttentionController {
  request: (window: AttentionWindow, onlyWhenInactive: boolean) => WindowAttentionReason
  clear: (window: AttentionWindow) => void
}

export function createWindowAttentionController(): WindowAttentionController {
  const markedWindows = new WeakSet<AttentionWindow>()
  const observedWindows = new WeakSet<AttentionWindow>()

  const clear = (window: AttentionWindow): void => {
    markedWindows.delete(window)
    if (!window.isDestroyed()) window.flashFrame(false)
  }

  const observe = (window: AttentionWindow): void => {
    if (observedWindows.has(window)) return
    observedWindows.add(window)
    window.on('focus', () => clear(window))
  }

  return {
    request: (window, onlyWhenInactive) => {
      observe(window)
      if (onlyWhenInactive && window.isFocused()) return 'window-focused'
      if (markedWindows.has(window)) return 'already-marked'

      window.flashFrame(true)
      markedWindows.add(window)
      return 'marked'
    },
    clear,
  }
}
