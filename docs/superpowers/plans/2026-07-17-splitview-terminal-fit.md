# Split View Terminal Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize xterm and PTY dimensions after vertical Split View width changes so terminal TUIs remain aligned.

**Architecture:** `TerminalTile` continues to report fitting work to `createTerminalFitScheduler`. The scheduler performs an immediate deferred fit and a final stabilization fit on the following animation frame; its existing dimensions cache suppresses redundant PTY resize calls.

**Tech Stack:** React 19, TypeScript 5.7, xterm.js FitAddon, browser `requestAnimationFrame`.

## Global Constraints

- Change only terminal fitting; do not recreate terminal sessions or alter Codex behavior.
- Preserve error containment for failed xterm fits and unavailable dimensions.
- Preserve the PTY resize de-duplication for unchanged columns and rows.
- Use the project’s script-style TypeScript tests and validate with `npx tsc --noEmit` on Linux.

---

### Task 1: Stabilize Terminal Fits After Layout Changes

**Files:**
- Modify: `src/renderer/src/utils/terminalFitScheduler.test.ts`
- Modify: `src/renderer/src/utils/terminalFitScheduler.ts`

**Interfaces:**
- Consumes: `TerminalFitAddonLike.fit(): void`, `TerminalFitAddonLike.proposeDimensions(): TerminalFitDimensions | undefined`.
- Produces: `createTerminalFitScheduler().requestFit(fitAddon, resizeTerminal): void`, which performs a second fit on the next animation frame while emitting PTY resize calls only for changed dimensions.

- [x] **Step 1: Write the failing stabilization regression test**

  Replace the single `queuedFrame` test helper with a FIFO callback queue so multiple animation frames can be flushed. After the existing first fit assertions, flush the queued stabilization frame and assert that xterm fit ran again without another resize when dimensions are unchanged:

  ```ts
  if (getFitCalls() !== 1) throw new Error(`first fit must run once, got ${getFitCalls()}`)
  if (getResizeCallCount() !== 1) throw new Error(`first fit must resize once, got ${getResizeCallCount()}`)

  flushFrame('stabilization fit must be scheduled on the following frame')

  if (getFitCalls() !== 2) throw new Error(`stabilization frame must fit again, got ${getFitCalls()}`)
  if (getResizeCallCount() !== 1) throw new Error('unchanged stabilization dimensions must not resize the PTY again')
  ```

- [x] **Step 2: Run the focused test to verify it fails**

  Run:

  ```bash
  npx tsx src/renderer/src/utils/terminalFitScheduler.test.ts
  ```

  Expected: the test fails because the scheduler only invokes `fit()` once for one requested fit.

- [x] **Step 3: Implement the minimal two-frame scheduler**

  In `createTerminalFitScheduler`, extract the existing fitting body into a local `fit()` function. Make `requestFit` schedule the first fit and, at the start of that callback, queue one final `fit()` for the following frame before running the first fit. This keeps the final frame cancellable if a resize callback runs synchronously. Keep the existing `lastDimensions` comparison and `try/catch` around both `fitAddon.fit()` and `fitAddon.proposeDimensions()`:

  ```ts
  const fit = (): void => {
    let dimensions: TerminalFitDimensions | undefined
    try {
      fitAddon.fit()
      dimensions = fitAddon.proposeDimensions()
    } catch {
      return
    }

    if (!dimensions?.cols || !dimensions?.rows) return
    if (lastDimensions?.cols === dimensions.cols && lastDimensions.rows === dimensions.rows) return

    lastDimensions = { cols: dimensions.cols, rows: dimensions.rows }
    resizeTerminal(dimensions.cols, dimensions.rows)
  }
  ```

  The first-frame callback must queue exactly one stabilization frame that runs after it returns. `cancelPending()` must cancel whichever of those frames is currently queued.

- [x] **Step 4: Run the focused test to verify it passes**

  Run:

  ```bash
  npx tsx src/renderer/src/utils/terminalFitScheduler.test.ts
  ```

  Expected: exit code 0; the stabilization fit executes and unchanged dimensions produce only one PTY resize.

- [x] **Step 5: Run the TypeScript validation**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: exit code 0 with no TypeScript diagnostics.

- [ ] **Step 6: Manually verify the original interaction**

  Run:

  ```bash
  npm run dev
  ```

  In the application, open two terminals, enter vertical Split View, and type in a Codex terminal. Switch the visible terminal in either panel and resize the window. The prompt and line wrapping must remain aligned with the xterm grid.

- [ ] **Step 7: Commit the focused fix**

  ```bash
  git add src/renderer/src/utils/terminalFitScheduler.ts src/renderer/src/utils/terminalFitScheduler.test.ts
  git commit -m "fix: stabilize terminal fit in split view"
  ```
