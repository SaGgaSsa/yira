# Passive Claude Usage Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Claude usage from JSON payloads written by an already-configured Claude Code status line, without Yira changing Claude settings or writing a usage cache.

**Architecture:** Replace the Yira-owned `~/.yira/claude-usage.json` cache with a passive reader for `~/.claude/statusline/*.json`. The reader chooses the newest regular JSON file whose normalized rate-limit data is fresh, then the existing `AgentUsageService` and renderer consume its existing safe snapshot shape unchanged. Remove all Yira-owned Claude status-line configuration, IPC, UI, tests, and package resources.

**Tech Stack:** Electron main process, strict TypeScript, Node `fs/promises`, Node built-in test runner, TSX, React.

## Global Constraints

- Never create, alter, wrap, delete, or clean `~/.claude/settings.json`, `~/.claude/statusline/`, or their contents.
- Only retain normalized `fiveHour` and `sevenDay` limits in memory; never log or forward raw payload fields.
- Ignore absent directories, temporary files, unreadable files, non-regular entries, malformed JSON, unsupported payloads, and stale payloads without throwing.
- Use a file's modification time as its capture time and retain the existing five-minute freshness boundary.
- Preserve the existing `AgentUsageSnapshot` IPC and renderer contracts.
- Follow repository style: strict TypeScript, two-space indentation, single quotes, no semicolons.

---

### Task 1: Add the passive Claude status-line payload reader

**Files:**
- Create: `src/main/claudeUsageStatusLinePayload.ts`
- Create: `src/main/claudeUsageStatusLinePayload.test.ts`
- Delete: `src/main/claudeUsageCache.ts`
- Delete: `src/main/claudeUsageCache.test.ts`

**Interfaces:**
- Consumes: raw Claude Code payloads with optional `rate_limits.five_hour` and `rate_limits.seven_day` fields, written atomically by an external status-line script.
- Produces: `readClaudeUsageStatusLinePayload(options?: ClaudeUsageStatusLinePayloadReadOptions): Promise<ClaudeUsageSnapshot | null>`.
- Produces: `normalizeClaudeUsagePayload(input: unknown, capturedAt?: number): ClaudeUsageSnapshot | null` and `parseClaudeUsagePayload(text: string, capturedAt?: number): ClaudeUsageSnapshot | null` for pure parsing tests.
- Produces: `CLAUDE_USAGE_CACHE_MAX_AGE_MS` with the existing five-minute value, so `src/main/index.ts` needs no duplicate freshness constant.

- [ ] **Step 1: Write the failing reader tests**

Create `src/main/claudeUsageStatusLinePayload.test.ts`. Use `mkdtemp` and `rm` to isolate each test directory. Write raw payload files with `writeFile`, then set their timestamps with `utimes` so test ordering is deterministic. Include these tests:

```ts
const NOW = Date.parse('2026-08-11T15:00:00.000Z')
const FIVE_HOUR_RESET_SECONDS = Math.floor(Date.parse('2026-08-11T18:00:00.000Z') / 1_000)
const SEVEN_DAY_RESET_SECONDS = Math.floor(Date.parse('2026-08-16T00:00:00.000Z') / 1_000)
const validRateLimits = {
  rate_limits: {
    five_hour: { used_percentage: 42.5, resets_at: FIVE_HOUR_RESET_SECONDS },
    seven_day: { used_percentage: 17, resets_at: SEVEN_DAY_RESET_SECONDS },
  },
}

async function writePayload(path: string, payload: unknown, modifiedAt: number): Promise<void> {
  await writeFile(path, typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8')
  await utimes(path, modifiedAt / 1_000, modifiedAt / 1_000)
}

function completeSnapshot(capturedAt: number) {
  return {
    capturedAt,
    fiveHour: { usedPercentage: 42.5, resetsAt: FIVE_HOUR_RESET_SECONDS * 1_000 },
    sevenDay: { usedPercentage: 17, resetsAt: SEVEN_DAY_RESET_SECONDS * 1_000 },
  }
}
```

```ts
test('reads the newest fresh valid rate-limit payload from a status-line directory', async () => {
  await withTempDirectory(async (directory) => {
    await writePayload(join(directory, 'older.json'), { rate_limits: { five_hour: { used_percentage: 12, resets_at: FIVE_HOUR_RESET_SECONDS } } }, NOW - 2_000)
    await writePayload(join(directory, 'current.json'), { rate_limits: { seven_day: { used_percentage: 33, resets_at: SEVEN_DAY_RESET_SECONDS } } }, NOW - 1_000)

    assert.deepEqual(await readClaudeUsageStatusLinePayload({ directory, now: NOW }), {
      capturedAt: NOW - 1_000,
      sevenDay: { usedPercentage: 33, resetsAt: SEVEN_DAY_RESET_SECONDS * 1_000 },
    })
  })
})

test('falls back when the newest status-line payload is malformed or stale', async () => {
  await withTempDirectory(async (directory) => {
    await writePayload(join(directory, 'valid.json'), validRateLimits, NOW - 1_000)
    await writePayload(join(directory, 'broken.json'), '{not json', NOW - 500)
    await writePayload(join(directory, 'expired.json'), validRateLimits, NOW - CLAUDE_USAGE_CACHE_MAX_AGE_MS)

    assert.deepEqual(await readClaudeUsageStatusLinePayload({ directory, now: NOW }), completeSnapshot(NOW - 1_000))
  })
})

test('ignores missing directories, temporary files, nested directories, and non-JSON files', async () => {
  await withTempDirectory(async (directory) => {
    await writePayload(join(directory, '.session.tmp'), validRateLimits, NOW - 500)
    await writePayload(join(directory, 'session.txt'), validRateLimits, NOW - 500)
    await mkdir(join(directory, 'nested.json'))

    assert.equal(await readClaudeUsageStatusLinePayload({ directory, now: NOW }), null)
    assert.equal(await readClaudeUsageStatusLinePayload({ directory: join(directory, 'missing'), now: NOW }), null)
  })
})
```

Keep pure normalization coverage for snake_case, camelCase, one complete window, invalid values, conflicting aliases, and invalid sibling windows. The external payload is raw; do not retain old tests for Yira cache writing or the standalone resource.

- [ ] **Step 2: Run the new test file and verify it fails for the missing module**

Run:

```bash
npx tsx --test src/main/claudeUsageStatusLinePayload.test.ts
```

Expected: FAIL because `./claudeUsageStatusLinePayload` does not exist.

- [ ] **Step 3: Implement the smallest passive reader**

Create `src/main/claudeUsageStatusLinePayload.ts` by moving the current pure normalization logic from `claudeUsageCache.ts` and removing every write/cache-path API. Define the default directory and reader contract as follows:

```ts
const DEFAULT_CLAUDE_STATUS_LINE_DIRECTORY = join(homedir(), '.claude', 'statusline')

export interface ClaudeUsageStatusLinePayloadReadOptions {
  readonly directory?: string
  readonly now?: number
  readonly maxAgeMs?: number
}

export async function readClaudeUsageStatusLinePayload(
  options: ClaudeUsageStatusLinePayloadReadOptions = {},
): Promise<ClaudeUsageSnapshot | null> {
  const directory = options.directory?.trim() ? resolve(options.directory) : DEFAULT_CLAUDE_STATUS_LINE_DIRECTORY
  const now = options.now ?? Date.now()
  const maxAgeMs = options.maxAgeMs ?? CLAUDE_USAGE_CACHE_MAX_AGE_MS
  if (!isFiniteTimestamp(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return null

  let entries: Dirent[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return null
  }

  const candidates = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map(async (entry) => {
      const path = join(directory, entry.name)
      try {
        const metadata = await stat(path)
        return { path, capturedAt: metadata.mtimeMs }
      } catch {
        return null
      }
    }))

  for (const candidate of candidates.flatMap((candidate) => candidate ? [candidate] : []).sort((left, right) => right.capturedAt - left.capturedAt)) {
    if (candidate.capturedAt > now || now - candidate.capturedAt >= maxAgeMs) continue
    try {
      const snapshot = parseClaudeUsagePayload(await readFile(candidate.path, 'utf8'), candidate.capturedAt)
      if (snapshot) return snapshot
    } catch {
      // A concurrently replaced candidate is ignored; try the next one.
    }
  }
  return null
}
```

Use `Math.trunc(metadata.mtimeMs)` before passing it to the normalizer so `capturedAt` stays an integer Unix-millisecond timestamp. Keep `parseClaudeUsagePayload` and the normalizer defensive: raw input cannot reach IPC unless it produces at least one complete normalized window.

- [ ] **Step 4: Run the reader tests and strict typecheck**

Run:

```bash
npx tsx --test src/main/claudeUsageStatusLinePayload.test.ts
npx tsc --noEmit
```

Expected: PASS for all payload-reader tests and no TypeScript diagnostics.

- [ ] **Step 5: Commit the reader**

```bash
git add src/main/claudeUsageStatusLinePayload.ts src/main/claudeUsageStatusLinePayload.test.ts src/main/claudeUsageCache.ts src/main/claudeUsageCache.test.ts
git commit -m "feat: read Claude status-line usage payloads"
```

### Task 2: Wire the passive source and remove Yira-managed status-line setup

**Files:**
- Modify: `src/main/index.ts:18,189-203`
- Modify: `src/main/ipc/settings.ts:1-60,116-119`
- Modify: `src/preload/index.ts:55-61`
- Modify: `src/renderer/src/electron.d.ts:72-82`
- Modify: `src/renderer/src/components/SettingsPanel.tsx:352-359`
- Modify: `src/main/ipc/settings.test.ts`
- Modify: `package.json:17,85-98`
- Delete: `src/main/claudeUsageStatusLineConfiguration.ts`
- Delete: `src/main/claudeUsageStatusLineConfiguration.test.ts`
- Delete: `resources/claude-usage-status-line.mjs`

**Interfaces:**
- Consumes: `readClaudeUsageStatusLinePayload()` from Task 1.
- Produces: The existing `AgentUsageProviderSnapshot` passed through `AgentUsageService`, with no changes to renderer IPC shape.
- Removes: `agentUsage:claudeStatusLine:install`, `agentUsage:claudeStatusLine:uninstall`, and their preload/declaration methods.

- [ ] **Step 1: Write the failing integration and source-surface tests**

Replace `src/main/ipc/settings.test.ts` with a test that asserts ordinary agent hooks remain exposed, but all Claude usage status-line setup APIs, configuration imports, and Settings panel controls are absent:

```ts
test('does not expose Yira-managed Claude statusLine setup', async () => {
  const settings = await source('src/main/ipc/settings.ts')
  const preload = await source('src/preload/index.ts')
  const declaration = await source('src/renderer/src/electron.d.ts')
  const panel = await source('src/renderer/src/components/SettingsPanel.tsx')

  assert.doesNotMatch(settings, /claudeUsageStatusLineConfiguration/)
  assert.doesNotMatch(settings, /agentUsage:claudeStatusLine:/)
  assert.doesNotMatch(preload, /ClaudeUsageStatusLine/)
  assert.doesNotMatch(declaration, /ClaudeUsageStatusLine/)
  assert.doesNotMatch(panel, /Claude usage status line/)
  assert.match(settings, /agentHooks:configure/)
})
```

Add an `AgentUsageService` test with a Claude provider reader returning a Task 1 snapshot, asserting it yields the unchanged safe `claude` windows. This protects the integration boundary while no raw payload reaches the service.

- [ ] **Step 2: Run the affected tests and verify the intended failures**

Run:

```bash
npx tsx --test src/main/ipc/settings.test.ts src/main/agentUsage.test.ts
```

Expected: FAIL because the status-line setup surfaces are still present. The new `AgentUsageService` assertion may already pass; it is a regression guard for the unchanged contract.

- [ ] **Step 3: Replace the main-process source and remove setup surfaces**

In `src/main/index.ts`, replace `readClaudeUsageCache` with `readClaudeUsageStatusLinePayload`; retain the existing conversion to `{ status: 'available', windows: [...] }` and return `null` when no payload is available.

In `src/main/ipc/settings.ts`, remove the Claude status-line configuration imports, `getClaudeUsageStatusLineCommand`, `mutateClaudeUsageStatusLine`, and both IPC handlers. Keep all ordinary settings and agent-hook handlers unchanged.

Remove the matching methods from `src/preload/index.ts` and `src/renderer/src/electron.d.ts`. Remove only the `Claude usage status line` card from `SettingsPanel.tsx`; preserve the Agent hook setup card and its buttons.

Delete the configuration module, its test, and the bundled resource. Remove the resource's `extraResources` entry and replace the two deleted test paths in `package.json` with `src/main/claudeUsageStatusLinePayload.test.ts`.

- [ ] **Step 4: Run affected tests, the complete suite, and strict typecheck**

Run:

```bash
npx tsx --test src/main/claudeUsageStatusLinePayload.test.ts src/main/agentUsage.test.ts src/main/ipc/settings.test.ts
npm test
npx tsc --noEmit
```

Expected: all tests pass and TypeScript reports no diagnostics.

- [ ] **Step 5: Manually verify the user flow in development**

Run:

```bash
npm run dev
```

On a machine where the existing Claude status-line script writes `~/.claude/statusline/<session_id>.json`:

1. Keep the existing `~/.claude/settings.json` unchanged.
2. Start or use Claude Code until the external script writes a fresh JSON file containing `rate_limits`.
3. Select Claude as the workspace provider in Yira.
4. Confirm the top-bar indicator shows the 5-hour and/or weekly percentages within one Yira refresh interval.
5. Confirm the Advanced settings section has no Claude usage Configure/Uninstall buttons.
6. Rename the directory temporarily or wait five minutes without a fresh payload; confirm the indicator shows unavailable and Yira does not recreate files.

- [ ] **Step 6: Commit the integration**

```bash
git add package.json src/main/index.ts src/main/ipc/settings.ts src/main/ipc/settings.test.ts src/main/agentUsage.test.ts src/preload/index.ts src/renderer/src/electron.d.ts src/renderer/src/components/SettingsPanel.tsx src/main/claudeUsageStatusLineConfiguration.ts src/main/claudeUsageStatusLineConfiguration.test.ts resources/claude-usage-status-line.mjs
git commit -m "refactor: use existing Claude status-line payloads"
```

## Final Verification

- [ ] Run `git diff --check` and confirm no generated `dist-electron/` or `release/` files changed.
- [ ] Run `npm test` and `npx tsc --noEmit` again from a clean working tree.
- [ ] Confirm `rg -n "claudeUsageStatusLineConfiguration|claude-usage-status-line|agentUsage:claudeStatusLine" src resources package.json` has no matches.
