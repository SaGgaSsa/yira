# Terminal Workspace Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Preserve terminal output without Yira-added exit text and keep xterm dimensions correct after workspace activation.

**Architecture:** Give every PTY attachment a typed workspace, tile, and generation identity. Main uses that identity to retain ordered output and reject stale lifecycle operations. The renderer waits for replay writes before it requests the existing two-frame terminal fit. App passes an explicit workspace activation generation so a terminal cannot reuse an old widget or resize after its workspace stopped being active.

**Tech Stack:** Electron 33, React 19, TypeScript 5.7, Zustand, node-pty, xterm.js 6, Node built-in test runner.

**Spec:** docs/superpowers/specs/2026-08-29-terminal-workspace-lifecycle-design.md

## Global Constraints

- Keep Ctrl+C as normal xterm input \x03.
- Preserve provider output and the final screen.
- Do not call term.clear(), term.reset(), or write a Yira exit message.
- Do not reintroduce terminalSynchronizedOutputRefresh as a general parser hook.
- Do not modify Wayland rendering behavior.
- Keep the 500,000-character retained PTY buffer limit.
- Use strict TypeScript, two-space indentation, single quotes, and no semicolons.
- Add each new test file to the npm test script.
- Before implementation, create an isolated Git worktree.
- Dispatch each accepted task with native spawn_agent, model gpt-5.6-luna, and reasoning effort max.
- Do not use a Superpowers subagent router for Yira tasks.
- Do not stage the current unrelated changes in package.json, App.tsx, emptyWorkspaceView.ts, or emptyWorkspaceView.test.ts.
- Do not push or create a pull request.

## File Structure

- src/shared/terminalSessionIdentity.ts: terminal target, session identity, lookup key, equality.
- src/main/terminalDelivery.ts: retained PTY buffer, identity-aware listeners, data-before-exit delivery.
- src/main/terminalSessions.ts: process-exit and final-dispose lifecycle separation.
- src/main/ipc/terminal.ts: identity-aware IPC operations and workspace-scoped session map.
- src/preload/index.ts and src/renderer/src/electron.d.ts: typed bridge.
- src/renderer/src/utils/terminalReplay.ts: replay write and silent xterm exit finalization.
- src/renderer/src/utils/terminalActivation.ts: activation fit guard.
- src/renderer/src/components/TerminalTile.tsx: widget integration.
- src/renderer/src/App.tsx, Canvas.tsx, GridView.tsx, TileContent.tsx: workspace activation input and lifecycle key.
- package.json: required test registration.

---

### Task 1: Define terminal session identity and ordered delivery

**Files:**

- Create: src/shared/terminalSessionIdentity.ts
- Create: src/shared/terminalSessionIdentity.test.ts
- Modify: src/shared/types.ts:437-470
- Create: src/main/terminalDelivery.ts
- Create: src/main/terminalDelivery.test.ts
- Modify: src/main/terminalSessions.ts
- Modify: src/main/terminalSessions.test.ts

**Interfaces:**

- Consumes: TerminalExitEvent from src/shared/types.ts.
- Produces: TerminalSessionTarget, TerminalSessionIdentity, terminalSessionLookupKey, sameTerminalSessionIdentity, and TerminalDelivery.
- Produces: ManagedTerminalSession.onProcessExit() and ManagedTerminalSession.onDispose().

- [ ] **Step 1: Write the failing identity test**

Create src/shared/terminalSessionIdentity.test.ts.

    import assert from 'node:assert/strict'
    import test from 'node:test'
    import {
      sameTerminalSessionIdentity,
      terminalSessionLookupKey,
      type TerminalSessionIdentity,
    } from './terminalSessionIdentity'

    const first: TerminalSessionIdentity = {
      workspaceId: 'workspace-a',
      tileId: 'tile-a',
      generation: 7,
    }

    test('scopes a terminal lookup key to workspace and tile', () => {
      assert.notEqual(
        terminalSessionLookupKey(first),
        terminalSessionLookupKey({ workspaceId: 'workspace-b', tileId: 'tile-a' }),
      )
    })

    test('requires workspace, tile, and generation to match', () => {
      assert.equal(sameTerminalSessionIdentity(first, { ...first }), true)
      assert.equal(sameTerminalSessionIdentity(first, { ...first, generation: 8 }), false)
      assert.equal(sameTerminalSessionIdentity(first, { ...first, workspaceId: 'workspace-b' }), false)
    })

- [ ] **Step 2: Run the identity test and verify failure**

Run:

    npx tsx --test src/shared/terminalSessionIdentity.test.ts

Expected: FAIL because terminalSessionIdentity.ts does not exist.

- [ ] **Step 3: Implement the shared identity contract**

Create src/shared/terminalSessionIdentity.ts.

    export interface TerminalSessionTarget {
      workspaceId: string
      tileId: string
    }

    export interface TerminalSessionIdentity extends TerminalSessionTarget {
      generation: number
    }

    export function terminalSessionLookupKey({ workspaceId, tileId }: TerminalSessionTarget): string {
      return JSON.stringify([workspaceId, tileId])
    }

    export function sameTerminalSessionIdentity(
      first: TerminalSessionIdentity,
      second: TerminalSessionIdentity,
    ): boolean {
      return first.workspaceId === second.workspaceId
        && first.tileId === second.tileId
        && first.generation === second.generation
    }

Import the target and identity types in src/shared/types.ts. Remove workspaceId from TerminalCreateOptions. Add identity: TerminalSessionIdentity to TerminalCreateResult. The terminal create call receives a TerminalSessionTarget as its first argument.

- [ ] **Step 4: Write failing delivery tests**

Create src/main/terminalDelivery.test.ts. Use a fake listener with isDestroyed() and send().

    const identity = { workspaceId: 'workspace-a', tileId: 'tile-a', generation: 1 }
    const sent: string[] = []
    const delivery = new TerminalDelivery(identity, 500_000)
    const listener = {
      isDestroyed: () => false,
      send: (channel: string) => sent.push(channel),
    }

    assert.equal(delivery.attach(identity, listener), true)
    delivery.append('final output')
    delivery.recordExit({ exitCode: 130 })

    assert.deepEqual(sent, [
      'terminal:data:workspace-a:tile-a:1',
      'terminal:exit:workspace-a:tile-a:1',
    ])
    assert.deepEqual(delivery.snapshot(), {
      identity,
      buffer: 'final output',
      exitEvent: { exitCode: 130 },
    })
    assert.equal(delivery.detach({ ...identity, generation: 2 }, listener), false)
    assert.equal(delivery.detach(identity, listener), true)

Add one test that attaches after recordExit and gets the retained snapshot. Add one test that appends 500,001 characters and retains exactly 500,000.

- [ ] **Step 5: Run delivery tests and verify failure**

Run:

    npx tsx --test src/main/terminalDelivery.test.ts

Expected: FAIL because TerminalDelivery does not exist.

- [ ] **Step 6: Implement ordered delivery and separated disposal**

Create src/main/terminalDelivery.ts. Use these public members:

    export interface TerminalDeliveryListener {
      isDestroyed(): boolean
      send(channel: string, payload: unknown): void
    }

    export class TerminalDelivery<T extends TerminalDeliveryListener> {
      constructor(
        readonly identity: TerminalSessionIdentity,
        private readonly maxBufferLength: number,
      ) {}

      append(data: string): void
      recordExit(event: TerminalExitEvent): void
      attach(identity: TerminalSessionIdentity, listener: T): boolean
      detach(identity: TerminalSessionIdentity, listener: T): boolean
      dispose(): void
      snapshot(): {
        identity: TerminalSessionIdentity
        buffer: string
        exitEvent?: TerminalExitEvent
      }
    }

append() must update the buffer before it sends the identity-specific data channel. recordExit() must send the identity-specific exit channel after all prior append() calls. attach() and detach() must return false when sameTerminalSessionIdentity() fails. send() failures and destroyed listeners must remove only that listener. snapshot() must copy the identity and exit event.

Change ManagedTerminalSession to:

    export interface ManagedTerminalSession {
      pty: ManagedPty
      onProcessExit: () => void
      onDispose: () => void
    }

TerminalSessionManager must invoke onProcessExit only when the PTY emits exit. It must invoke onDispose only from delete() and shutdownAll(). Update existing terminalSessions tests to prove an ordinary exit does not dispose active listeners.

- [ ] **Step 7: Run focused tests and verify success**

Run:

    npx tsx --test src/shared/terminalSessionIdentity.test.ts src/main/terminalDelivery.test.ts src/main/terminalSessions.test.ts

Expected: PASS. The data channel precedes exit. A stale generation cannot detach a listener. An ordinary process exit retains delivery.

- [ ] **Step 8: Review task scope and commit only after authorization**

Run:

    git diff --check
    git diff --stat
    git status --short

Expected: only Task 1 files are changed in the task worktree. After root-integrator review and explicit commit authorization:

    git add src/shared/terminalSessionIdentity.ts src/shared/terminalSessionIdentity.test.ts src/shared/types.ts src/main/terminalDelivery.ts src/main/terminalDelivery.test.ts src/main/terminalSessions.ts src/main/terminalSessions.test.ts
    git commit -m "refactor: isolate terminal delivery lifecycle"

---

### Task 2: Make terminal IPC identity-aware and preserve exit delivery

**Files:**

- Modify: src/main/ipc/terminal.ts:44-379
- Modify: src/main/ipc/terminal.test.ts
- Modify: src/main/terminalEvents.ts
- Modify: src/main/terminalEvents.test.ts

**Interfaces:**

- Consumes: Task 1 target, identity, lookup key, delivery, and separated manager lifecycle.
- Produces: identity-aware create, write, resize, destroy, detach, data, exit, and alert behavior.
- Preserves: agent registry updates, terminal shutdown, SSH reconnect exit state, and the 500,000-character buffer limit.

- [ ] **Step 1: Write failing IPC and event-channel tests**

Extend src/main/ipc/terminal.test.ts.

    test('uses workspace-scoped terminal identities', async () => {
      const text = await source('src/main/ipc/terminal.ts')

      assert.match(text, /terminalSessionLookupKey\(target\)/)
      assert.match(text, /new TerminalDelivery\(identity, 500_000\)/)
      assert.match(text, /delivery\.append\(data\)/)
      assert.match(text, /delivery\.recordExit\(exitEvent\)/)
      assert.match(text, /delivery\.detach\(identity, event\.sender\)/)
    })

Update src/main/terminalEvents.test.ts.

    const identity = { workspaceId: 'workspace-a', tileId: 'tile-a', generation: 1 }
    broadcastTerminalExit(listeners, identity, { exitCode: 130 })
    assert.equal(messages[0].channel, 'terminal:exit:workspace-a:tile-a:1')

- [ ] **Step 2: Run the tests and verify failure**

Run:

    npx tsx --test src/main/ipc/terminal.test.ts src/main/terminalEvents.test.ts

Expected: FAIL because terminal IPC still uses only the tile ID.

- [ ] **Step 3: Replace tile-only lookup with a workspace target**

In src/main/ipc/terminal.ts, replace resolveTerminalId(tileId) with a target normalizer.

    interface RuntimeTerminalTarget {
      lookupKey: string
      target: TerminalSessionTarget
    }

    function resolveRuntimeTarget(
      target: TerminalSessionTarget,
      isAgent: boolean,
    ): RuntimeTerminalTarget {
      const workspaceId = normalizeAgentOpaqueId(target.workspaceId) ?? target.workspaceId.trim()
      const tileId = isAgent ? normalizeAgentOpaqueId(target.tileId) : target.tileId.trim()
      if (!workspaceId || !tileId) throw new Error('Invalid terminal target')
      const normalizedTarget = { workspaceId, tileId }
      return {
        lookupKey: terminalSessionLookupKey(normalizedTarget),
        target: normalizedTarget,
      }
    }

Use lookupKey as the TerminalSessionManager key. Store target, identity, and delivery on TerminalSession. Allocate a module-level generation that only increases:

    const identity: TerminalSessionIdentity = {
      ...runtime.target,
      generation: nextTerminalSessionGeneration++,
    }

Use target.workspaceId for workspace lookup and agent registry calls. Do not reset the counter after a workspace change.

- [ ] **Step 4: Route data, exit, and cleanup through TerminalDelivery**

Replace TerminalSession.listeners and TerminalSession.buffer with delivery. In the PTY data handler call delivery.append(data). In the PTY exit handler call delivery.recordExit(exitEvent), then session.onProcessExit(). Do not call delivery.dispose() on normal process exit.

For a new or existing create, return a copied snapshot:

    const snapshot = session.delivery.snapshot()
    return {
      cols: 80,
      rows: 24,
      identity: snapshot.identity,
      buffer: snapshot.buffer,
      exitEvent: snapshot.exitEvent,
    }

Every write, resize, destroy, detach, agent-alert acknowledgement, onData, onExit, and onAgentAlert call must receive TerminalSessionIdentity. Resolve its workspace lookup key, then compare it to session.identity before acting. A mismatch is a no-op. destroy() and shutdown disposal call delivery.dispose().

Change src/main/terminalEvents.ts so its event channels use the identity. Delete TerminalExitState after delivery owns retained exit state. Move retained-exit tests into terminalDelivery.test.ts.

- [ ] **Step 5: Run focused main-process tests and verify success**

Run:

    npx tsx --test src/main/ipc/terminal.test.ts src/main/terminalEvents.test.ts src/main/terminalSessions.test.ts src/main/agents/terminal.test.ts

Expected: PASS. Existing detach behavior must still never kill a PTY. An exited session must reattach with its buffer and exit event. A stale identity cannot resize or detach it.

- [ ] **Step 6: Review task scope and commit only after authorization**

Run:

    git diff --check
    git diff --stat
    git status --short

Expected: only Task 2 files are changed. After root-integrator review and explicit commit authorization:

    git add src/main/ipc/terminal.ts src/main/ipc/terminal.test.ts src/main/terminalEvents.ts src/main/terminalEvents.test.ts
    git commit -m "fix: preserve terminal output through process exit"


---

### Task 3: Expose identity through preload and finalize xterm silently

**Files:**

- Modify: src/preload/index.ts:124-154
- Modify: src/renderer/src/electron.d.ts:128-140
- Create: src/renderer/src/utils/terminalReplay.ts
- Create: src/renderer/src/utils/terminalReplay.test.ts
- Modify: src/renderer/src/components/TerminalTile.tsx
- Modify: src/renderer/src/components/TerminalTile.test.ts

**Interfaces:**

- Consumes: TerminalSessionTarget, TerminalSessionIdentity, and TerminalCreateResult.identity from Tasks 1 and 2.
- Produces: identity-aware renderer terminal bridge methods, writeTerminalReplay(), and finalizeTerminalExit().
- Preserves: copy shortcuts, agent alerts, SSH reconnect UI, title updates, and terminal theme.

- [ ] **Step 1: Write failing replay and silent-exit tests**

Create src/renderer/src/utils/terminalReplay.test.ts.

    import assert from 'node:assert/strict'
    import test from 'node:test'
    import { finalizeTerminalExit, writeTerminalReplay } from './terminalReplay'

    test('replays retained output before completion', () => {
      const writes: string[] = []
      let completed = false
      writeTerminalReplay({
        write: (data: string, callback?: () => void) => {
          writes.push(data)
          callback?.()
        },
      }, 'retained output', () => { completed = true })
      assert.deepEqual(writes, ['retained output'])
      assert.equal(completed, true)
    })

    test('finalizes an exit without adding or clearing output', () => {
      const writes: string[] = []
      let refreshes = 0
      finalizeTerminalExit({
        write: (data: string, callback?: () => void) => {
          writes.push(data)
          callback?.()
        },
        refresh: () => { refreshes += 1 },
        rows: 24,
      }, true, () => true)
      assert.deepEqual(writes, [''])
      assert.equal(refreshes, 1)
    })

Extend TerminalTile.test.ts. Give its terminal mock clear() and reset() methods that throw. Simulate a local exit event with exitCode 130. Assert that no status string is written and neither clear() nor reset() is called.

- [ ] **Step 2: Run the renderer tests and verify failure**

Run:

    npx tsx --test src/renderer/src/utils/terminalReplay.test.ts src/renderer/src/components/TerminalTile.test.ts

Expected: FAIL because the replay helpers do not exist.

- [ ] **Step 3: Implement replay and silent finalization helpers**

Create src/renderer/src/utils/terminalReplay.ts.

    export interface TerminalWriteLike {
      write: (data: string, callback?: () => void) => void
    }

    export interface TerminalExitFinalizeLike extends TerminalWriteLike {
      rows: number
      refresh: (start: number, end: number) => void
    }

    export function writeTerminalReplay(
      terminal: TerminalWriteLike,
      buffer: string,
      onComplete: () => void,
    ): void {
      if (!buffer) {
        onComplete()
        return
      }
      terminal.write(buffer, onComplete)
    }

    export function finalizeTerminalExit(
      terminal: TerminalExitFinalizeLike,
      isVisible: boolean,
      isCurrent: () => boolean,
    ): void {
      terminal.write('', () => {
        if (!isVisible || !isCurrent() || terminal.rows < 1) return
        terminal.refresh(0, terminal.rows - 1)
      })
    }

Keep sanitizeTerminalReplayBuffer at the caller. Pass its result into writeTerminalReplay.

- [ ] **Step 4: Update the preload bridge and renderer declarations**

Replace tile-ID terminal operations in src/preload/index.ts and electron.d.ts with these signatures.

    create: (
      target: TerminalSessionTarget,
      options: TerminalCreateOptions,
    ) => Promise<TerminalCreateResult>
    write: (identity: TerminalSessionIdentity, data: string) => Promise<void>
    resize: (
      identity: TerminalSessionIdentity,
      cols: number,
      rows: number,
    ) => Promise<void>
    destroy: (identity: TerminalSessionIdentity) => Promise<void>
    detach: (identity: TerminalSessionIdentity) => Promise<void>
    acknowledgeAgentAlert: (identity: TerminalSessionIdentity) => Promise<void>
    onData: (
      identity: TerminalSessionIdentity,
      callback: (data: string) => void,
    ) => () => void
    onExit: (
      identity: TerminalSessionIdentity,
      callback: (event: TerminalExitEvent) => void,
    ) => () => void
    onAgentAlert: (
      identity: TerminalSessionIdentity,
      callback: (state: unknown) => void,
    ) => () => void

The preload builds the data, exit, and alert channel only from the identity returned by create(). It must not accept an arbitrary channel string.

- [ ] **Step 5: Integrate identity and local exit handling in TerminalTile**

Add a current identity ref. Create with:

    window.electron.terminal.create(
      { workspaceId, tileId: tile.id },
      {
        shellProfileId: tile.shellProfileId ?? 'bash',
        connection: isRemoteSsh ? 'remote-ssh' : undefined,
        remoteTerminal: isRemoteSsh ? workspaceConfig.remoteTerminal : undefined,
        remoteStartupCommand: isRemoteSsh ? tile.startupCommand : undefined,
        workspaceDir: isRemoteSsh ? undefined : workspaceConfig.rootFolderPath,
        wslStartInHome: !isRemoteSsh && tile.shellProfileId === 'wsl' && !workspaceConfig.rootFolderPath,
        initialCommand,
        terminalHistoryEnabled: workspaceConfig.terminalHistoryEnabled !== false,
        agent: isRemoteSsh ? undefined : tile.agent,
        agentProviderConfig: !isRemoteSsh && tile.agent
          ? workspaceConfig.agentProviders[tile.agent.provider]
          : undefined,
      },
    )

After create resolves, reject the result if cleanup started or result.identity does not match workspaceId and tile.id. Subscribe with result.identity. Replace the direct replay and initial fit with:

    const isCurrentIdentity = () => {
      const current = identityRef.current
      return !cancelled
        && current !== null
        && sameTerminalSessionIdentity(current, result.identity)
    }

    const completeReplay = () => {
      if (!isCurrentIdentity()) return
      replayActivationRef.current = workspaceActivation
      requestActivationFit()
    }

    writeTerminalReplay(
      term,
      sanitizeTerminalReplayBuffer(result.buffer),
      completeReplay,
    )

For every local or remote exit, call finalizeTerminalExit(term, isVisibleRef.current, isCurrentIdentity). Keep the remote SSH reconnect state. Do not add local exit state or terminal text.

Pass identityRef.current to write, resize, detach, destroy, alert acknowledgement, agent alerts, data listeners, and exit listeners. A missing identity must make the callback a no-op. Cleanup detaches only the identity captured for that mount.

- [ ] **Step 6: Run focused renderer tests and verify success**

Run:

    npx tsx --test src/renderer/src/utils/terminalReplay.test.ts src/renderer/src/components/TerminalTile.test.ts

Expected: PASS. Local exit queues only the empty write that waits for xterm. It adds no text and never clears or resets xterm.

- [ ] **Step 7: Review task scope and commit only after authorization**

Run:

    git diff --check
    git diff --stat
    git status --short

Expected: only Task 3 files are changed. After root-integrator review and explicit commit authorization:

    git add src/preload/index.ts src/renderer/src/electron.d.ts src/renderer/src/utils/terminalReplay.ts src/renderer/src/utils/terminalReplay.test.ts src/renderer/src/components/TerminalTile.tsx src/renderer/src/components/TerminalTile.test.ts
    git commit -m "fix: finalize terminal exits without extra output"

---

### Task 4: Fit only the current visible workspace after replay

**Files:**

- Create: src/renderer/src/utils/terminalActivation.ts
- Create: src/renderer/src/utils/terminalActivation.test.ts
- Modify: src/renderer/src/components/TerminalTile.tsx
- Modify: src/renderer/src/components/TileContent.tsx
- Modify: src/renderer/src/components/Canvas.tsx
- Modify: src/renderer/src/components/GridView.tsx
- Modify: src/renderer/src/App.tsx
- Modify: src/renderer/src/utils/terminalFitScheduler.test.ts
- Modify: src/renderer/src/components/GridView.refresh.test.ts

**Interfaces:**

- Consumes: Task 3 replay completion and session identity.
- Produces: TerminalActivationFitInput, shouldRequestTerminalActivationFit(), and terminalWorkspaceActivation state in App.
- Preserves: TerminalFitScheduler as the sole dimensions calculator and PTY resize de-duplicator.

- [ ] **Step 1: Write failing activation tests**

Create src/renderer/src/utils/terminalActivation.test.ts.

    import assert from 'node:assert/strict'
    import test from 'node:test'
    import { shouldRequestTerminalActivationFit } from './terminalActivation'

    test('fits a visible widget after its current replay finishes', () => {
      assert.equal(shouldRequestTerminalActivationFit({
        isVisible: true,
        workspaceActivation: 4,
        replayActivation: 4,
        isCurrent: true,
      }), true)
    })

    test('skips hidden, stale, and replay-pending widgets', () => {
      assert.equal(shouldRequestTerminalActivationFit({
        isVisible: false,
        workspaceActivation: 4,
        replayActivation: 4,
        isCurrent: true,
      }), false)
      assert.equal(shouldRequestTerminalActivationFit({
        isVisible: true,
        workspaceActivation: 4,
        replayActivation: 3,
        isCurrent: true,
      }), false)
      assert.equal(shouldRequestTerminalActivationFit({
        isVisible: true,
        workspaceActivation: 4,
        replayActivation: 4,
        isCurrent: false,
      }), false)
    })

- [ ] **Step 2: Run the activation test and verify failure**

Run:

    npx tsx --test src/renderer/src/utils/terminalActivation.test.ts

Expected: FAIL because terminalActivation.ts does not exist.

- [ ] **Step 3: Implement the activation guard and identity-guarded fitting**

Create src/renderer/src/utils/terminalActivation.ts.

    export interface TerminalActivationFitInput {
      isVisible: boolean
      workspaceActivation: number
      replayActivation: number | null
      isCurrent: boolean
    }

    export function shouldRequestTerminalActivationFit(
      input: TerminalActivationFitInput,
    ): boolean {
      return input.isVisible
        && input.isCurrent
        && input.replayActivation === input.workspaceActivation
    }

Add workspaceId and workspaceActivation props through TileContent to TerminalTile. Keep replayActivationRef in TerminalTile. Set it only from the replay completion callback.

Add an effect that calls doFit() only if shouldRequestTerminalActivationFit() returns true. In doFit(), capture identity and workspace activation before requestFit(). The resize callback must return unless both still match current refs. Main identity validation from Task 2 remains the second guard.

- [ ] **Step 4: Make workspace activation explicit in App, Canvas, and GridView**

Add App state beside the existing lifecycle refs.

    const [terminalWorkspaceActivation, setTerminalWorkspaceActivation] = useState(0)

In activateWorkspace(), call setTerminalWorkspaceActivation((current) => current + 1) immediately after restoreWorkspaceState() or restoreGridWorkspaceState(). Do not increment before every transitionId check passes.

Pass activeWorkspaceId and terminalWorkspaceActivation to Canvas and GridView. Add key={activeWorkspaceId} to both view roots. This forces a new xterm widget when an incoming workspace reuses an imported tile ID.

Update Canvas and GridView prop interfaces. When each renders TileContent, pass workspaceId and workspaceActivation.

- [ ] **Step 5: Extend scheduler and grid regression tests**

In terminalFitScheduler.test.ts, add this test sequence:

    const staleResizeCalls: Array<{ cols: number; rows: number }> = []
    let current = true
    const scheduler = createTerminalFitScheduler({ requestFrame, cancelFrame })
    scheduler.requestFit(fitAddon, (cols, rows) => {
      if (current) staleResizeCalls.push({ cols, rows })
    })
    flushFrame('first fit must run')
    current = false
    flushFrame('stabilization fit must run')
    assert.deepEqual(staleResizeCalls, [{ cols: 100, rows: 30 }])

In GridView.refresh.test.ts, render two workspace inputs with the same terminal tile ID and different workspaceActivation values. Assert the TileContent key changes from workspace-a:terminal:3 to workspace-b:terminal:4. The assertion must fail when a key contains only tile.id.

- [ ] **Step 6: Run focused activation, scheduler, grid, and terminal tests**

Run:

    npx tsx --test src/renderer/src/utils/terminalActivation.test.ts src/renderer/src/utils/terminalFitScheduler.test.ts src/renderer/src/components/GridView.refresh.test.ts src/renderer/src/components/TerminalTile.test.ts

Expected: PASS. A workspace activation cannot fit a hidden or stale widget. A reused tile ID creates a fresh lifecycle key. Existing two-frame fitting still de-duplicates resize dimensions.

- [ ] **Step 7: Review task scope and commit only after authorization**

Run:

    git diff --check
    git diff --stat
    git status --short

Expected: only Task 4 files are changed. App.tsx needs an explicit conflict review because it was modified before this plan. After root-integrator review and explicit commit authorization:

    git add src/renderer/src/utils/terminalActivation.ts src/renderer/src/utils/terminalActivation.test.ts src/renderer/src/components/TerminalTile.tsx src/renderer/src/components/TileContent.tsx src/renderer/src/components/Canvas.tsx src/renderer/src/components/GridView.tsx src/renderer/src/App.tsx src/renderer/src/utils/terminalFitScheduler.test.ts src/renderer/src/components/GridView.refresh.test.ts
    git commit -m "fix: refit terminals after workspace activation"

---

### Task 5: Register tests and verify the complete terminal lifecycle

**Files:**

- Modify: package.json
- Modify: src/main/ipc/terminal.test.ts
- Modify: src/renderer/src/components/TerminalTile.test.ts

**Interfaces:**

- Consumes: all Task 1 through Task 4 contracts.
- Produces: one complete test gate and manual verification evidence.

- [ ] **Step 1: Register all new focused tests**

Add these paths to the existing tsx --test command in package.json. Do not remove existing tests.

    src/shared/terminalSessionIdentity.test.ts
    src/main/terminalDelivery.test.ts
    src/renderer/src/utils/terminalReplay.test.ts
    src/renderer/src/utils/terminalActivation.test.ts
    src/renderer/src/utils/terminalFitScheduler.test.ts

Place each beside tests from the same layer.

- [ ] **Step 2: Add final cross-layer assertions**

In src/main/ipc/terminal.test.ts, assert that retained output and exitCode 130 appear in a reattach result with the same identity generation. Assert that resize with generation + 1 does not reach pty.resize.

In TerminalTile.test.ts, assert that local exitCode 130 preserves writes collected before exit and adds only the empty queue-drain write. Assert that clear() and reset() are never invoked.

- [ ] **Step 3: Run the complete automated gate**

Run:

    npx tsc --noEmit
    npm test
    npm run build

Expected: all commands exit with code 0. npm test executes the identity, delivery, replay, activation, scheduler, IPC, and terminal component tests.

- [ ] **Step 4: Manually verify the normal desktop flow**

Run:

    npm run dev

Use a non-Wayland-specific environment.

1. Create a direct Claude agent terminal.
2. Produce more than one screen of output.
3. Press Ctrl+C.
4. Confirm the provider output remains visible.
5. Confirm Yira adds no exit text.
6. Repeat steps 1 through 5 with Codex.
7. Create two workspaces with different terminal widths or grid layouts.
8. Switch A → B → A with wrapped terminal output.
9. Confirm alignment is correct immediately after each switch.
10. Change view only after checking alignment. Confirm the view change is not required as a repair.

- [ ] **Step 5: Review task scope and commit only after authorization**

Run:

    git diff --check
    git diff --stat
    git status --short

Expected: only final test-registration and assertion updates are changed. package.json needs an explicit conflict review because it was modified before this plan. After root-integrator review and explicit commit authorization:

    git add package.json src/main/ipc/terminal.test.ts src/renderer/src/components/TerminalTile.test.ts
    git commit -m "test: cover terminal workspace lifecycle"

## Plan Self-Review

- **Spec coverage:** Task 1 separates process disposal from renderer delivery. Task 2 preserves data-before-exit delivery and rejects stale main-process operations. Task 3 preserves output while completing local exits silently. Task 4 implements the post-replay workspace fit and lifecycle key. Task 5 registers tests and runs the required validation.
- **Placeholder scan:** The plan contains no incomplete markers, deferred implementation text, or unspecified test step.
- **Type consistency:** TerminalSessionTarget is the create input. TerminalSessionIdentity is returned by create and is required for later terminal operations. workspaceActivation is renderer-only and never replaces PTY generation.

## Execution Handoff

The plan is saved at docs/superpowers/plans/2026-08-29-terminal-workspace-lifecycle.md.

For Yira, use native Luna tasks in isolated worktrees. Dispatch one accepted task at a time because Tasks 2 through 5 depend on contracts from the prior task. The root integrator must inspect each task worktree, diff, changed-file scope, and verification output before accepting it. Do not push or create a pull request.
