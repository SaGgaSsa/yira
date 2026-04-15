import type { TileGroup, TileState } from '@shared/types'

export const LOCKED_GROUP_REGROUP_MESSAGE = 'Locked group tiles cannot be regrouped'

export function isTileInteractionLocked(tile: TileState, groups: TileGroup[]): boolean {
  if (tile.locked) return true
  if (!tile.groupId) return false
  return Boolean(groups.find((group) => group.id === tile.groupId)?.locked)
}

export function getGroupingBlockedReason(
  tiles: TileState[],
  groups: TileGroup[],
  selectedTileIds: string[],
  targetGroupId?: string,
): string | null {
  if (selectedTileIds.length < 2) return null

  const groupsById = new Map(groups.map((group) => [group.id, group]))
  const selectedTileIdSet = new Set(selectedTileIds)
  const selectedTiles = tiles.filter((tile) => selectedTileIdSet.has(tile.id))

  const hasLockedGroupTile = selectedTiles.some((tile) => (
    Boolean(tile.groupId && groupsById.get(tile.groupId)?.locked)
  ))

  if (hasLockedGroupTile) return LOCKED_GROUP_REGROUP_MESSAGE
  if (targetGroupId && groupsById.get(targetGroupId)?.locked) return LOCKED_GROUP_REGROUP_MESSAGE

  return null
}

export function findSelectedGroup(groups: TileGroup[], selectedTileIds: string[]): TileGroup | null {
  if (selectedTileIds.length === 0) return null

  const selectedTileIdSet = new Set(selectedTileIds)

  return groups.find((group) => (
    group.tileIds.length > 0 &&
    group.tileIds.length === selectedTileIds.length &&
    group.tileIds.every((tileId) => selectedTileIdSet.has(tileId))
  )) ?? null
}

export function findMergeTargetGroup(
  tiles: TileState[],
  groups: TileGroup[],
  selectedTileIds: string[],
): TileGroup | null {
  if (selectedTileIds.length < 2) return null
  if (getGroupingBlockedReason(tiles, groups, selectedTileIds)) return null

  const selectedTileIdSet = new Set(selectedTileIds)
  const selectedTiles = tiles.filter((tile) => selectedTileIdSet.has(tile.id))
  const touchedGroupIds = Array.from(new Set(
    selectedTiles
      .map((tile) => tile.groupId)
      .filter((groupId): groupId is string => Boolean(groupId)),
  ))

  if (touchedGroupIds.length !== 1) return null

  const targetGroup = groups.find((group) => group.id === touchedGroupIds[0])
  if (!targetGroup) return null
  if (targetGroup.locked) return null

  const targetTileIdSet = new Set(targetGroup.tileIds)
  if (!targetGroup.tileIds.every((tileId) => selectedTileIdSet.has(tileId))) return null
  if (targetGroup.tileIds.length === selectedTileIds.length) return null

  const hasForeignGroupedTile = selectedTiles.some((tile) => (
    !targetTileIdSet.has(tile.id) &&
    Boolean(tile.groupId) &&
    tile.groupId !== targetGroup.id
  ))

  return hasForeignGroupedTile ? null : targetGroup
}

export function getGroupAnchorTile(
  group: TileGroup,
  tiles: TileState[],
  focusedTileId: string | null,
): TileState | null {
  const memberTileIdSet = new Set(group.tileIds)
  const members = tiles.filter((tile) => memberTileIdSet.has(tile.id))
  if (members.length === 0) return null

  const focusedMember = focusedTileId
    ? members.find((tile) => tile.id === focusedTileId) ?? null
    : null

  if (focusedMember) return focusedMember

  return members.reduce((best, tile) => {
    const bestRight = best.x + best.width
    const tileRight = tile.x + tile.width

    if (tileRight > bestRight) return tile
    if (tileRight < bestRight) return best

    return tile.zIndex > best.zIndex ? tile : best
  })
}
