import { strict as assert } from 'node:assert'
import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  CLAUDE_USAGE_CACHE_MAX_AGE_MS,
  normalizeClaudeUsagePayload,
  parseClaudeUsagePayload,
  readClaudeUsageStatusLinePayload,
} from './claudeUsageStatusLinePayload'

const NOW = Date.parse('2026-08-11T15:00:00.000Z')
const FIVE_HOUR_RESET_SECONDS = Math.floor(Date.parse('2026-08-11T18:00:00.000Z') / 1000)
const SEVEN_DAY_RESET_SECONDS = Math.floor(Date.parse('2026-08-16T00:00:00.000Z') / 1000)

function completeSnapshot(capturedAt = NOW) {
  return {
    capturedAt,
    fiveHour: { usedPercentage: 42.5, resetsAt: FIVE_HOUR_RESET_SECONDS * 1000 },
    sevenDay: { usedPercentage: 17, resetsAt: SEVEN_DAY_RESET_SECONDS * 1000 },
  }
}

function snakeCasePayload(fiveHour = 42.5, sevenDay = 17): Record<string, unknown> {
  return {
    rate_limits: {
      five_hour: { used_percentage: fiveHour, resets_at: FIVE_HOUR_RESET_SECONDS },
      seven_day: { used_percentage: sevenDay, resets_at: SEVEN_DAY_RESET_SECONDS },
    },
    credentials: 'must not be retained',
    transcript_path: '/private/transcript.jsonl',
  }
}

async function withTempDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'yira-claude-statusline-'))
  try {
    return await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function writePayload(directory: string, name: string, payload: unknown, mtime: number): Promise<string> {
  const path = join(directory, name)
  await writeFile(path, typeof payload === 'string' ? payload : JSON.stringify(payload))
  await utimes(path, mtime / 1000, mtime / 1000)
  return path
}

test('normalizes snake_case status-line payloads and discards unrelated data', () => {
  assert.deepEqual(normalizeClaudeUsagePayload(snakeCasePayload(), NOW), completeSnapshot())
})

test('normalizes camelCase aliases and accepts one complete usage window', () => {
  const snapshot = normalizeClaudeUsagePayload({
    rateLimits: {
      fiveHour: {
        usedPercentage: 31,
        resetsAt: new Date(FIVE_HOUR_RESET_SECONDS * 1000).toISOString(),
      },
    },
  }, NOW)

  assert.deepEqual(snapshot, {
    capturedAt: NOW,
    fiveHour: { usedPercentage: 31, resetsAt: FIVE_HOUR_RESET_SECONDS * 1000 },
  })
})

test('parses JSON payloads and rejects malformed or incomplete data', () => {
  assert.deepEqual(parseClaudeUsagePayload(JSON.stringify(snakeCasePayload()), NOW), completeSnapshot())
  assert.equal(parseClaudeUsagePayload('{malformed', NOW), null)
  assert.equal(normalizeClaudeUsagePayload('not an object', NOW), null)
  assert.equal(normalizeClaudeUsagePayload({ rate_limits: {} }, NOW), null)
  assert.equal(normalizeClaudeUsagePayload({ rate_limits: { five_hour: { used_percentage: 20 } } }, NOW), null)
  assert.equal(normalizeClaudeUsagePayload({ rate_limits: { seven_day: { used_percentage: 20, resets_at: 'never' } } }, NOW), null)
  assert.equal(normalizeClaudeUsagePayload({ rate_limits: { five_hour: { used_percentage: 101, resets_at: FIVE_HOUR_RESET_SECONDS } } }, NOW), null)
  assert.equal(normalizeClaudeUsagePayload({ rate_limits: { five_hour: { used_percentage: Number.NaN, resets_at: FIVE_HOUR_RESET_SECONDS } } }, NOW), null)
})

test('rejects conflicting duplicate aliases and invalid sibling windows', () => {
  assert.equal(normalizeClaudeUsagePayload({
    rate_limits: {
      five_hour: { used_percentage: 42, resets_at: FIVE_HOUR_RESET_SECONDS },
      fiveHour: { used_percentage: 43, resets_at: FIVE_HOUR_RESET_SECONDS },
    },
  }, NOW), null)

  assert.equal(normalizeClaudeUsagePayload({
    rateLimits: {
      sevenDay: { usedPercentage: 17, resetsAt: SEVEN_DAY_RESET_SECONDS },
      seven_day: { used_percentage: 17, resets_at: 'not a date' },
    },
  }, NOW), null)

  assert.equal(normalizeClaudeUsagePayload({
    rate_limits: {
      five_hour: { used_percentage: 42, resets_at: FIVE_HOUR_RESET_SECONDS },
      seven_day: { used_percentage: 17 },
    },
  }, NOW), null)
})

test('selects the newest valid direct JSON payload by integer mtime', async () => {
  await withTempDirectory(async (directory) => {
    await writePayload(directory, 'older.json', snakeCasePayload(12, 7), NOW - 120_000)
    await writePayload(directory, 'newer.json', snakeCasePayload(88, 29), NOW - 60_000)

    assert.deepEqual(await readClaudeUsageStatusLinePayload({ directory, now: NOW }), {
      capturedAt: NOW - 60_000,
      fiveHour: { usedPercentage: 88, resetsAt: FIVE_HOUR_RESET_SECONDS * 1000 },
      sevenDay: { usedPercentage: 29, resetsAt: SEVEN_DAY_RESET_SECONDS * 1000 },
    })
  })
})

test('falls back after malformed, stale, future, and invalid newer candidates', async () => {
  await withTempDirectory(async (directory) => {
    await writePayload(directory, 'valid.json', snakeCasePayload(55, 24), NOW - 120_000)
    await writePayload(directory, 'invalid.json', {
      rate_limits: { five_hour: { used_percentage: 101, resets_at: FIVE_HOUR_RESET_SECONDS } },
    }, NOW - 2_000)
    await writePayload(directory, 'stale.json', snakeCasePayload(70, 30), NOW - CLAUDE_USAGE_CACHE_MAX_AGE_MS)
    await writePayload(directory, 'malformed.json', '{malformed', NOW - 1_000)
    await writePayload(directory, 'future.json', snakeCasePayload(99, 99), NOW + 1_000)

    assert.deepEqual(await readClaudeUsageStatusLinePayload({ directory, now: NOW }), {
      capturedAt: NOW - 120_000,
      fiveHour: { usedPercentage: 55, resetsAt: FIVE_HOUR_RESET_SECONDS * 1000 },
      sevenDay: { usedPercentage: 24, resetsAt: SEVEN_DAY_RESET_SECONDS * 1000 },
    })
  })
})

test('returns null for a missing status-line directory', async () => {
  await withTempDirectory(async (directory) => {
    assert.equal(await readClaudeUsageStatusLinePayload({ directory: join(directory, 'missing'), now: NOW }), null)
  })
})

test('ignores temporary, non-json, nested, and symlink entries', async () => {
  await withTempDirectory(async (directory) => {
    await writePayload(directory, 'direct.json', snakeCasePayload(44, 11), NOW - 180_000)
    await writePayload(directory, 'ignored.json.tmp', snakeCasePayload(91, 91), NOW - 1_000)
    await writePayload(directory, 'ignored.txt', snakeCasePayload(92, 92), NOW - 2_000)
    await writePayload(directory, 'ignored.JSON', snakeCasePayload(93, 93), NOW - 3_000)

    const nested = join(directory, 'nested')
    await mkdir(nested)
    await writePayload(nested, 'nested.json', snakeCasePayload(94, 94), NOW - 500)

    const outside = await writePayload(directory, 'symlink-target.txt', snakeCasePayload(95, 95), NOW - 500)
    await symlink(outside, join(directory, 'ignored-link.json'))

    assert.deepEqual(await readClaudeUsageStatusLinePayload({ directory, now: NOW }), {
      capturedAt: NOW - 180_000,
      fiveHour: { usedPercentage: 44, resetsAt: FIVE_HOUR_RESET_SECONDS * 1000 },
      sevenDay: { usedPercentage: 11, resetsAt: SEVEN_DAY_RESET_SECONDS * 1000 },
    })
  })
})
