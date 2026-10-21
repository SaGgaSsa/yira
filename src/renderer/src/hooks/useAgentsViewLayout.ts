import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { GridLayoutNode } from '@shared/types'
import {
  isGridLayoutNode,
  normalizeGridLayoutForTileIds,
  sameGridTree,
} from '@shared/gridWorkspaceState'

const STORAGE_KEY = 'yira.agentsViewLayout'

type LayoutStore = Record<string, GridLayoutNode>

function readStoredLayouts(): LayoutStore {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (value === null) return {}
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

    const layouts: LayoutStore = {}
    for (const [workspaceId, node] of Object.entries(parsed)) {
      if (isGridLayoutNode(node)) layouts[workspaceId] = node
    }
    return layouts
  } catch {
    return {}
  }
}

let layouts: LayoutStore = typeof window === 'undefined' ? {} : readStoredLayouts()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function collectTileIds(node: GridLayoutNode | null): string[] {
  if (!node) return []
  if (node.type === 'leaf') return [node.tileId]
  return node.children.flatMap(collectTileIds)
}

function readLayout(workspaceId: string): GridLayoutNode | null {
  return layouts[workspaceId] ?? null
}

function persistLayouts(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
  } catch {
    // Keep the in-memory layouts usable when storage is unavailable.
  }
}

function writeLayout(workspaceId: string, rootNode: GridLayoutNode | null): void {
  if (rootNode) {
    if (sameGridTree(readLayout(workspaceId), rootNode)) return
    layouts = { ...layouts, [workspaceId]: rootNode }
  } else {
    if (!(workspaceId in layouts)) return
    const { [workspaceId]: _removed, ...remaining } = layouts
    layouts = remaining
  }

  persistLayouts()
  listeners.forEach((listener) => listener())
}

export function useAgentsViewLayout(
  workspaceId: string,
  tileIds: readonly string[],
): [GridLayoutNode | null, (rootNode: GridLayoutNode | null) => void] {
  const storedLayout = useSyncExternalStore(
    subscribe,
    () => readLayout(workspaceId),
    () => null,
  )
  const tileIdsKey = tileIds.join('\n')
  const rootNode = useMemo(
    () => normalizeGridLayoutForTileIds(storedLayout, tileIdsKey === '' ? [] : tileIdsKey.split('\n')),
    [storedLayout, tileIdsKey],
  )

  // Save only when sessions were added, so their new node ids stay stable. Missing sessions are
  // dropped at render time without saving: they may just not be loaded yet.
  useEffect(() => {
    if (!rootNode) return
    const storedTileIds = new Set(collectTileIds(storedLayout))
    if (collectTileIds(rootNode).some((tileId) => !storedTileIds.has(tileId))) writeLayout(workspaceId, rootNode)
  }, [rootNode, storedLayout, workspaceId])

  const setRootNode = useCallback((nextRootNode: GridLayoutNode | null) => {
    writeLayout(workspaceId, nextRootNode)
  }, [workspaceId])

  return [rootNode, setRootNode]
}
