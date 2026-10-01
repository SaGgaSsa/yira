import { useSyncExternalStore } from 'react'
import type { TerminalProcessActivitySnapshot } from '@shared/terminalProcessActivity'

export const EMPTY_TERMINAL_PROCESS_ACTIVITY: TerminalProcessActivitySnapshot = { terminals: [] }

let snapshot = EMPTY_TERMINAL_PROCESS_ACTIVITY
const listeners = new Set<() => void>()
let stop: (() => void) | undefined

function publish(next: TerminalProcessActivitySnapshot) {
  snapshot = next
  for (const listener of listeners) listener()
}

function start(): () => void {
  const bridge = window.electron?.terminal
  if (!bridge?.getProcessActivity) return () => {}

  let disposed = false
  let receivedEvent = false
  const removeListener = bridge.onProcessActivityChanged?.((next) => {
    if (disposed) return
    receivedEvent = true
    publish(next)
  })

  void bridge.getProcessActivity().then((next) => {
    if (!disposed && !receivedEvent) publish(next)
  }).catch(() => undefined)

  return () => {
    disposed = true
    removeListener?.()
  }
}

const source = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    if (listeners.size === 1) stop = start()
    return () => {
      listeners.delete(listener)
      if (listeners.size > 0) return
      stop?.()
      stop = undefined
      snapshot = EMPTY_TERMINAL_PROCESS_ACTIVITY
    }
  },
}

const emptySnapshot = () => EMPTY_TERMINAL_PROCESS_ACTIVITY

export function useTerminalProcessActivity(): TerminalProcessActivitySnapshot {
  return useSyncExternalStore(source.subscribe, source.getSnapshot, emptySnapshot)
}
