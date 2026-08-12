# Terminal Lifecycle Shutdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terminate and drain every Yira-owned PTY before any normal exit or updater restart so restored Codex and Claude sessions never contend with a surviving writer from Yira.

**Architecture:** Extract PTY ownership and shutdown coordination into a main-process `TerminalSessionManager` with no Electron dependency. The existing terminal IPC layer delegates session bookkeeping to that manager, while the close coordinator gains a terminal-drain phase between workspace persistence and close approval. The updater keeps using the shared close-preparation callback, so every intentional exit follows the same lifecycle.

**Tech Stack:** Electron 33, TypeScript strict mode, node-pty, Node built-in test runner via `tsx --test`.

## Global Constraints

- Preserve the renderer’s current `terminal:detach` behavior: it detaches a listener without killing a terminal while Yira remains open.
- On every intentional Yira exit, close ordinary shell, SSH, Codex, and Claude PTYs; do not special-case agent providers.
- `shutdownAll()` must be idempotent, reject all new sessions after it begins, and use one global timeout of exactly 3,000 ms.
- Each PTY receives at most one `kill()` call. A kill failure must not stop other PTYs from being asked to exit.
- After the timeout, clear terminal, agent-lifecycle, alert-bridge, and alert-state bookkeeping and proceed with application close.
- Persist and log aggregate counts only; do not record terminal command text, output, local paths, or agent transcript data.
- Do not introduce a persistent PID ledger, startup process scanner, or broad provider-process kill command.
- Follow repository style: strict TypeScript, ESM, two spaces, no semicolons, single quotes.
- Run `npx tsc --noEmit`, `npm test`, and `npm run build` before handoff. Do not run `npm run dist:win`.
- Git boundary: do not commit, push, tag, or alter unrelated changes unless the user separately authorizes it.

---

## File structure

- Create `src/main/terminalSessions.ts`: main-process, Electron-free PTY session registry, deterministic cleanup, and global shutdown drain.
- Create `src/main/terminalSessions.test.ts`: fake-PTY unit tests for registration, exit signals, kill isolation, timeout, idempotence, and creation lockout.
- Modify `src/main/ipc/terminal.ts`: replace direct module-map ownership with `TerminalSessionManager`; export a singleton shutdown entry point for app lifecycle code.
- Modify `src/main/windowCloseCoordinator.ts`: add the terminal-drain phase after persistence.
- Modify `src/main/windowCloseCoordinator.test.ts`: assert the new phase ordering, error, retry, and timeout behavior.
- Modify `src/main/index.ts`: provide the terminal-drain callback to close preparation.
- Modify `package.json`: include the new `terminalSessions` unit test in `npm test`.

### Task 1: Isolated terminal session manager

**Files:**
- Create: `src/main/terminalSessions.ts`
- Create: `src/main/terminalSessions.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: a `ManagedPty` with `kill(): void` and optional `onExit(callback: () => void): void`.
- Produces: `TerminalSessionManager`, `TerminalShutdownResult`, `TERMINAL_SHUTDOWN_TIMEOUT_MS = 3_000`, and session callbacks used by IPC integration.

- [ ] **Step 1: Write the failing manager tests**

Create fake PTYs which record `kill()` calls and expose a captured exit callback. Cover the exact public behavior:

```ts
const manager = new TerminalSessionManager({ timeoutMs: 3_000 })
manager.add('one', { pty: first, onCleanup: cleanup })
manager.add('two', { pty: second, onCleanup: cleanup })

const stopping = manager.shutdownAll()
assert.equal(manager.isAcceptingSessions(), false)
assert.throws(() => manager.add('late', { pty: late, onCleanup: cleanup }), /shutting down/i)
assert.equal(first.killCalls, 1)
assert.equal(second.killCalls, 1)
first.exit()
second.exit()
assert.deepEqual(await stopping, { requested: 2, exited: 2, timedOut: 0 })
```

Add independent tests for zero sessions, one throwing `kill()`, global timeout with a fake timer or an injected `waitForAll` dependency, and two concurrent `shutdownAll()` calls returning the same promise and causing one kill per PTY.

- [ ] **Step 2: Run the manager test to verify it fails**

Run: `npx tsx --test src/main/terminalSessions.test.ts`

Expected: FAIL because `./terminalSessions` does not exist.

- [ ] **Step 3: Implement the smallest manager API that passes the tests**

Use a `Map<string, ManagedTerminalSession>` and one `shutdownPromise`:

```ts
export const TERMINAL_SHUTDOWN_TIMEOUT_MS = 3_000

export interface TerminalShutdownResult {
  requested: number
  exited: number
  timedOut: number
}

export class TerminalSessionManager {
  add(id: string, session: ManagedTerminalSession): void
  get(id: string): ManagedTerminalSession | undefined
  delete(id: string): ManagedTerminalSession | undefined
  isAcceptingSessions(): boolean
  shutdownAll(): Promise<TerminalShutdownResult>
}
```

Register each PTY exit once at `add`; it resolves that session’s exit waiter and removes no application-owned cleanup state by itself. `shutdownAll` changes the accepting flag before taking its snapshot, calls every cleanup callback once, calls every `pty.kill()` in isolated `try/catch` blocks, waits for all exit waiters or the single timeout, then clears the map. Return `timedOut = requested - exited`.

- [ ] **Step 4: Run focused manager tests and add them to the full test command**

Run: `npx tsx --test src/main/terminalSessions.test.ts`

Expected: PASS with all manager cases green.

Update `package.json` so `npm test` includes `src/main/terminalSessions.test.ts`, then run: `npm test`

Expected: PASS with the new test file included and no existing test regressions.

### Task 2: Route terminal IPC ownership through the manager

**Files:**
- Modify: `src/main/ipc/terminal.ts`
- Test: `src/main/terminalSessions.test.ts`

**Interfaces:**
- Consumes: `TerminalSessionManager` from Task 1 and `shutdownAll(): Promise<TerminalShutdownResult>`.
- Produces: exported `shutdownTerminalSessions(): Promise<TerminalShutdownResult>` for `src/main/index.ts`; all IPC handlers retain their current channels and renderer contracts.

- [ ] **Step 1: Extend the failing manager test with the cleanup contract needed by IPC**

Add a test proving cleanup is invoked exactly once both when a single session is removed and when global shutdown runs after an earlier PTY exit:

```ts
const session = manager.add('agent', { pty, onCleanup })
pty.exit()
manager.delete('agent')
await manager.shutdownAll()
assert.equal(cleanupCalls, 1)
```

The production behavior this catches is duplicate agent registry exit or duplicate alert bridge unregistering during a close race.

- [ ] **Step 2: Run it to verify the cleanup assertion fails**

Run: `npx tsx --test src/main/terminalSessions.test.ts`

Expected: FAIL because cleanup callbacks are not yet guarded across exit/delete/shutdown paths.

- [ ] **Step 3: Implement manager-backed IPC operations**

Replace the module-local `terminals` map with a `TerminalSessionManager`. Keep renderer reattachment working by using `manager.get(runtimeTileId)`. Register a session only after PTY spawn and agent registration succeed. Pass an idempotent cleanup callback that:

```ts
agentLifecycle?.onExit()
agentAlertBridge.unregisterTerminal(runtimeTileId)
agentAlerts.clearOnDestroy(runtimeTileId)
```

Make `terminal:destroy` delete the session through the manager, invoke its cleanup, then kill its PTY. `terminal:detach` only removes the calling web contents listener. In `terminal:create`, reject immediately if `manager.isAcceptingSessions()` is false.

Export:

```ts
export function shutdownTerminalSessions(): Promise<TerminalShutdownResult> {
  return terminalSessions.shutdownAll()
}
```

Do not alter preload APIs or renderer code.

- [ ] **Step 4: Run focused tests and static type check**

Run: `npx tsx --test src/main/terminalSessions.test.ts && npx tsc --noEmit`

Expected: PASS. The IPC file must type-check while preserving its existing create, reattach, write, resize, destroy, and detach behavior.

### Task 3: Make terminal draining a required close-preparation phase

**Files:**
- Modify: `src/main/windowCloseCoordinator.ts`
- Modify: `src/main/windowCloseCoordinator.test.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `shutdownTerminalSessions` from Task 2.
- Produces: `WindowCloseCoordinatorOptions.drainTerminals: () => Promise<void>` and close phases `'flush' | 'persist' | 'terminals'`.

- [ ] **Step 1: Write failing close-coordinator ordering and retry tests**

Add tests using three callbacks that append to `calls`:

```ts
const calls: string[] = []
const result = await coordinateWindowClose({
  flushRenderers: async () => { calls.push('flush') },
  persistPrimary: async () => { calls.push('persist') },
  drainTerminals: async () => { calls.push('terminals') },
  promptFailure: async () => 'cancel',
  timeoutMs: 100,
})
assert.equal(result, 'proceed')
assert.deepEqual(calls, ['flush', 'persist', 'terminals'])
```

Add a test where `drainTerminals` rejects once and `promptFailure` returns `'retry'`; assert that the next attempt restarts at `flush` and only returns `'proceed'` after terminal draining succeeds. Add a timeout test that checks `promptFailure` receives `phase: 'terminals'`.

- [ ] **Step 2: Run the close-coordinator test to verify it fails**

Run: `npx tsx --test src/main/windowCloseCoordinator.test.ts`

Expected: FAIL because `drainTerminals` and the `'terminals'` phase do not exist.

- [ ] **Step 3: Implement phase-aware close coordination and wire it into Electron startup**

Extend the public types and sequence in `coordinateWindowClose`:

```ts
await runPhase('flush', options.flushRenderers, options.timeoutMs)
await runPhase('persist', options.persistPrimary, options.timeoutMs)
await runPhase('terminals', options.drainTerminals, options.timeoutMs)
return 'proceed'
```

In `src/main/index.ts`, import `shutdownTerminalSessions` and pass:

```ts
drainTerminals: async () => { await shutdownTerminalSessions() }
```

Keep the existing close-preparation promise guard unchanged. The updater already awaits `prepareApplicationClose`, so do not duplicate the drain in `src/main/updater.ts`.

- [ ] **Step 4: Run close tests, types, and the full verification suite**

Run: `npx tsx --test src/main/windowCloseCoordinator.test.ts && npx tsc --noEmit && npm test && npm run build`

Expected: PASS. The close coordinator must preserve its existing flush/persist failure behavior and add the terminal phase before close approval.

### Task 4: Verify the user-visible update and restart flow

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-terminal-lifecycle-shutdown-design.md` only if implementation reveals a required, user-approved design correction.
- Test: manual Electron verification; no production files required when all automated tasks are green.

**Interfaces:**
- Consumes: terminal shutdown and close-preparation behavior from Tasks 1–3.
- Produces: documented manual verification evidence for normal exit and Linux `.deb` update paths.

- [ ] **Step 1: Capture baseline process identities**

Run Yira with `npm run dev`, create one regular shell terminal and one Codex or Claude terminal, and record only the relevant provider PIDs with:

```bash
ps -eo pid,ppid,command | rg '[c]odex|[c]laude'
```

- [ ] **Step 2: Verify normal close drains provider processes**

Close Yira normally. After the app exits, run the same command and confirm the PIDs started from Yira are absent. Reopen Yira and resume the prior agent tile; it must not produce a second-writer error.

- [ ] **Step 3: Verify installed Linux update behavior when available**

On an installed Linux `.deb` build with a downloaded update, create a Codex or Claude agent terminal, select Restart to apply update, and confirm the provider PID is absent before the relaunched app resumes the workspace. Do not run `npm run dist:win`.

- [ ] **Step 4: Record verification outcome in the handoff**

Report automated command output and whether each manual path passed, was unavailable, or exposed a defect. Do not add local process listings, terminal content, or session transcript data to tracked files.

## Plan self-review

- Spec coverage: Task 1 implements global timeout, idempotence, creation lockout, aggregate counts, and safe cleanup. Task 2 preserves renderer detach semantics and routes all terminal classes through the common manager. Task 3 makes draining precede every intentional app exit and update restart. Task 4 verifies the exact Codex/Claude user flow.
- Scope: no PID ledger, startup scanner, provider-wide process kill, preload API change, or renderer behavior change is included.
- Type consistency: `TerminalSessionManager.shutdownAll()` is the only shutdown primitive; its `TerminalShutdownResult` is exposed through `shutdownTerminalSessions()` and deliberately discarded by the close coordinator after it completes.
