/**
 * Pure string helpers for the Claude Code statusLine setting.
 *
 * The caller owns reading/writing ~/.claude/settings.json. These functions
 * never perform file I/O and refuse to replace a status line that Yira does
 * not own.
 */

export const YIRA_CLAUDE_USAGE_STATUS_LINE_MARKER = '--yira-managed-claude-usage-status-line'

export type ClaudeUsageStatusLineOperation = 'install' | 'uninstall'
export type ClaudeUsageStatusLineMutationStatus =
  | 'installed'
  | 'already-installed'
  | 'uninstalled'
  | 'already-uninstalled'
  | 'malformed'
  | 'unsupported'
  | 'conflict'
  | 'invalid'

export interface ClaudeUsageStatusLineMutationResult {
  readonly ok: boolean
  readonly success: boolean
  readonly operation: ClaudeUsageStatusLineOperation
  readonly status: ClaudeUsageStatusLineMutationStatus
  readonly changed: boolean
  /** Original text on failures; serialized settings text on success. */
  readonly text: string
  readonly message: string
}

type JsonObject = Record<string, unknown>

/** Add the stable ownership marker to the resolved status-line command. */
export function buildManagedClaudeUsageStatusLineCommand(clientCommand: string): string {
  return `${clientCommand.trim()} ${YIRA_CLAUDE_USAGE_STATUS_LINE_MARKER}`
}

/** Install the Yira-owned statusLine entry in settings.json text. */
export function installClaudeUsageStatusLineConfiguration(
  text: string,
  clientCommand: string,
): ClaudeUsageStatusLineMutationResult {
  return mutateConfiguration('install', text, clientCommand)
}

/** Remove the untouched Yira-owned statusLine entry from settings.json text. */
export function uninstallClaudeUsageStatusLineConfiguration(
  text: string,
  clientCommand: string,
): ClaudeUsageStatusLineMutationResult {
  return mutateConfiguration('uninstall', text, clientCommand)
}

/** Short aliases for settings/IPC callers. */
export const installClaudeUsageStatusLine = installClaudeUsageStatusLineConfiguration
export const uninstallClaudeUsageStatusLine = uninstallClaudeUsageStatusLineConfiguration
export const installClaudeStatusLine = installClaudeUsageStatusLineConfiguration
export const uninstallClaudeStatusLine = uninstallClaudeUsageStatusLineConfiguration

function mutateConfiguration(
  operation: ClaudeUsageStatusLineOperation,
  text: string,
  clientCommand: string,
): ClaudeUsageStatusLineMutationResult {
  const baseCommand = clientCommand.trim()
  if (!baseCommand || baseCommand.includes(YIRA_CLAUDE_USAGE_STATUS_LINE_MARKER)) {
    return failureResult(operation, text, 'invalid', 'A resolved client command is required; no changes were made.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return failureResult(operation, text, 'malformed', 'Claude settings are malformed JSON; no changes were made.')
  }
  if (!isJsonObject(parsed)) {
    return failureResult(operation, text, 'unsupported', 'Claude settings must be a JSON object; no changes were made.')
  }

  const expectedCommand = buildManagedClaudeUsageStatusLineCommand(baseCommand)
  const statusLine = parsed.statusLine
  const inspection = inspectStatusLine(statusLine, expectedCommand)

  if (inspection === 'conflict') {
    return failureResult(
      operation,
      text,
      'conflict',
      'A Claude statusLine is not an untouched Yira-managed command; review it before retrying.',
    )
  }

  if (operation === 'install' && inspection === 'managed') {
    return successResult(operation, text, 'already-installed', false, 'Yira Claude usage statusLine is already installed.')
  }
  if (operation === 'uninstall' && inspection === 'absent') {
    return successResult(operation, text, 'already-uninstalled', false, 'No Yira Claude usage statusLine was found.')
  }

  if (operation === 'install') parsed.statusLine = { type: 'command', command: expectedCommand }
  else delete parsed.statusLine

  const serialized = serializeConfiguration(parsed, text)
  return successResult(
    operation,
    serialized,
    operation === 'install' ? 'installed' : 'uninstalled',
    true,
    operation === 'install'
      ? 'Installed the Yira Claude usage statusLine.'
      : 'Removed the Yira Claude usage statusLine.',
  )
}

type StatusLineInspection = 'absent' | 'managed' | 'conflict'

function inspectStatusLine(value: unknown, expectedCommand: string): StatusLineInspection {
  if (value === undefined) return 'absent'
  if (!isJsonObject(value)) return 'conflict'
  if (!sameKeys(value, ['type', 'command'])) return 'conflict'
  if (value.type !== 'command' || typeof value.command !== 'string') return 'conflict'
  if (value.command !== expectedCommand) return 'conflict'
  return 'managed'
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameKeys(value: JsonObject, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function serializeConfiguration(value: JsonObject, originalText: string): string {
  const hasNewline = originalText.includes('\n') || originalText.includes('\r')
  const indent = hasNewline ? detectIndent(originalText) : 0
  let serialized = JSON.stringify(value, null, indent)
  const newline = originalText.includes('\r\n') ? '\r\n' : '\n'
  if (hasNewline && newline !== '\n') serialized = serialized.replaceAll('\n', newline)
  if (originalText.endsWith('\n') || originalText.endsWith('\r')) serialized += newline
  return serialized
}

function detectIndent(text: string): string | number {
  const match = text.match(/(?:^|\r?\n)([ \t]+)"/)
  return match?.[1] ?? 2
}

function failureResult(
  operation: ClaudeUsageStatusLineOperation,
  text: string,
  status: Extract<ClaudeUsageStatusLineMutationStatus, 'malformed' | 'unsupported' | 'conflict' | 'invalid'>,
  message: string,
): ClaudeUsageStatusLineMutationResult {
  return { ok: false, success: false, operation, status, changed: false, text, message }
}

function successResult(
  operation: ClaudeUsageStatusLineOperation,
  text: string,
  status: Extract<ClaudeUsageStatusLineMutationStatus, 'installed' | 'already-installed' | 'uninstalled' | 'already-uninstalled'>,
  changed: boolean,
  message: string,
): ClaudeUsageStatusLineMutationResult {
  return { ok: true, success: true, operation, status, changed, text, message }
}
