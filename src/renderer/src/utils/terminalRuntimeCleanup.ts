import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'
import type { TileState } from '@shared/types'
import type { TerminalRuntimeRegistry } from './terminalRuntimeRegistry'

export type TerminalRuntimeCleanupRegistry = Pick<
  TerminalRuntimeRegistry,
  'destroy' | 'destroyWorkspace' | 'pruneWorkspace'
>

export function buildTerminalRuntimeTarget(
  workspaceId: string | null | undefined,
  tileId: string | null | undefined,
): TerminalSessionTarget | null {
  if (!workspaceId || !tileId) return null
  return { workspaceId, tileId }
}

export async function destroyTerminalRuntime(
  registry: TerminalRuntimeCleanupRegistry,
  target: TerminalSessionTarget | null | undefined,
  destroyPty = true,
  destroyCurrent?: (target: TerminalSessionTarget) => Promise<void>,
): Promise<void> {
  if (!target) return
  await registry.destroy(target, destroyPty)
  if (destroyPty) await destroyCurrent?.(target)
}

export async function destroyRemovedWorkspaceRuntimes(
  registry: TerminalRuntimeCleanupRegistry,
  workspaceIds: Iterable<string>,
): Promise<void> {
  const normalizedWorkspaceIds = new Set<string>()
  for (const workspaceId of workspaceIds) {
    if (workspaceId) normalizedWorkspaceIds.add(workspaceId)
  }

  for (const workspaceId of normalizedWorkspaceIds) {
    await registry.destroyWorkspace(workspaceId)
  }
}

export function getPersistedTerminalTileIds(
  tiles: Iterable<Pick<TileState, 'id' | 'type'>>,
): string[] {
  const terminalTileIds = new Set<string>()
  for (const tile of tiles) {
    if (tile.type === 'terminal' && tile.id) terminalTileIds.add(tile.id)
  }
  return [...terminalTileIds]
}

export async function pruneWorkspaceTerminalRuntimes(
  registry: TerminalRuntimeCleanupRegistry,
  workspaceId: string | null | undefined,
  tiles: Iterable<Pick<TileState, 'id' | 'type'>>,
): Promise<void> {
  if (!workspaceId) return
  await registry.pruneWorkspace(workspaceId, getPersistedTerminalTileIds(tiles))
}
