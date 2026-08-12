# Terminal lifecycle shutdown design

## Goal

Ensure that every terminal process launched by Yira exits before Yira exits or
hands control to its updater. This prevents a restarted Yira instance from
starting a second Codex or Claude writer for the same resumed session.

## Problem

The main process owns each `node-pty` instance in the module-local `terminals`
map. A terminal renderer unmount only calls `terminal:detach`, which removes
the renderer listener and intentionally leaves the PTY process alive. The
existing `terminal:destroy` handler is the sole explicit PTY termination path.

Application close preparation currently flushes renderer state and persists
the primary workspace, but it does not terminate the PTYs. The Linux `.deb`
update handoff starts a detached launcher and then calls `app.quit()`.
Consequently, a process from the old app can still own a provider session while
the relaunched app automatically runs `codex resume <session-id>` or
`claude --resume <session-id>`.

## Chosen design

Add a main-process terminal shutdown service that drains every tracked PTY
before any intentional application exit. It applies to ordinary shell, SSH,
Codex, and Claude terminals alike; Yira owns all of them and must not leave
them running after Yira itself closes.

The service must be idempotent and expose one asynchronous operation:

```ts
shutdownAllTerminals(options?: { timeoutMs?: number }): Promise<TerminalShutdownResult>
```

It will:

1. Mark terminal creation as unavailable for the remainder of shutdown. A
   late `terminal:create` request fails instead of spawning a new process.
2. Snapshot the active sessions, unsubscribe their listeners, clear their
   semantic-agent alert state, and invoke each PTY's `kill()` method. On Linux
   and macOS, `node-pty` maps this default to `SIGHUP`; on Windows it uses its
   native PTY termination mechanism.
3. Await every PTY `onExit` notification, bounded by a three-second global
   timeout. It must not wait sequentially per terminal.
4. Remove every session from the main-process map and mark registered agent
   sessions exited, including processes that did not report `onExit` before
   the timeout.
5. Return a result containing only aggregate counts (`requested`, `exited`,
   `timedOut`), suitable for safe diagnostics and tests. It must never include
   terminal output, command text, paths, or agent transcript content.

The timeout is a liveness boundary, not a retry loop: after three seconds,
Yira logs a sanitized diagnostic and proceeds with application shutdown. This
keeps a stuck child process from making the close or update flow unusable.

## Application and update lifecycle

`prepareApplicationClose` will keep its existing renderer-flush and workspace
persistence order. Once those phases succeed, it will call
`shutdownAllTerminals()` exactly once before setting close preparation to
approved. Its in-flight promise continues to deduplicate close events.

All intentional exit routes therefore share the same sequence:

```
flush renderers -> persist workspace -> drain Yira-owned PTYs -> app quit
```

The Linux `.deb` updater may start its detached installer only after close
preparation has completed the drain. It then calls `app.quit()` as it does
today. The non-Linux updater route also receives the drain through the shared
close-preparation callback before `quitAndInstall()`.

No persistent PID ledger or startup process scanner is included in this change.
Those mechanisms are unnecessary for orderly exits and could terminate a
Codex/Claude process the user launched outside Yira. A hard crash, `SIGKILL`,
or machine power loss remains outside the guarantee; Yira must continue to
show the provider's normal resume error in that case.

## Error handling and observability

- Individual `kill()` errors are isolated so one invalid PTY cannot block the
  other terminal shutdowns.
- Shutdown always clears Yira's in-memory terminal and alert bookkeeping.
- A timeout records one aggregate main-process diagnostic with counts only.
- Calling shutdown with zero terminals resolves immediately.
- A second close/update request reuses the same shutdown promise and never
  sends duplicate termination requests.

## Components

- `src/main/ipc/terminal.ts`: owns the terminal map and gains the shutdown
  operation, a shutdown-state gate for `terminal:create`, exit waiters, and
  aggregate result types. Existing single-terminal destroy behavior remains
  compatible and uses the same cleanup primitives where practical.
- `src/main/index.ts`: inserts terminal draining into successful application
  close preparation before `app.quit()` is permitted.
- `src/main/updater.ts`: remains routed through `prepareApplicationClose`; add
  a focused ordering assertion only if dependency injection is required to
  make that ordering observable in tests.
- `src/main/ipc/terminal.test.ts` (new or extended): tests shutdown behavior
  with fake PTYs and fake exit notifications without requiring Electron or a
  real Codex process.
- `src/main/windowCloseCoordinator.test.ts` or a new close-preparation test:
  verifies terminal drain occurs after persistence and before close approval.

## Verification

- Unit-test zero terminals, multiple terminals, immediate exits, delayed exits,
  global timeout, kill failure isolation, double invocation, and rejection of
  terminal creation after shutdown begins.
- Unit-test the close sequence: renderer flush, workspace persist, terminal
  drain, then application quit approval.
- Run `npx tsc --noEmit`, `npm test`, and `npm run build`.
- Manually launch Codex and Claude agent terminals in Yira, trigger both a
  normal app close and an installed update, then verify their processes are no
  longer present before reopening Yira. Reopening the workspace must not show
  an active-writer resume failure for those orderly exits.
