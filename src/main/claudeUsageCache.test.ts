import { strict as assert } from 'node:assert'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { test } from 'node:test'

import {
  CLAUDE_USAGE_CACHE_MAX_AGE_MS,
  normalizeClaudeUsagePayload,
  readClaudeUsageCache,
  writeClaudeUsageCache,
  type ClaudeUsageSnapshot,
} from './claudeUsageCache'

const NOW = Date.parse('2026-08-11T15:00:00.000Z')
const FIVE_HOUR_RESET_SECONDS = Math.floor(Date.parse('2026-08-11T18:00:00.000Z') / 1000)
const SEVEN_DAY_RESET_SECONDS = Math.floor(Date.parse('2026-08-16T00:00:00.000Z') / 1000)

function completeSnapshot(capturedAt = NOW): ClaudeUsageSnapshot {
  return {
    capturedAt,
    fiveHour: { usedPercentage: 42.5, resetsAt: FIVE_HOUR_RESET_SECONDS * 1000 },
    sevenDay: { usedPercentage: 17, resetsAt: SEVEN_DAY_RESET_SECONDS * 1000 },
  }
}

async function withTempDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'yira-claude-usage-'))
  try {
    return await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function runStatusLine(input: string, cachePath: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), 'resources', 'claude-usage-status-line.mjs')], {
      env: { ...process.env, YIRA_CLAUDE_USAGE_CACHE_PATH: cachePath },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({
      code: code ?? -1,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }))
    child.stdin.end(input)
  })
}

test('normalizes the documented snake_case Claude status-line payload and drops unrelated fields', () => {
  const snapshot = normalizeClaudeUsagePayload({
    rate_limits: {
      five_hour: { used_percentage: 42.5, resets_at: FIVE_HOUR_RESET_SECONDS },
      seven_day: { used_percentage: 17, resets_at: SEVEN_DAY_RESET_SECONDS },
    },
    model: { id: 'claude-opus' },
    credentials: 'must not be retained',
  }, NOW)

  assert.deepEqual(snapshot, completeSnapshot())
})

test('normalizes camelCase rate-limit and window fields', () => {
  const snapshot = normalizeClaudeUsagePayload({
    rateLimits: {
      fiveHour: { usedPercentage: 31, resetsAt: new Date(FIVE_HOUR_RESET_SECONDS * 1000).toISOString() },
      sevenDay: { usedPercentage: 8.25, resetsAt: SEVEN_DAY_RESET_SECONDS * 1000 },
    },
  }, NOW)

  assert.deepEqual(snapshot, {
    capturedAt: NOW,
    fiveHour: { usedPercentage: 31, resetsAt: FIVE_HOUR_RESET_SECONDS * 1000 },
    sevenDay: { usedPercentage: 8.25, resetsAt: SEVEN_DAY_RESET_SECONDS * 1000 },
  })
})

test('accepts a payload containing only one complete usage window', () => {
  const snapshot = normalizeClaudeUsagePayload({
    rate_limits: {
      five_hour: { used_percentage: 0, resets_at: FIVE_HOUR_RESET_SECONDS },
    },
  }, NOW)

  assert.deepEqual(snapshot, {
    capturedAt: NOW,
    fiveHour: { usedPercentage: 0, resetsAt: FIVE_HOUR_RESET_SECONDS * 1000 },
  })
})

test('rejects invalid JSON-shaped values and incomplete windows', () => {
  assert.equal(normalizeClaudeUsagePayload('not an object', NOW), null)
  assert.equal(normalizeClaudeUsagePayload({ rate_limits: {} }, NOW), null)
  assert.equal(normalizeClaudeUsagePayload({ rate_limits: { five_hour: { used_percentage: 20 } } }, NOW), null)
  assert.equal(normalizeClaudeUsagePayload({ rate_limits: { seven_day: { used_percentage: 20, resets_at: 'never' } } }, NOW), null)
  assert.equal(normalizeClaudeUsagePayload({ rate_limits: { five_hour: { used_percentage: 101, resets_at: FIVE_HOUR_RESET_SECONDS } } }, NOW), null)
  assert.equal(normalizeClaudeUsagePayload({ rate_limits: { five_hour: { used_percentage: Number.NaN, resets_at: FIVE_HOUR_RESET_SECONDS } } }, NOW), null)
})

test('writes a minimal cache atomically with restrictive permissions', async () => {
  await withTempDirectory(async (directory) => {
    const cachePath = join(directory, 'nested', 'claude-usage.json')
    await writeClaudeUsageCache(completeSnapshot(), { path: cachePath })

    const persisted = JSON.parse(await readFile(cachePath, 'utf8')) as Record<string, unknown>
    assert.deepEqual(persisted, {
      capturedAt: NOW,
      fiveHour: { usedPercentage: 42.5, resetsAt: FIVE_HOUR_RESET_SECONDS * 1000 },
      sevenDay: { usedPercentage: 17, resetsAt: SEVEN_DAY_RESET_SECONDS * 1000 },
    })
    assert.equal('credentials' in persisted, false)
    assert.equal((await stat(cachePath)).mode & 0o777, 0o600)
    assert.equal((await stat(join(directory, 'nested'))).mode & 0o777, 0o700)
    assert.deepEqual(await readdir(join(directory, 'nested')), ['claude-usage.json'])
  })
})

test('reads only a fresh safe snapshot and rejects an expired cache', async () => {
  await withTempDirectory(async (directory) => {
    const cachePath = join(directory, 'claude-usage.json')
    await writeClaudeUsageCache(completeSnapshot(NOW - CLAUDE_USAGE_CACHE_MAX_AGE_MS + 1), { path: cachePath })

    assert.deepEqual(await readClaudeUsageCache({ path: cachePath, now: NOW }), completeSnapshot(NOW - CLAUDE_USAGE_CACHE_MAX_AGE_MS + 1))

    await writeClaudeUsageCache(completeSnapshot(NOW - CLAUDE_USAGE_CACHE_MAX_AGE_MS), { path: cachePath })
    assert.equal(await readClaudeUsageCache({ path: cachePath, now: NOW }), null)
  })
})

test('ignores malformed cache text without exposing it to callers', async () => {
  await withTempDirectory(async (directory) => {
    const cachePath = join(directory, 'claude-usage.json')
    await writeFile(cachePath, '{"credentials":"secret"}', { mode: 0o600 })
    assert.equal(await readClaudeUsageCache({ path: cachePath, now: NOW }), null)
  })
})

test('status-line resource persists only accepted normalized values through the test path override', async () => {
  await withTempDirectory(async (directory) => {
    const cachePath = join(directory, 'claude-usage.json')
    const result = await runStatusLine(JSON.stringify({
      rate_limits: {
        five_hour: { used_percentage: 54, resets_at: FIVE_HOUR_RESET_SECONDS },
        seven_day: { used_percentage: 21, resets_at: SEVEN_DAY_RESET_SECONDS },
      },
      transcript_path: '/private/transcript.jsonl',
    }), cachePath)

    assert.equal(result.code, 0)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, '')
    assert.deepEqual(JSON.parse(await readFile(cachePath, 'utf8')), {
      capturedAt: (JSON.parse(await readFile(cachePath, 'utf8')) as { capturedAt: number }).capturedAt,
      fiveHour: { usedPercentage: 54, resetsAt: FIVE_HOUR_RESET_SECONDS * 1000 },
      sevenDay: { usedPercentage: 21, resetsAt: SEVEN_DAY_RESET_SECONDS * 1000 },
    })
    assert.equal((await stat(cachePath)).mode & 0o777, 0o600)
  })
})

test('status-line resource leaves an existing cache unchanged for invalid input', async () => {
  await withTempDirectory(async (directory) => {
    const cachePath = join(directory, 'claude-usage.json')
    const original = JSON.stringify(completeSnapshot())
    await writeFile(cachePath, original, { mode: 0o600 })
    const result = await runStatusLine('{"rate_limits":{"five_hour":{"used_percentage":55}}}', cachePath)

    assert.equal(result.code, 0)
    assert.equal(await readFile(cachePath, 'utf8'), original)
  })
})

test('status-line resource leaves an existing cache unchanged for malformed JSON', async () => {
  await withTempDirectory(async (directory) => {
    const cachePath = join(directory, 'claude-usage.json')
    const original = JSON.stringify(completeSnapshot())
    await writeFile(cachePath, original, { mode: 0o600 })
    const result = await runStatusLine('{malformed', cachePath)

    assert.equal(result.code, 0)
    assert.equal(await readFile(cachePath, 'utf8'), original)
  })
})

test('normalization does not accept an invalid sibling window beside a valid one', () => {
  assert.equal(normalizeClaudeUsagePayload({
    rate_limits: {
      five_hour: { used_percentage: 42, resets_at: FIVE_HOUR_RESET_SECONDS },
      seven_day: { used_percentage: 17 },
    },
  }, NOW), null)
})

test('cache directory mode is tightened when it already exists', async () => {
  await withTempDirectory(async (directory) => {
    const cacheDirectory = join(directory, 'cache')
    const cachePath = join(cacheDirectory, 'claude-usage.json')
    await writeFile(join(directory, 'placeholder'), 'x')
    await mkdir(cacheDirectory, { recursive: true, mode: 0o755 })
    await chmod(cacheDirectory, 0o755)

    await writeClaudeUsageCache(completeSnapshot(), { path: cachePath })
    assert.equal((await stat(cacheDirectory)).mode & 0o777, 0o700)
  })
})
