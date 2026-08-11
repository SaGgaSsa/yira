#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { chmod, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

// Claude invokes statusLine commands with a JSON payload on stdin. This
// command intentionally emits no status text: its only job is to make the
// safe, short-lived usage snapshot available to Yira's main process.
const CACHE_PATH_ENV = 'YIRA_CLAUDE_USAGE_CACHE_PATH'
const DEFAULT_CACHE_PATH = join(homedir(), '.yira', 'claude-usage.json')

async function readInput() {
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function normalizePayload(input, capturedAt) {
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

function findLimitsContainer(input) {
  const keys = ['rate_limits', 'rateLimits', 'usage_limits', 'usageLimits', 'limits']
  const found = keys.filter((key) => Object.prototype.hasOwnProperty.call(input, key))
  if (found.length > 1) return null
  if (found.length === 1) return isRecord(input[found[0]]) ? input[found[0]] : null
  return input
}

function normalizeWindow(input, keys) {
  const value = findKnownValue(input, keys)
  if (value === MISSING) return undefined
  if (!isRecord(value)) return null

  const usedPercentage = parseKnownValue(inputValueKeys(value, ['used_percentage', 'usedPercentage', 'percentage', 'percent', 'utilization']), parsePercentage)
  const resetsAt = parseKnownValue(inputValueKeys(value, ['resets_at', 'resetsAt', 'reset_at', 'resetAt', 'reset_time', 'resetTime']), parseResetTime)
  if (usedPercentage === null || resetsAt === null) return null
  return { usedPercentage, resetsAt }
}

function inputValueKeys(input, keys) {
  return keys.filter((key) => Object.prototype.hasOwnProperty.call(input, key)).map((key) => input[key])
}

function parseKnownValue(values, parser) {
  if (values.length === 0) return null
  let result = null
  for (const value of values) {
    const parsed = parser(value)
    if (parsed === null) return null
    if (result !== null && !Object.is(parsed, result)) return null
    result = parsed
  }
  return result
}

function findKnownValue(input, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) return input[key]
  }
  return MISSING
}

function parsePercentage(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

function parseResetTime(value) {
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

function isFiniteTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function writeAtomic(snapshot, cachePath) {
  const directory = dirname(cachePath)
  const temporaryPath = join(directory, `.claude-usage-${process.pid}-${randomUUID()}.tmp`)
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    await chmod(directory, 0o700).catch(() => undefined)
    await writeFile(temporaryPath, JSON.stringify(snapshot), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await chmod(temporaryPath, 0o600).catch(() => undefined)
    await rename(temporaryPath, cachePath)
    await chmod(cachePath, 0o600).catch(() => undefined)
  } catch {
    await unlink(temporaryPath).catch(() => undefined)
  }
}

async function main() {
  const input = await readInput()
  const snapshot = normalizePayload(input, Date.now())
  if (!snapshot) return

  const configuredPath = process.env[CACHE_PATH_ENV]?.trim()
  const cachePath = configuredPath ? resolve(configuredPath) : DEFAULT_CACHE_PATH
  await writeAtomic(snapshot, cachePath)
}

const MISSING = Symbol('missing')
void main().catch(() => undefined)
