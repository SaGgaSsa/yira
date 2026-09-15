import { resolveMarkdownAssetPath } from './markdownNavigation'
import { safeMarkdownUrl } from './markdownPreview'

export const MARKDOWN_NOTE_SOURCE_PATH = '.yira-markdown-note.md'

const CONTROL_CHARACTERS = /[\u0000-\u0020\u007f-\u009f]/g
const PROTOCOL = /^([a-z][a-z\d+.-]*):/i

export type MarkdownImageSource =
  | { kind: 'remote'; url: string }
  | { kind: 'local'; relativePath: string }
  | { kind: 'blocked' }

function protocolOf(url: string): string | null {
  return url.replace(CONTROL_CHARACTERS, '').match(PROTOCOL)?.[1]?.toLowerCase() ?? null
}

export function resolveMarkdownImageSource(
  sourcePath: string,
  rawUrl: string,
): MarkdownImageSource {
  const url = rawUrl.trim()
  if (!url || url.startsWith('//')) return { kind: 'blocked' }

  const protocol = protocolOf(url)
  if (protocol) {
    if (protocol === 'http' || protocol === 'https') {
      const safeUrl = safeMarkdownUrl(url)
      return safeUrl ? { kind: 'remote', url: safeUrl } : { kind: 'blocked' }
    }
    return { kind: 'blocked' }
  }

  const relativePath = resolveMarkdownAssetPath(sourcePath, url)
  return relativePath ? { kind: 'local', relativePath } : { kind: 'blocked' }
}
