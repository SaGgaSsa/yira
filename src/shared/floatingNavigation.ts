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
  if (options?.reveal) request.fileReveal = { ...options.reveal }

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
  if (value.kind === 'file' && isRecord(value.fileReveal)) {
    const { line, column, endLine } = value.fileReveal
    if (typeof line === 'number' && Number.isFinite(line) && line > 0) {
      request.fileReveal = {
        line,
        ...(typeof column === 'number' && Number.isFinite(column) && column > 0 ? { column } : {}),
        ...(typeof endLine === 'number' && Number.isFinite(endLine) && endLine >= line ? { endLine } : {}),
      }
    }
  }

  return request
}
