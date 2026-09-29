/** Pure helpers for Yira's Claude Code statusLine configuration. */

export const YIRA_MANAGED_STATUSLINE_MARKER = '--yira-managed-statusline'
const YIRA_CHAIN_PREFIX = '--yira-chain='

type JsonObject = Record<string, unknown>

export type ClaudeStatusLineStateStatus = 'active' | 'inactive' | 'chainable' | 'outdated' | 'malformed' | 'unsupported'
export type ClaudeStatusLineMutationStatus = 'installed' | 'already-installed' | 'uninstalled' | 'already-uninstalled' | 'malformed' | 'unsupported' | 'invalid'

export interface ClaudeStatusLineState {
  status: ClaudeStatusLineStateStatus
  message: string
}

export interface ClaudeStatusLineMutationResult {
  ok: boolean
  success: boolean
  status: ClaudeStatusLineMutationStatus
  changed: boolean
  text: string
  message: string
}

export function getClaudeStatusLineState(text: string, clientCommand: string): ClaudeStatusLineState {
  const parsed = parseConfiguration(text)
  if (!parsed.ok) return { status: parsed.status, message: parsed.message }
  const statusLine = parsed.value.statusLine
  if (statusLine === undefined) return { status: 'inactive', message: 'Claude Code statusLine is not configured.' }
  if (!isJsonObject(statusLine) || statusLine.type !== 'command' || typeof statusLine.command !== 'string') {
    return { status: 'unsupported', message: 'Claude Code statusLine must be a command object.' }
  }
  const command = statusLine.command
  if (!hasManagedMarker(command)) return { status: 'chainable', message: 'A custom Claude Code statusLine is configured and can be preserved.' }
  if (commandUsesChain(command) && !decodeChainedStatusLine(command)) {
    return { status: 'malformed', message: 'The Yira-managed Claude statusLine chain is malformed.' }
  }
  const managedPrefix = `${clientCommand.trim()} ${YIRA_MANAGED_STATUSLINE_MARKER}`
  const suffix = command.slice(managedPrefix.length)
  if (command === managedPrefix || command.startsWith(managedPrefix) && /^ --yira-chain=[A-Za-z0-9_-]+$/.test(suffix)) {
    return { status: 'active', message: 'Yira-managed Claude usage capture is active.' }
  }
  return { status: 'outdated', message: 'The Yira-managed Claude statusLine needs repair.' }
}

export function installClaudeStatusLine(text: string, clientCommand: string): ClaudeStatusLineMutationResult {
  const client = clientCommand.trim()
  if (!client || client.includes(YIRA_MANAGED_STATUSLINE_MARKER)) return mutationFailure(text, 'invalid', 'A resolved client command is required.')
  const parsed = parseConfiguration(text)
  if (!parsed.ok) return mutationFailure(text, parsed.status, parsed.message)

  const root = parsed.value
  const previous = root.statusLine
  let preserved: JsonObject | undefined
  if (previous !== undefined) {
    if (!isJsonObject(previous) || previous.type !== 'command' || typeof previous.command !== 'string') {
      return mutationFailure(text, 'unsupported', 'Claude Code statusLine must be a command object.')
    }
    if (hasManagedMarker(previous.command)) {
      preserved = decodeChainedStatusLine(previous.command) ?? undefined
      if (commandUsesChain(previous.command) && !preserved) return mutationFailure(text, 'malformed', 'The Yira-managed Claude statusLine chain is malformed.')
      if (!preserved && getClaudeStatusLineState(text, client).status === 'active') {
        return mutationSuccess(text, 'already-installed', false, 'Yira-managed Claude usage capture is already active.')
      }
    } else {
      preserved = previous
    }
  }

  const command = `${client} ${YIRA_MANAGED_STATUSLINE_MARKER}${preserved ? ` ${YIRA_CHAIN_PREFIX}${encodeBase64Url(JSON.stringify(preserved))}` : ''}`
  const next: JsonObject = { ...(isJsonObject(previous) ? previous : {}), type: 'command', command }
  root.statusLine = next
  const serialized = serializeConfiguration(root, text)
  if (serialized === text) return mutationSuccess(text, 'already-installed', false, 'Yira-managed Claude usage capture is already active.')
  return mutationSuccess(serialized, 'installed', true, 'Installed Yira-managed Claude usage capture.')
}

export function uninstallClaudeStatusLine(text: string, _clientCommand: string): ClaudeStatusLineMutationResult {
  const parsed = parseConfiguration(text)
  if (!parsed.ok) return mutationFailure(text, parsed.status, parsed.message)
  const previous = parsed.value.statusLine
  if (!isJsonObject(previous) || typeof previous.command !== 'string' || !hasManagedMarker(previous.command)) {
    return mutationSuccess(text, 'already-uninstalled', false, 'No Yira-managed Claude statusLine was found.')
  }
  const chained = decodeChainedStatusLine(previous.command)
  if (commandUsesChain(previous.command) && !chained) return mutationFailure(text, 'malformed', 'The Yira-managed Claude statusLine chain is malformed.')
  if (chained) parsed.value.statusLine = chained
  else delete parsed.value.statusLine
  return mutationSuccess(serializeConfiguration(parsed.value, text), 'uninstalled', true, 'Removed Yira-managed Claude usage capture.')
}

type ParseResult = { ok: true; value: JsonObject } | { ok: false; status: 'malformed' | 'unsupported'; message: string }

function parseConfiguration(text: string): ParseResult {
  let value: unknown
  try { value = JSON.parse(text) } catch {
    return { ok: false, status: 'malformed', message: 'Claude Code configuration is malformed JSON; no changes were made.' }
  }
  if (!isJsonObject(value)) return { ok: false, status: 'unsupported', message: 'Claude Code configuration must be a JSON object; no changes were made.' }
  return { ok: true, value }
}

function hasManagedMarker(command: string): boolean {
  return command.split(/\s+/).includes(YIRA_MANAGED_STATUSLINE_MARKER)
}

function commandUsesChain(command: string): boolean {
  return command.split(/\s+/).some((token) => token.startsWith(YIRA_CHAIN_PREFIX))
}

function decodeChainedStatusLine(command: string): JsonObject | null {
  const token = command.split(/\s+/).find((part) => part.startsWith(YIRA_CHAIN_PREFIX))
  if (!token) return null
  try {
    const encoded = token.slice(YIRA_CHAIN_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/')
    const value: unknown = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    return isJsonObject(value) && typeof value.command === 'string' && value.command.trim() ? value : null
  } catch { return null }
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function serializeConfiguration(value: JsonObject, originalText: string): string {
  const hasNewline = originalText.includes('\n') || originalText.includes('\r')
  const indent = hasNewline ? originalText.match(/(?:^|\r?\n)([ \t]+)"/)?.[1] ?? 2 : 0
  let serialized = JSON.stringify(value, null, indent)
  const newline = originalText.includes('\r\n') ? '\r\n' : '\n'
  if (hasNewline && newline !== '\n') serialized = serialized.replaceAll('\n', newline)
  if (originalText.endsWith('\n') || originalText.endsWith('\r')) serialized += newline
  return serialized
}

function mutationFailure(text: string, status: 'malformed' | 'unsupported' | 'invalid', message: string): ClaudeStatusLineMutationResult {
  return { ok: false, success: false, status, changed: false, text, message }
}

function mutationSuccess(text: string, status: 'installed' | 'already-installed' | 'uninstalled' | 'already-uninstalled', changed: boolean, message: string): ClaudeStatusLineMutationResult {
  return { ok: true, success: true, status, changed, text, message }
}
