import type { IBufferLine, ILink, ILinkProvider, Terminal } from '@xterm/xterm'
import { isSourceFilePath } from './fileEditorState'
import { shouldOpenTerminalLink } from './terminalLinkActivation'

export interface TerminalSourceLinkMatch {
  text: string
  path: string
  line?: number
  column?: number
  endLine?: number
  startIndex: number
  endIndex: number
}

const TOKEN = /[^\s"'`<>|]+/g
const SUFFIX = /(?::(\d+)(?::(\d+))?(?:-(\d+))?|\((\d+)(?:,(\d+))?\)|#L(\d+))$/i

export function findTerminalSourceLinks(text: string): TerminalSourceLinkMatch[] {
  const matches: TerminalSourceLinkMatch[] = []
  for (const token of text.matchAll(TOKEN)) {
    if (token.index === undefined) continue
    let value = token[0].replace(/^[([{<]+/, '')
    const leading = token[0].length - token[0].replace(/^[([{<]+/, '').length
    let suffix = SUFFIX.exec(value)
    if (!suffix) {
      value = value.replace(/[.,;!?)}\]:]+$/, '')
      suffix = SUFFIX.exec(value)
    }
    const suffixText = suffix?.[0] ?? ''
    const rawPath = suffix ? value.slice(0, -suffixText.length) : value
    if (!rawPath || /(?:^|\/)[a-z][a-z\d+.-]*:\/\//i.test(rawPath) || /^[a-z][a-z\d+.-]*:(?![\\/])/i.test(rawPath)) continue
    if (!isSourceFilePath(rawPath)) continue
    matches.push({
      text: `${rawPath}${suffixText}`,
      path: rawPath,
      ...(suffix ? { line: Number(suffix[1] ?? suffix[4] ?? suffix[6]),
        ...(suffix[2] || suffix[5] ? { column: Number(suffix[2] ?? suffix[5]) } : {}),
        ...(suffix[3] ? { endLine: Number(suffix[3]) } : {}) } : {}),
      startIndex: token.index + leading,
      endIndex: token.index + leading + value.length,
    })
  }
  return matches
}

function normalizeRelative(value: string, initial: string[] = []): string | null {
  if (/[\p{Cc}\p{Cf}]/u.test(value)) return null
  const normalized = value.replaceAll('\\', '/')
  if (normalized.startsWith('/') || normalized.startsWith('//') || /(?:^|\/)[a-z][a-z\d+.-]*:\/\//i.test(normalized) || /^[a-z][a-z\d+.-]*:/i.test(normalized)) return null
  const parts = [...initial]
  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (!parts.length) return null
      parts.pop()
    } else parts.push(segment)
  }
  if (parts[0] === '~') return null
  return parts.join('/')
}

export function resolveTerminalSourcePath(rawPath: string, baseDirectory = ''): string | null {
  const path = rawPath.replaceAll('\\', '/')
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) return null
  const base = normalizeRelative(baseDirectory)
  if (base === null && baseDirectory) return null
  const combined = normalizeRelative(path, base?.split('/') ?? [])
  if (!combined) return null
  return combined
}

export function absoluteSourcePathToRelative(rootPath: string, absolutePath: string): string | null {
  const root = rootPath.replaceAll('\\', '/').replace(/\/$/, '')
  const target = absolutePath.replaceAll('\\', '/')
  const windows = /^[a-z]:\//i.test(root)
  const compareRoot = windows ? root.toLowerCase() : root
  const compareTarget = windows ? target.toLowerCase() : target
  if (!compareTarget.startsWith(`${compareRoot}/`)) return null
  return target.slice(root.length + 1).replaceAll('\\', '/') || null
}

export function chooseTerminalSourceSearchMatch(
  entries: Array<{ name: string; relativePath: string }>,
  name: string,
  baseDirectory = '',
): string | null {
  const base = baseDirectory.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '').toLowerCase()
  const matches = entries.filter((entry) => entry.name.toLowerCase() === name.toLowerCase())
  matches.sort((a, b) => {
    const aBase = base && a.relativePath.toLowerCase().startsWith(`${base}/`) ? 0 : 1
    const bBase = base && b.relativePath.toLowerCase().startsWith(`${base}/`) ? 0 : 1
    return aBase - bBase || a.relativePath.length - b.relativePath.length || a.relativePath.localeCompare(b.relativePath)
  })
  return matches[0]?.relativePath ?? null
}

export interface TerminalSourceLinkProviderOptions {
  workspaceRootPath: string
  baseDirectory?: string
  search: (query: string) => Promise<Array<{ name: string; relativePath: string }>>
  onActivate: (relativePath: string, reveal?: { line: number; column?: number; endLine?: number }, rawPath?: string) => void | Promise<void>
  onHover?: (value: string, activate: () => void) => void
  onLeave?: (value: string) => void
}

function lineCells(line: IBufferLine): Array<{ start: number; end: number; x: number; width: number }> {
  const cells = []
  let index = 0
  let x = 0
  for (let column = 0; column < line.length; column += 1) {
    const cell = line.getCell(column)
    if (!cell) continue
    const chars = cell.getChars() || (cell.getWidth() > 0 ? ' ' : '')
    const width = Math.max(cell.getWidth(), 1)
    if (chars) cells.push({ start: index, end: index + chars.length, x, width })
    index += chars.length
    if (cell.getWidth() > 0) x += cell.getWidth()
  }
  return cells
}

export function createTerminalSourceLinkProvider(terminal: Terminal, options: TerminalSourceLinkProviderOptions): ILinkProvider {
  return {
    provideLinks: (row, callback) => {
      const line = terminal.buffer.active.getLine(row - 1)
      if (!line) return callback([])
      const text = line.translateToString(false)
      const cells = lineCells(line)
      const links: ILink[] = findTerminalSourceLinks(text).flatMap((match) => {
        const first = cells.find((cell) => match.startIndex >= cell.start && match.startIndex < cell.end)
        const last = [...cells].reverse().find((cell) => match.endIndex - 1 >= cell.start && match.endIndex - 1 < cell.end)
        if (!first || !last) return []
        const absolute = /^[a-z]:[\\/]|^\//i.test(match.path)
        const relative = absolute
          ? absoluteSourcePathToRelative(options.workspaceRootPath, match.path)
          : resolveTerminalSourcePath(match.path, options.baseDirectory)
        if (!relative) return []
        const value = `${match.path}${match.line ? `:${match.line}${match.column ? `:${match.column}` : ''}${match.endLine ? `-${match.endLine}` : ''}` : ''}`
        const activate = async () => {
          let resolved = relative
          if (!/[\\/]/.test(match.path) && !absolute) {
            const entries = await options.search(match.path)
            resolved = chooseTerminalSourceSearchMatch(entries, match.path, options.baseDirectory) ?? ''
            if (!resolved) {
              console.warn(`[TerminalSourceLinks] No exact file match for ${match.path}`)
              return
            }
          }
          await options.onActivate(resolved, match.line ? { line: match.line, column: match.column, endLine: match.endLine } : undefined, match.path)
        }
        const safeActivate = (): void => {
          void activate().catch((error: unknown) => {
            console.error('[TerminalSourceLinks] Failed to activate source link:', error)
          })
        }
        return [{
          range: { start: { x: first.x + 1, y: row }, end: { x: last.x + last.width, y: row } },
          text: match.text,
          activate: (event) => { if (shouldOpenTerminalLink(event.button)) safeActivate() },
          hover: () => options.onHover?.(value, safeActivate),
          leave: () => options.onLeave?.(value),
        }]
      })
      callback(links)
    },
  }
}
