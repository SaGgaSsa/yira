import { normalizeFileMarkdownViewMode as normalizeViewMode } from '@shared/types'
import type { MarkdownViewMode } from '@shared/types'

export { normalizeFileMarkdownViewMode } from '@shared/types'

export function isMarkdownFilePath(filePath: string): boolean {
  return /\.(?:md|markdown)$/i.test(filePath.trim())
}

export function fileMarkdownLayout(value: unknown): { showEditor: boolean; showPreview: boolean } {
  const mode: MarkdownViewMode = normalizeViewMode(value)
  return {
    showEditor: mode !== 'preview',
    showPreview: mode !== 'edit',
  }
}
