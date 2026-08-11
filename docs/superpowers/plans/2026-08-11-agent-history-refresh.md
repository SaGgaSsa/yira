# Agent History Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically show a bounded, current agent-session history and automatically rerun searches without manual loading.

**Architecture:** Keep history retrieval in `AgentPanel`, using its existing scoped IPC query and request-generation guard. A small renderer utility supplies the delay decision and owns one pending timer: initial/context/default history is immediate, while a non-empty search waits 250 ms. The panel uses the scheduler for automatic loads and for immediate manual refreshes, so an explicit refresh cancels delayed work. `loadHistory` retains existing rows while reporting an in-progress refresh so a new query does not blank the panel.

**Tech Stack:** React 19 hooks, TypeScript, existing Electron preload IPC, Node test runner with `tsx`.

## Global Constraints

- Continue to query only the configured provider and active workspace through the existing preload IPC bridge.
- Preserve main-process bounded history results; do not load transcript bodies or an unbounded history.
- Do not expose Node APIs in the renderer.
- Follow project TypeScript style: 2 spaces, single quotes, no semicolons.
- Do not run `npm run dist:win`.

---

### Task 1: Automatically refresh bounded history and debounce searches

**Files:**
- Modify: `src/renderer/src/components/AgentPanel.tsx:36-311`
- Modify: `src/renderer/src/utils/agentPanel.ts:1-65`
- Modify: `src/renderer/src/utils/agentPanel.test.ts:1-120`

**Interfaces:**
- Consumes: `window.electron.agents.history(query): Promise<AgentSessionHistoryResult>` and `buildAgentHistoryQuery(workspaceId, selectedProvider, historySearch)`.
- Produces: `getAgentHistoryRefreshDelay(search: string): number`, `createAgentHistoryRefreshScheduler(timers)`, plus `loadHistory(): Promise<void>` that preserves current history items during a refresh and an effect that uses the scheduler.

- [ ] **Step 1: Write the failing delay-behavior test**

Import `createAgentHistoryRefreshScheduler` and `getAgentHistoryRefreshDelay` from `./agentPanel` in
`src/renderer/src/utils/agentPanel.test.ts` and append these assertions:

```ts
if (getAgentHistoryRefreshDelay('') !== 0) {
  throw new Error('default history must refresh immediately')
}
if (getAgentHistoryRefreshDelay('   ') !== 0) {
  throw new Error('cleared history search must refresh immediately')
}
if (getAgentHistoryRefreshDelay('release notes') !== 250) {
  throw new Error('history searches must wait briefly before refreshing')
}

const callbacks = new Map<number, () => void>()
let nextTimer = 0
const scheduler = createAgentHistoryRefreshScheduler({
  setTimeout: (callback) => {
    const timer = ++nextTimer
    callbacks.set(timer, callback)
    return timer
  },
  clearTimeout: (timer) => callbacks.delete(timer),
})
let scheduledRuns = 0
let immediateRuns = 0
scheduler.schedule(250, () => { scheduledRuns += 1 })
scheduler.runNow(() => { immediateRuns += 1 })
for (const callback of callbacks.values()) callback()
if (scheduledRuns !== 0 || immediateRuns !== 1) {
  throw new Error('an immediate history refresh must cancel delayed work')
}
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx tsx --test src/renderer/src/utils/agentPanel.test.ts`

Expected: FAIL with an error identifying the absent automatic history behavior.

- [ ] **Step 3: Add the minimal automatic refresh implementation**

In `src/renderer/src/utils/agentPanel.ts`, add the delay function below and a scheduler factory with `schedule(delay, callback)`, `runNow(callback)`, and `cancel()` methods. Inject `setTimeout` and `clearTimeout` for testing. Every new scheduled operation must cancel the previous one; `runNow` must cancel before calling its callback.

```ts
const HISTORY_SEARCH_DEBOUNCE_MS = 250

export function getAgentHistoryRefreshDelay(search: string): number {
  return search.trim() ? HISTORY_SEARCH_DEBOUNCE_MS : 0
}
```

Store one scheduler in an `AgentPanel` ref. Import and use it in the effect, with cleanup that cancels pending work and invalidates in-flight requests. Route the refresh button through a callback that calls `scheduler.runNow` and then `loadHistory`, so it cannot leave a pending debounced request behind. Retain `items` and `hasMore` when `loadHistory` begins:

```ts
setHistoryState((current) => ({ ...current, status: 'loading' }))
```

Replace the effect that clears history on `historySearch`, `workspaceId`, and
`selectedProvider` changes with an effect after the `loadHistory` callback:

```ts
useEffect(() => {
  if (!shouldRequestAgentData(selectedProvider)) return
  const delay = getAgentHistoryRefreshDelay(historySearch)
  scheduler.schedule(delay, () => {
    void loadHistory()
  })
  return () => scheduler.cancel()
}, [historySearch, loadHistory, selectedProvider, workspaceId])
```

Keep incrementing `historyRequestRef` in cleanup or context invalidation so an
older request cannot replace a newer result.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx tsx --test src/renderer/src/utils/agentPanel.test.ts`

Expected: PASS with all existing utility assertions and the automatic
refresh delay assertions.

- [ ] **Step 5: Run type and project verification**

Run:

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected: each command exits with status `0`.

- [ ] **Step 6: Manually verify the panel**

Run: `npm run dev`

Verify that entering Agents with a configured provider immediately displays
the bounded recent history; typing a query refreshes results after a short
pause; clearing it restores recent history; switching workspace/provider does
not display a stale prior result; and the refresh button still forces an
immediate update.

## Self-review

- Spec coverage: Task 1 implements automatic initial/context loading,
  debounced search, immediate clearing-to-default behavior, explicit refresh,
  stale-response protection, retained visible rows, and the existing bounded
  backend query.
- Placeholder scan: every change, behavior assertion, and verification
  command is specified; no deferred behavior remains.
- Type consistency: the effect calls the existing `loadHistory` callback,
  which builds the already typed provider/workspace query and guards results
  with `historyRequestRef`.
