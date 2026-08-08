export type MarkdownNavigationTarget =
  | { kind: 'top' }
  | { kind: 'anchor'; anchor: string }
  | { kind: 'workspace-file'; relativePath: string; anchor?: string }
  | { kind: 'browser'; url: string }
  | { kind: 'external'; url: string }
  | { kind: 'blocked' }

const CONTROL_CHARACTERS = /[\u0000-\u0020\u007f-\u009f]/g
const PROTOCOL = /^([a-z][a-z\d+.-]*):/i
const WORKSPACE_ORIGIN = 'https://yira-workspace.invalid'
const WORKSPACE_ROOT_URL = `${WORKSPACE_ORIGIN}/workspace/`

function decodeUrlPart(value: string): string | null {
  try {
    return decodeURIComponent(value).replace(/\\/g, '/')
  } catch {
    return null
  }
}

function workspacePath(currentFilePath: string, rawPath: string): string | null {
  const decoded = decodeUrlPart(rawPath)
  if (decoded === null || decoded.includes('\0')) return null
  const sourcePath = currentFilePath.replace(/\\/g, '/').replace(/^\/+/, '')
  try {
    const base = new URL(sourcePath, WORKSPACE_ROOT_URL)
    const resolved = new URL(decoded.startsWith('/') ? `.${decoded}` : decoded, decoded.startsWith('/') ? WORKSPACE_ROOT_URL : base)
    if (resolved.origin !== WORKSPACE_ORIGIN || !resolved.pathname.startsWith('/workspace/') || resolved.pathname === '/workspace/') return null
    const relativePath = decodeURIComponent(resolved.pathname.slice('/workspace/'.length)).replace(/\\/g, '/')
    if (relativePath.includes('\0') || relativePath.split('/').some((segment) => segment === '..')) return null
    return relativePath
  } catch {
    return null
  }
}

export function resolveMarkdownNavigation(currentFilePath: string, rawUrl: string): MarkdownNavigationTarget {
  const url = rawUrl.trim()
  if (!url || url.startsWith('//')) return { kind: 'blocked' }

  if (url.startsWith('#')) {
    const anchor = decodeUrlPart(url.slice(1))
    if (anchor === null) return { kind: 'blocked' }
    return anchor ? { kind: 'anchor', anchor } : { kind: 'top' }
  }

  const protocol = url.replace(CONTROL_CHARACTERS, '').match(PROTOCOL)?.[1]?.toLowerCase()
  if (protocol === 'http' || protocol === 'https') return { kind: 'browser', url }
  if (protocol === 'mailto') return { kind: 'external', url }
  if (protocol) return { kind: 'blocked' }

  const [pathAndQuery, rawAnchor] = url.split('#', 2)
  const rawPath = pathAndQuery.split('?', 1)[0]
  const relativePath = workspacePath(currentFilePath, rawPath)
  if (!relativePath) return { kind: 'blocked' }
  const anchor = rawAnchor === undefined ? undefined : decodeUrlPart(rawAnchor)
  if (anchor === null) return { kind: 'blocked' }
  return { kind: 'workspace-file', relativePath, ...(anchor ? { anchor } : {}) }
}

export function resolveMarkdownAssetPath(currentFilePath: string, rawUrl: string): string | null {
  const target = resolveMarkdownNavigation(currentFilePath, rawUrl)
  return target.kind === 'workspace-file' ? target.relativePath : null
}
