import type {
  IBufferLine,
  ILink,
  ILinkProvider,
  Terminal,
} from '@xterm/xterm'

import { shouldOpenTerminalLink } from './terminalLinkActivation'

export interface TerminalMarkdownLinkMatch {
  text: string
  relativePath: string
  startIndex: number
  endIndex: number
}

export interface TerminalMarkdownLinkProviderOptions {
  baseDirectory?: string
  onActivate: (relativePath: string) => void | Promise<void>
  onHover?: (relativePath: string, activate: () => void) => void
  onLeave?: (relativePath: string) => void
}

interface Candidate {
  text: string
  rawPath: string
  startIndex: number
  endIndex: number
  priority: number
}

interface Range {
  startIndex: number
  endIndex: number
}

interface CellTextRange {
  startIndex: number
  endIndex: number
  column: number
  width: number
}

const CONTROL_CHARACTER_PATTERN = /[\p{Cc}\p{Cf}]/u
const PROTOCOL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/
const EMBEDDED_PROTOCOL_PATTERN = /(?:^|\/)[a-zA-Z][a-zA-Z\d+\-.]*:\/\//
const MARKDOWN_PATH_PATTERN = /^(.*\.(?:md|markdown)(?::\d+(?::\d+)?)?)$/i
const UNQUOTED_MARKDOWN_PATH_PATTERN = /^(.*\.(?:md|markdown)(?::\d+(?::\d+)?)?)([),.;:!?}\]]*)$/i
const LINE_SUFFIX_PATTERN = /:\d+(?::\d+)?$/
const QUOTED_TRAILING_SUFFIX_PATTERN = /^:\d+(?::\d+)?(?![a-zA-Z\d:])/
const QUOTED_TEXT_PATTERN = /(["'`])([^\r\n]*?)\1/g
const UNQUOTED_TOKEN_PATTERN = /[^\s"'`<>|]+/g
// Also skips agent tool calls such as `Read(docs/a.md)` and Markdown links such as `[a](docs/a.md)`.
const LEADING_DELIMITER_PATTERN = /^(?:[([{<@]+|[a-z]+\(|[^\](]*\]\()+/i

function containsControlCharacter(value: string): boolean {
  return CONTROL_CHARACTER_PATTERN.test(value)
}

function hasUnsafeRootOrProtocol(value: string): boolean {
  const normalized = value.replaceAll('\\', '/')

  return (
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    PROTOCOL_PATTERN.test(normalized) ||
    EMBEDDED_PROTOCOL_PATTERN.test(normalized)
  )
}

function collapseRelativeSegments(value: string, initialSegments: string[] = []): string[] | null {
  if (containsControlCharacter(value)) return null

  const normalized = value.replaceAll('\\', '/')
  if (hasUnsafeRootOrProtocol(normalized)) return null

  const segments = [...initialSegments]
  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  if (segments[0] === '~') return null
  return segments
}

function normalizeMarkdownPath(rawPath: string, baseDirectory: string | undefined): string | null {
  const pathWithoutLineSuffix = rawPath.replace(LINE_SUFFIX_PATTERN, '')
  if (!pathWithoutLineSuffix || containsControlCharacter(pathWithoutLineSuffix)) return null
  const normalizedPath = pathWithoutLineSuffix.replaceAll('\\', '/')
  if (/^~(?:\/|$)/.test(normalizedPath)) return null
  if (!/\.(?:md|markdown)$/i.test(normalizedPath)) return null

  const baseSegments = collapseRelativeSegments(baseDirectory ?? '')
  if (!baseSegments) return null

  const pathSegments = collapseRelativeSegments(pathWithoutLineSuffix, baseSegments)
  if (!pathSegments || pathSegments.length === 0) return null
  if (!/\.(?:md|markdown)$/i.test(pathSegments[pathSegments.length - 1])) return null

  return pathSegments.join('/')
}

function candidateFromQuotedText(
  text: string,
  startIndex: number,
  endIndex: number,
  innerText: string,
  trailingSuffix = '',
): Candidate | null {
  const pathMatch = MARKDOWN_PATH_PATTERN.exec(`${innerText}${trailingSuffix}`)
  if (!pathMatch) return null

  return {
    text,
    rawPath: pathMatch[1],
    startIndex,
    endIndex,
    priority: 2,
  }
}

function candidateFromUnquotedToken(
  token: string,
  tokenStartIndex: number,
): Candidate | null {
  const leadingDelimiter = LEADING_DELIMITER_PATTERN.exec(token)?.[0] ?? ''
  const candidateToken = token.slice(leadingDelimiter.length)
  const pathMatch = UNQUOTED_MARKDOWN_PATH_PATTERN.exec(candidateToken)
  if (!pathMatch) return null

  const rawPath = pathMatch[1]
  const startIndex = tokenStartIndex + leadingDelimiter.length
  return {
    text: rawPath,
    rawPath,
    startIndex,
    endIndex: startIndex + rawPath.length,
    priority: 1,
  }
}

function rangesOverlap(left: Range, right: Range): boolean {
  return left.startIndex < right.endIndex && right.startIndex < left.endIndex
}

function getQuotedRanges(text: string): { ranges: Range[]; candidates: Candidate[] } {
  const ranges: Range[] = []
  const candidates: Candidate[] = []

  for (const match of text.matchAll(QUOTED_TEXT_PATTERN)) {
    if (match.index === undefined) continue
    const startIndex = match.index
    const quoteEndIndex = startIndex + match[0].length
    const trailingSuffix = QUOTED_TRAILING_SUFFIX_PATTERN.exec(text.slice(quoteEndIndex))?.[0] ?? ''
    const endIndex = quoteEndIndex + trailingSuffix.length
    ranges.push({ startIndex, endIndex })

    const candidate = candidateFromQuotedText(
      `${match[0]}${trailingSuffix}`,
      startIndex,
      endIndex,
      match[2],
      trailingSuffix,
    )
    if (candidate) candidates.push(candidate)
  }

  return { ranges, candidates }
}

function collectCandidates(text: string): Candidate[] {
  const { ranges: quotedRanges, candidates } = getQuotedRanges(text)

  for (const match of text.matchAll(UNQUOTED_TOKEN_PATTERN)) {
    if (match.index === undefined) continue
    const tokenStartIndex = match.index
    const tokenEndIndex = tokenStartIndex + match[0].length
    const tokenRange = { startIndex: tokenStartIndex, endIndex: tokenEndIndex }
    if (quotedRanges.some((range) => rangesOverlap(tokenRange, range))) continue

    const candidate = candidateFromUnquotedToken(match[0], tokenStartIndex)
    if (candidate) candidates.push(candidate)
  }

  return candidates
}

export function findTerminalMarkdownLinks(
  text: string,
  baseDirectory?: string,
): TerminalMarkdownLinkMatch[] {
  const matches: Array<Candidate & { relativePath: string }> = []

  for (const candidate of collectCandidates(text)) {
    const relativePath = normalizeMarkdownPath(candidate.rawPath, baseDirectory)
    if (!relativePath) continue

    matches.push({
      ...candidate,
      relativePath,
    })
  }

  matches.sort((left, right) => (
    left.startIndex - right.startIndex ||
    right.priority - left.priority ||
    right.endIndex - left.endIndex
  ))

  const accepted: TerminalMarkdownLinkMatch[] = []
  for (const candidate of matches) {
    const duplicate = accepted.some((match) => (
      match.startIndex === candidate.startIndex &&
      match.endIndex === candidate.endIndex &&
      match.relativePath === candidate.relativePath
    ))
    if (duplicate) continue

    const overlaps = accepted.some((match) => rangesOverlap(match, candidate))
    if (overlaps) continue

    accepted.push({
      text: candidate.text,
      relativePath: candidate.relativePath,
      startIndex: candidate.startIndex,
      endIndex: candidate.endIndex,
    })
  }

  return accepted.sort((left, right) => left.startIndex - right.startIndex)
}

function buildCellTextRanges(line: IBufferLine): CellTextRange[] {
  const ranges: CellTextRange[] = []
  let stringIndex = 0
  let visualColumn = 0

  for (let bufferColumn = 0; bufferColumn < line.length; bufferColumn += 1) {
    const cell = line.getCell(bufferColumn)
    if (!cell) continue

    const chars = cell.getChars()
    const width = cell.getWidth()
    const cellText = chars || (cell.getWidth() > 0 ? ' ' : '')
    if (cellText) {
      ranges.push({
        startIndex: stringIndex,
        endIndex: stringIndex + cellText.length,
        column: visualColumn,
        width: Math.max(width, 1),
      })
      stringIndex += cellText.length
    }
    if (width > 0) visualColumn += width
  }

  return ranges
}

function findCellRangeAtOrAfter(ranges: CellTextRange[], stringIndex: number): CellTextRange | null {
  const containingRange = ranges.find((range) => (
    stringIndex >= range.startIndex && stringIndex < range.endIndex
  ))
  if (containingRange) return containingRange

  return ranges.find((range) => range.startIndex >= stringIndex) ?? null
}

function findCellRangeAtOrBefore(ranges: CellTextRange[], stringIndex: number): CellTextRange | null {
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index]
    if (stringIndex >= range.startIndex && stringIndex < range.endIndex) return range
    if (range.endIndex <= stringIndex) return range
  }

  return null
}

function activateTerminalMarkdownLink(
  relativePath: string,
  onActivate: TerminalMarkdownLinkProviderOptions['onActivate'],
): void {
  try {
    const result = onActivate(relativePath)
    void Promise.resolve(result).catch((error: unknown) => {
      console.error('[TerminalMarkdownLinks] Failed to activate Markdown link:', error)
    })
  } catch (error) {
    console.error('[TerminalMarkdownLinks] Failed to activate Markdown link:', error)
  }
}

function createTerminalMarkdownLink(
  bufferLineNumber: number,
  cellRanges: CellTextRange[],
  match: TerminalMarkdownLinkMatch,
  options: TerminalMarkdownLinkProviderOptions,
): ILink | null {
  const startRange = findCellRangeAtOrAfter(cellRanges, match.startIndex)
  const endRange = findCellRangeAtOrBefore(cellRanges, match.endIndex - 1)
  if (startRange === null || endRange === null) return null

  return {
    range: {
      start: { x: startRange.column + 1, y: bufferLineNumber },
      end: { x: endRange.column + endRange.width, y: bufferLineNumber },
    },
    text: match.text,
    activate: (event) => {
      if (!shouldOpenTerminalLink(event.button)) return
      activateTerminalMarkdownLink(match.relativePath, options.onActivate)
    },
    hover: () => {
      options.onHover?.(match.relativePath, () => activateTerminalMarkdownLink(match.relativePath, options.onActivate))
    },
    leave: () => {
      options.onLeave?.(match.relativePath)
    },
  }
}

export function createTerminalMarkdownLinkProvider(
  terminal: Terminal,
  options: TerminalMarkdownLinkProviderOptions,
): ILinkProvider {
  return {
    provideLinks: (bufferLineNumber, callback) => {
      const line = terminal.buffer.active.getLine(bufferLineNumber - 1)
      if (!line) {
        callback([])
        return
      }

      const text = line.translateToString(false)
      const cellRanges = buildCellTextRanges(line)
      const links = findTerminalMarkdownLinks(text, options.baseDirectory)
        .map((match) => createTerminalMarkdownLink(
          bufferLineNumber,
          cellRanges,
          match,
          options,
        ))
        .filter((link): link is ILink => link !== null)

      callback(links)
    },
  }
}
