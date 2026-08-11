import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** Cache entries older than this are not useful to the global usage indicator. */
export const CLAUDE_USAGE_CACHE_MAX_AGE_MS = 5 * 60 * 1000

/** Test-only path override consumed by the standalone status-line resource. */
export const CLAUDE_USAGE_CACHE_PATH_ENV = 'YIRA_CLAUDE_USAGE_CACHE_PATH'

const DEFAULT_CLAUDE_USAGE_CACHE_PATH = join(homedir(), '.yira', 'claude-usage.json')
const MISSING = Symbol('missing')

export interface ClaudeUsageWindow {
  readonly usedPercentage: number
  /** Unix epoch milliseconds. */
  readonly resetsAt: number
}

export interface ClaudeUsageSnapshot {
  /** Unix epoch milliseconds when the status-line payload was captured. */
  readonly capturedAt: number
  readonly fiveHour?: ClaudeUsageWindow
  readonly sevenDay?: ClaudeUsageWindow
}

export interface ClaudeUsageCachePathOptions {
  /** Explicit path injection for callers/tests; the normal path is user-level and stable. */
  readonly path?: string
}

export interface ClaudeUsageCacheReadOptions extends ClaudeUsageCachePathOptions {
  /** Clock injection for deterministic freshness checks. */
  readonly now?: number
  readonly maxAgeMs?: number
}

/** Return the default cache path, or an explicitly supplied test path. */
export function getClaudeUsageCachePath(options: ClaudeUsageCachePathOptions = {}): string {
  const configuredPath = options.path?.trim()
  return configuredPath ? resolve(configuredPath) : DEFAULT_CLAUDE_USAGE_CACHE_PATH
}

/**
 * Normalize the small subset of Claude's status-line payload needed by Yira.
 *
 * Known Claude versions have emitted both snake_case and camelCase names. The
 * returned object contains only the two usage windows, their percentages/reset
 * times, and the local capture timestamp; credentials, transcripts, model
 * details, and all other payload fields are deliberately discarded.
 */
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

/** Parse one status-line JSON string and apply the same safe normalization. */
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

/** Alias for callers that want the input boundary named after statusLine. */
export const normalizeClaudeUsageStatusLinePayload = normalizeClaudeUsagePayload
export const parseClaudeUsageStatusLinePayload = parseClaudeUsagePayload

/**
 * Read a fresh cache entry. Only a newly allocated normalized snapshot is
 * returned; malformed, stale, or otherwise unsafe disk content is unavailable.
 */
export async function readClaudeUsageCache(options: ClaudeUsageCacheReadOptions = {}): Promise<ClaudeUsageSnapshot | null> {
  const cachePath = getClaudeUsageCachePath(options)
  let text: string
  try {
    text = await readFile(cachePath, 'utf8')
  } catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  const snapshot = normalizeCachedSnapshot(parsed)
  if (!snapshot) return null

  const now = options.now ?? Date.now()
  const maxAgeMs = options.maxAgeMs ?? CLAUDE_USAGE_CACHE_MAX_AGE_MS
  if (!isFiniteTimestamp(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return null
  if (now - snapshot.capturedAt >= maxAgeMs) return null

  return snapshot
}

/**
 * Persist only a normalized snapshot using a same-directory temporary file and
 * rename. The cache directory/file are private where the platform supports
 * Unix modes. A failed write leaves an existing target untouched.
 */
export async function writeClaudeUsageCache(
  snapshot: ClaudeUsageSnapshot,
  options: ClaudeUsageCachePathOptions = {},
): Promise<boolean> {
  const normalized = normalizeCachedSnapshot(snapshot)
  if (!normalized) return false

  const cachePath = getClaudeUsageCachePath(options)
  const directory = dirname(cachePath)
  const temporaryPath = join(directory, `.claude-usage-${process.pid}-${randomUUID()}.tmp`)
  const serialized = JSON.stringify(normalized)

  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await tightenMode(directory, 0o700)
    await writeFile(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await tightenMode(temporaryPath, 0o600)
    await rename(temporaryPath, cachePath)
    await tightenMode(cachePath, 0o600)
    return true
  } catch {
    await unlink(temporaryPath).catch(() => undefined)
    return false
  }
}

/** Alias used by integration callers that describe the operation as saving. */
export const saveClaudeUsageCache = writeClaudeUsageCache

function normalizeCachedSnapshot(input: unknown): ClaudeUsageSnapshot | null {
  if (!isRecord(input) || !isFiniteTimestamp(input.capturedAt)) return null

  const fiveHour = normalizeCanonicalWindow(input.fiveHour)
  const sevenDay = normalizeCanonicalWindow(input.sevenDay)
  if (fiveHour === null || sevenDay === null) return null
  if (fiveHour === undefined && sevenDay === undefined) return null

  return {
    capturedAt: input.capturedAt,
    ...(fiveHour ? { fiveHour } : {}),
    ...(sevenDay ? { sevenDay } : {}),
  }
}

function normalizeCanonicalWindow(input: unknown): ClaudeUsageWindow | null | undefined {
  if (input === undefined) return undefined
  if (!isRecord(input)) return null

  const usedPercentage = parsePercentage(input.usedPercentage)
  const resetsAt = parseResetTime(input.resetsAt)
  if (usedPercentage === null || resetsAt === null) return null
  return { usedPercentage, resetsAt }
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
  const value = findKnownValue(input, keys)
  if (value === MISSING) return undefined
  if (!isRecord(value)) return null

  const usedPercentage = parseKnownPercentage(value)
  const resetsAt = parseKnownResetTime(value)
  if (usedPercentage === null || resetsAt === null) return null
  return { usedPercentage, resetsAt }
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

function findKnownValue(input: Record<string, unknown>, keys: readonly string[]): unknown | typeof MISSING {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) return input[key]
  }
  return MISSING
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

async function tightenMode(path: string, mode: number): Promise<void> {
  await chmod(path, mode).catch(() => undefined)
}
