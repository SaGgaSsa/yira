import { useSyncExternalStore } from 'react'

const SERVER_WIDTH = 1920

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('resize', listener)
  return () => window.removeEventListener('resize', listener)
}

function getSnapshot(): number {
  return typeof window === 'undefined' ? SERVER_WIDTH : window.innerWidth
}

export function useWindowWidth(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_WIDTH)
}
