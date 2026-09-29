import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'yira.sidePanelWidth'
const MIN_WIDTH = 300
const MAX_WIDTH = 560
const DEFAULT_WIDTH = 344

function clampWidth(width: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(width)))
}

function readStoredWidth(): number {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (value === null) return DEFAULT_WIDTH
    const parsed = Number(value)
    return Number.isFinite(parsed) ? clampWidth(parsed) : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

let width = typeof window === 'undefined' ? DEFAULT_WIDTH : readStoredWidth()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): number {
  return width
}

function setSharedWidth(nextWidth: number): void {
  const next = clampWidth(nextWidth)
  if (next === width) return
  width = next
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next))
  } catch {
    // Keep the in-memory width usable when storage is unavailable.
  }
  listeners.forEach((listener) => listener())
}

export function useSidePanelWidth(): [number, (width: number) => void] {
  const currentWidth = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_WIDTH)
  const updateWidth = useCallback(setSharedWidth, [])
  return [currentWidth, updateWidth]
}
