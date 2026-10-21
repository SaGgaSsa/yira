import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'yira.sidebarWorkspaceOrder'
const EMPTY_ORDER: readonly string[] = []

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function readStoredOrder(): readonly string[] {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (value === null) return EMPTY_ORDER
    const parsed: unknown = JSON.parse(value)
    return isStringArray(parsed) ? parsed : EMPTY_ORDER
  } catch {
    return EMPTY_ORDER
  }
}

let order = typeof window === 'undefined' ? EMPTY_ORDER : readStoredOrder()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): readonly string[] {
  return order
}

function setSharedOrder(nextOrder: readonly string[]): void {
  const next = [...nextOrder]
  if (next.length === order.length && next.every((id, index) => id === order[index])) return
  order = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Keep the in-memory order usable when storage is unavailable.
  }
  listeners.forEach((listener) => listener())
}

export function useSidebarWorkspaceOrder(): [readonly string[], (order: readonly string[]) => void] {
  const currentOrder = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_ORDER)
  const updateOrder = useCallback(setSharedOrder, [])
  return [currentOrder, updateOrder]
}
