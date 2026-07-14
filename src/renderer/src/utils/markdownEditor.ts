import type { MarkdownViewMode } from '@shared/types'

export function getMarkdownEditorKey(tileId: string, viewMode: MarkdownViewMode): string {
  return `${tileId}:${viewMode}`
}
