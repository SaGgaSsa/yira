import { lstat, readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Payload entries older than this are not useful to the global usage indicator. */
export const CLAUDE_USAGE_CACHE_MAX_AGE_MS = 5 * 60 * 1000

export interface ClaudeUsageWindow {
  readonly usedPercentage: number
  readonly resetsAt: number
}

export interface ClaudeUsageSnapshot {
  readonly capturedAt: number
  readonly fiveHour?: ClaudeUsageWindow
  readonly sevenDay?: ClaudeUsageWindow
}

export function normalizeClaudeUsagePayload(input: unknown, capturedAt = Date.now()): ClaudeUsageSnapshot | null {
  if (!isRecord(input) || !isFiniteTimestamp(capturedAt)) return null

  const limits = findLimitsContainer(input)
  if (!limits) return null

  const fiveHour = normalizeWindow(limits, ['five_hour', 'fiveHour', 'five-hour', '5h'])
  const sevenDay = normalizeWindow(limits, ['seven_day', 'sevenDay', 'seven-day', '7d', 'week', 'weekly'])
  if (fiveHour === null || sevenDay === null) return null
  if (fiveHour === undefined && sevenDay === undefined) return null

  return {
    capturedAt,
    ...(fiveHour ? { fiveHour } : {}),
    ...(sevenDay ? { sevenDay } : {}),
  }
}

export function parseClaudeUsagePayload(text: string, capturedAt = Date.now()): ClaudeUsageSnapshot | null {
  if (typeof text !== 'string') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  return normalizeClaudeUsagePayload(parsed, capturedAt)
}

export interface ClaudeUsageStatusLinePayloadReadOptions {
  readonly directory?: string
  readonly now?: number
  readonly maxAgeMs?: number
}

const DEFAULT_CLAUDE_USAGE_STATUS_LINE_DIRECTORY = join(homedir(), '.claude', 'statusline')

export async function readClaudeUsageStatusLinePayload(
  options: ClaudeUsageStatusLinePayloadReadOptions = {},
): Promise<ClaudeUsageSnapshot | null> {
  const now = options.now ?? Date.now()
  const maxAgeMs = options.maxAgeMs ?? CLAUDE_USAGE_CACHE_MAX_AGE_MS
  if (!isFiniteTimestamp(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return null

  const configuredDirectory = options.directory?.trim()
  const directory = configuredDirectory ? resolve(configuredDirectory) : DEFAULT_CLAUDE_USAGE_STATUS_LINE_DIRECTORY

  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return null
  }

  const candidates: Array<{ readonly name: string; readonly path: string; readonly capturedAt: number }> = []
  for (const entry of entries) {
    if (!entry.name.endsWith('.json')) continue

    const path = join(directory, entry.name)
    let metadata: import('node:fs').Stats
    try {
      metadata = await lstat(path)
    } catch {
      continue
    }
    if (!metadata.isFile()) continue

    const capturedAt = Math.trunc(metadata.mtimeMs)
    if (!isFiniteTimestamp(capturedAt)) continue
    if (capturedAt > now || now - capturedAt >= maxAgeMs) continue
    candidates.push({ name: entry.name, path, capturedAt })
  }

  candidates.sort((left, right) => right.capturedAt - left.capturedAt || left.name.localeCompare(right.name))

  for (const candidate of candidates) {
    let text: string
    try {
      text = await readFile(candidate.path, 'utf8')
    } catch {
      continue
    }

    const snapshot = parseClaudeUsagePayload(text, candidate.capturedAt)
    if (!snapshot || (!snapshot.fiveHour && !snapshot.sevenDay)) continue
    return snapshot
  }

  return null
}

function findLimitsContainer(input: Record<string, unknown>): Record<string, unknown> | null {
  const nestedKeys = ['rate_limits', 'rateLimits', 'usage_limits', 'usageLimits', 'limits']
  const nestedValues = nestedKeys.filter((key) => Object.prototype.hasOwnProperty.call(input, key))
  if (nestedValues.length > 1) return null
  if (nestedValues.length === 1) {
    const nested = input[nestedValues[0]]
    return isRecord(nested) ? nested : null
  }
  return input
}

function normalizeWindow(
  input: Record<string, unknown>,
  keys: readonly string[],
): ClaudeUsageWindow | null | undefined {
  const presentKeys = keys.filter((key) => Object.prototype.hasOwnProperty.call(input, key))
  if (presentKeys.length === 0) return undefined

  let normalized: ClaudeUsageWindow | null = null
  for (const key of presentKeys) {
    const value = input[key]
    if (!isRecord(value)) return null

    const usedPercentage = parseKnownPercentage(value)
    const resetsAt = parseKnownResetTime(value)
    if (usedPercentage === null || resetsAt === null) return null

    const candidate = { usedPercentage, resetsAt }
    if (normalized && (normalized.usedPercentage !== candidate.usedPercentage || normalized.resetsAt !== candidate.resetsAt)) {
      return null
    }
    normalized = candidate
  }
  return normalized
}

function parseKnownPercentage(input: Record<string, unknown>): number | null {
  return parseConsistentKnownValue(input, ['used_percentage', 'usedPercentage', 'percentage', 'percent', 'utilization'], parsePercentage)
}

function parseKnownResetTime(input: Record<string, unknown>): number | null {
  return parseConsistentKnownValue(input, ['resets_at', 'resetsAt', 'reset_at', 'resetAt', 'reset_time', 'resetTime'], parseResetTime)
}

function parseConsistentKnownValue<T>(
  input: Record<string, unknown>,
  keys: readonly string[],
  parser: (value: unknown) => T | null,
): T | null {
  let found = false
  let result: T | null = null
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue
    const parsed = parser(input[key])
    if (parsed === null) return null
    if (found && !Object.is(parsed, result)) return null
    found = true
    result = parsed
  }
  return found ? result : null
}

function parsePercentage(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null
  return value
}

function parseResetTime(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) return null
    const milliseconds = value < 100_000_000_000 ? value * 1000 : value
    return Number.isSafeInteger(milliseconds) ? milliseconds : null
  }

  if (typeof value !== 'string' || !value.trim()) return null
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return parseResetTime(numeric)
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : null
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
