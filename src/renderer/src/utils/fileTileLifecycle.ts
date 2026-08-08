import type { TileState } from '@shared/types'

export type FileTileOpenPlan =
  | { kind: 'focus-existing'; tileId: string }
  | { kind: 'reuse-preview'; tile: TileState }
  | { kind: 'create'; tile: TileState }

export interface FileTileOpenRequest {
  workspaceId: string
  rootPath: string
  sequence: number
}

export interface FileTileOpenRequestTracker {
  begin: (workspaceId: string, rootPath: string) => FileTileOpenRequest
  isCurrent: (request: FileTileOpenRequest, workspaceId: string, rootPath: string) => boolean
}

export function createFileTileOpenRequestTracker(): FileTileOpenRequestTracker {
  let sequence = 0
  return {
    begin(workspaceId, rootPath) {
      sequence += 1
      return { workspaceId, rootPath, sequence }
    },
    isCurrent(request, workspaceId, rootPath) {
      return request.sequence === sequence &&
        request.workspaceId === workspaceId &&
        request.rootPath === rootPath
    },
  }
}

function isFileTile(tile: TileState): boolean {
  return tile.type === 'files'
}

function hasDraftDivergence(tile: TileState): boolean {
  return tile.fileDraft !== undefined
}

export function deriveFileTileTitle(filePath: string): string {
  return filePath.split(/[\\/]+/).filter(Boolean).at(-1) ?? filePath
}

export function isCleanReusableFilePreview(tile: TileState): boolean {
  return isFileTile(tile) &&
    tile.filePreview === true &&
    !hasDraftDivergence(tile) &&
    !tile.groupId &&
    tile.floating?.detached !== true
}

export function pinFileTile(tile: TileState): TileState {
  return isFileTile(tile) && tile.filePreview === true
    ? { ...tile, filePreview: false }
    : tile
}

export function pinFileTileForDraft(tile: TileState, fileDraft: string): TileState {
  return {
    ...pinFileTile(tile),
    fileDraft,
  }
}

export function pinFileTileForRename(tile: TileState, label: string): TileState {
  return {
    ...pinFileTile(tile),
    label,
  }
}

export function pinFileTileForGrouping(tile: TileState): TileState {
  return pinFileTile(tile)
}

export function pinFileTileForDetach(tile: TileState): TileState {
  return pinFileTile(tile)
}

function preparePreviewTile(tile: TileState): TileState {
  if (!isFileTile(tile) || !tile.filePath?.trim()) {
    throw new Error('A file tile open request requires a non-empty file path')
  }

  return {
    ...tile,
    filePath: tile.filePath,
    filePreview: true,
    fileDraft: undefined,
    label: deriveFileTileTitle(tile.filePath),
  }
}

function reusePreviewTile(preview: TileState, nextFile: TileState): TileState {
  return {
    ...preview,
    filePath: nextFile.filePath,
    filePreview: true,
    fileDraft: undefined,
    fileVersion: nextFile.fileVersion,
    fileChangeToken: nextFile.fileChangeToken,
    label: nextFile.label,
  }
}

export function planFileTileOpen(tiles: readonly TileState[], proposedTile: TileState): FileTileOpenPlan {
  const nextFile = preparePreviewTile(proposedTile)
  const existing = tiles.find((tile) => isFileTile(tile) && tile.filePath === nextFile.filePath)
  if (existing) return { kind: 'focus-existing', tileId: existing.id }

  const reusablePreviews = tiles.filter(isCleanReusableFilePreview)
  if (reusablePreviews.length === 1) {
    return {
      kind: 'reuse-preview',
      tile: reusePreviewTile(reusablePreviews[0], nextFile),
    }
  }

  return { kind: 'create', tile: nextFile }
}
