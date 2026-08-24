import type { FileTileOpenOptions, FloatingNavigationRequest, MarkdownViewMode } from './types'

const MARKDOWN_VIEW_MODES: readonly MarkdownViewMode[] = ['edit', 'preview', 'live']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isMarkdownViewMode(value: unknown): value is MarkdownViewMode {
  return typeof value === 'string' && MARKDOWN_VIEW_MODES.includes(value as MarkdownViewMode)
}

export function createFloatingFileNavigationRequest(
  relativePath: string,
  options?: FileTileOpenOptions,
): FloatingNavigationRequest {
  const request: FloatingNavigationRequest = {
    kind: 'file',
    target: relativePath,
  }

  if (isMarkdownViewMode(options?.markdownView)) {
    request.fileMarkdownView = options.markdownView
  }

  return request
}

export function normalizeFloatingNavigationRequest(value: unknown): FloatingNavigationRequest | null {
  if (!isRecord(value)) return null
  if (value.kind !== 'file' && value.kind !== 'browser') return null
  if (typeof value.target !== 'string' || !value.target.trim()) return null

  const request: FloatingNavigationRequest = {
    kind: value.kind,
    target: value.target,
  }

  if (value.kind === 'file' && isMarkdownViewMode(value.fileMarkdownView)) {
    request.fileMarkdownView = value.fileMarkdownView
  }

  return request
}
