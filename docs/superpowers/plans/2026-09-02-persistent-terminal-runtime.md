# Persistent Terminal Runtime Implementation Plan

> **For agentic workers:** Execute each task with Codex native `spawn_agent` controls. Use model `gpt-5.6-luna` and reasoning effort `max`. Do not use a Superpowers native-subagent routing skill. Keep every Git-backed task in an isolated worktree. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the exact xterm instance and all terminal output while users switch between workspaces activated during the current Yira process.

**Architecture:** Add canonical PTY dimensions to main-process terminal sessions. Add an application-scoped renderer registry that owns persistent terminal runtimes. A terminal runtime opens xterm once, processes data while parked, and moves the same DOM root between a hidden parking root and the active tile host. Workspace switches never replay an already activated terminal.

**Tech Stack:** Electron 33, React 19, strict TypeScript, Zustand, xterm 6, `@xterm/addon-fit`, Node test runner, `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-02-persistent-terminal-runtime-design.md`

## Global Constraints

- User-approved test workflow override: implement production changes first, add regression tests after implementation, and run each focused validation once. Do not execute separate RED runs.
- Load only the last active workspace when Yira starts.
- Load another workspace only after the user selects it.
- Keep PTY processes and renderer terminal runtimes active after first activation.
- Key all runtime operations by canonical `workspaceId + tileId`.
- Retain `TerminalSessionIdentity` checks for every PTY operation.
- Do not persist renderer runtimes across Yira process restarts.
- Do not keep complete workspace React surfaces mounted.
- Do not change the 500,000-character retained-output limit.
- Do not change agent commands, PTY shutdown policy, or remote SSH startup policy.
- Do not add a synchronized-output parser hook.
- Do not clear or reset xterm during workspace activation.
- Follow strict TypeScript, ES modules, 2-space indentation, single quotes, and no semicolons.
- Do not push, create a PR, tag, release, or modify unrelated untracked files.
- Do not create commits unless the user gives separate explicit authorization.

## File Structure

- `src/main/ipc/terminal.ts`: own and return canonical PTY dimensions.
- `src/main/ipc/terminal.test.ts`: verify dimension retention and identity guards.
- `src/renderer/src/utils/terminalRuntimeRegistry.ts`: own target-keyed runtimes and parking operations without React.
- `src/renderer/src/utils/terminalRuntimeRegistry.test.ts`: verify acquisition, parking, pruning, and disposal.
- `src/renderer/src/utils/terminalRuntime.ts`: own xterm, PTY attachment, replay-once, fit, output, and remote state.
- `src/renderer/src/utils/terminalRuntime.test.ts`: verify runtime behavior with complete fakes.
- `src/renderer/src/components/TerminalRuntimeProvider.tsx`: provide one registry and one connected parking root.
- `src/renderer/src/components/TerminalTile.tsx`: render the host and UI controls for a persistent runtime.
- `src/renderer/src/components/TileContent.tsx`: pass an explicit workspace target to terminal hosts.
- `src/renderer/src/components/Canvas.tsx`: forward explicit workspace ID without an activation generation.
- `src/renderer/src/components/GridView.tsx`: forward explicit workspace ID without an activation generation.
- `src/renderer/src/App.tsx`: install the provider, route target-scoped runtime events, refresh runtimes, and prune removed workspaces.
- `src/renderer/src/hooks/useCanvasActions.ts`: destroy the renderer runtime before deleting a terminal tile.
- `src/renderer/src/utils/terminalActivationFit.ts`: remove after runtime ownership replaces it.
- `src/renderer/src/utils/terminalActivationFit.test.ts`: remove with the obsolete predicate.
- `src/renderer/src/components/TerminalTile.test.ts`: retain UI helper tests and remove source-text lifecycle assertions.
- `src/renderer/src/components/GridView.refresh.test.ts`: remove obsolete source-text coverage if behavior tests supersede it.
- `package.json`: register the new behavior tests and the existing fit scheduler test.

---

### Task 1: Retain canonical PTY dimensions

**Files:**

- Modify: `src/main/ipc/terminal.ts`
- Modify: `src/main/ipc/terminal.test.ts`

**Interfaces:**

- Consumes: existing `TerminalCreateResult`, `TerminalSessionIdentity`, and identity-aware resize IPC.
- Produces: `TerminalSession.dimensions: { cols: number; rows: number }` and create/attach responses with current values.

**Ownership:** This task owns only the two files listed above.

- [ ] **Step 1: Add failing dimension-retention tests**

Add tests through the existing IPC harness. Use a spawned PTY fake that records resize calls. Create one session, resize it to `132x41`, and attach again with the returned identity.

```ts
test('returns the current PTY dimensions when a renderer reattaches', async () => {
  const created = await invokeTerminalCreate({ workspaceId: 'workspace-a', tileId: 'tile-a' })

  await invokeTerminalResize(created.identity, 132, 41)
  const attached = await invokeTerminalAttach(created.identity)

  assert.deepEqual(
    { cols: attached.cols, rows: attached.rows },
    { cols: 132, rows: 41 },
  )
})
```

Add a stale-identity case. A resize for generation `created.identity.generation - 1` must not change stored dimensions.

```ts
test('does not change dimensions for a stale terminal identity', async () => {
  const created = await invokeTerminalCreate({ workspaceId: 'workspace-a', tileId: 'tile-a' })

  await invokeTerminalResize({ ...created.identity, generation: created.identity.generation - 1 }, 160, 50)
  const attached = await invokeTerminalAttach(created.identity)

  assert.deepEqual(
    { cols: attached.cols, rows: attached.rows },
    { cols: 80, rows: 24 },
  )
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx tsx --test src/main/ipc/terminal.test.ts
```

Expected: the reattach test receives `80x24` after the valid `132x41` resize.

- [ ] **Step 3: Store dimensions in each session**

Extend the private session interface.

```ts
interface TerminalDimensions {
  cols: number
  rows: number
}

interface TerminalSession extends ManagedTerminalSession {
  pty: PtyInstance
  delivery: TerminalDelivery<WebContents>
  dimensions: TerminalDimensions
  alertListeners: Set<WebContents>
  agentProvider?: AgentTerminalLaunch['provider']
  agentLifecycle?: AgentTerminalLifecycle
}
```

Initialize one object when the PTY is created.

```ts
const dimensions: TerminalDimensions = { cols: 80, rows: 24 }

const session: TerminalSession = {
  pty: term,
  delivery,
  dimensions,
  alertListeners: new Set(),
  agentProvider: agentLaunch?.provider,
  agentLifecycle,
  onCleanup: onDispose,
  onProcessExit,
  onDispose,
}
```

Add one snapshot helper. Replace every hard-coded create or attach response with this helper.

```ts
function terminalCreateResult(session: TerminalSession): TerminalCreateResult {
  return {
    ...session.dimensions,
    ...session.delivery.snapshot(),
  }
}
```

- [ ] **Step 4: Update valid resize handling**

Normalize once. Store the same integer values sent to node-pty.

```ts
const session = getTerminalSession(runtimeIdentity)
if (!session || cols <= 0 || rows <= 0) return

const nextCols = Math.floor(cols)
const nextRows = Math.floor(rows)
session.pty.resize(nextCols, nextRows)
session.dimensions = { cols: nextCols, rows: nextRows }
```

Do not update dimensions if identity validation fails or `pty.resize` throws.

- [ ] **Step 5: Run focused tests and type checking**

Run:

```bash
npx tsx --test src/main/ipc/terminal.test.ts
npx tsc --noEmit
```

Expected: both commands exit with code `0`.

- [ ] **Step 6: Prepare the task handoff**

Provide the complete diff, changed-file list, RED output, GREEN output, and type-check output. Do not commit or push.

---

### Task 2: Add the target-keyed runtime registry

**Files:**

- Create: `src/renderer/src/utils/terminalRuntimeRegistry.ts`
- Create: `src/renderer/src/utils/terminalRuntimeRegistry.test.ts`

**Interfaces:**

- Consumes: `TerminalSessionTarget` from `@shared/terminalSessionIdentity`.
- Produces: `TerminalRuntimeRegistry`, `TerminalRuntimeHandle`, `TerminalRuntimeFactory`, and `terminalRuntimeKey`.

**Ownership:** This task owns only the two files listed above. It can run in parallel with Tasks 1 and 3.

- [ ] **Step 1: Write failing registry behavior tests**

Use real registry behavior and small fake runtime handles.

```ts
interface FakeRuntime extends TerminalRuntimeHandle {
  parks: number
  disposals: number
}

function target(workspaceId: string, tileId = 'terminal'): TerminalSessionTarget {
  return { workspaceId, tileId }
}

test('acquires one runtime for each workspace and tile target', async () => {
  let creations = 0
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  const factory = async (runtimeTarget: TerminalSessionTarget): Promise<FakeRuntime> => {
    creations += 1
    return createFakeRuntime(runtimeTarget)
  }

  const first = await registry.acquire(target('workspace-a'), factory)
  const second = await registry.acquire(target('workspace-a'), factory)
  const other = await registry.acquire(target('workspace-b'), factory)

  assert.equal(first, second)
  assert.notEqual(first, other)
  assert.equal(creations, 2)
})
```

Add tests for concurrent acquisition, `park`, `destroy`, `pruneWorkspace`, and `dispose`. The concurrent test must prove that two calls share one creation promise.

```ts
test('shares an in-flight runtime creation', async () => {
  const registry = new TerminalRuntimeRegistry<FakeRuntime>()
  const pending = Promise.withResolvers<FakeRuntime>()

  const first = registry.acquire(target('workspace-a'), () => pending.promise)
  const second = registry.acquire(target('workspace-a'), () => pending.promise)
  const runtime = createFakeRuntime(target('workspace-a'))
  pending.resolve(runtime)

  assert.equal(await first, runtime)
  assert.equal(await second, runtime)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx tsx --test src/renderer/src/utils/terminalRuntimeRegistry.test.ts
```

Expected: module resolution fails because the registry does not exist.

- [ ] **Step 3: Implement canonical keys and the runtime contract**

Create these public types.

```ts
import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'

export interface TerminalRuntimeHandle {
  readonly target: TerminalSessionTarget
  park: (parkingRoot: HTMLElement | null) => void
  dispose: (destroyPty: boolean) => Promise<void>
}

export type TerminalRuntimeFactory<T extends TerminalRuntimeHandle> = (
  target: TerminalSessionTarget,
) => Promise<T>

export function terminalRuntimeKey(target: TerminalSessionTarget): string {
  return JSON.stringify([target.workspaceId, target.tileId])
}
```

- [ ] **Step 4: Implement registry acquisition and cleanup**

Use one map for completed runtimes and one map for in-flight promises. Remove a rejected creation promise so a later acquisition can retry.

```ts
export class TerminalRuntimeRegistry<T extends TerminalRuntimeHandle = TerminalRuntimeHandle> {
  private readonly runtimes = new Map<string, T>()
  private readonly creations = new Map<string, Promise<T>>()
  private parkingRoot: HTMLElement | null = null

  setParkingRoot(root: HTMLElement | null): void
  acquire(target: TerminalSessionTarget, factory: TerminalRuntimeFactory<T>): Promise<T>
  get(target: TerminalSessionTarget): T | undefined
  park(target: TerminalSessionTarget): void
  destroy(target: TerminalSessionTarget, destroyPty?: boolean): Promise<void>
  pruneWorkspace(workspaceId: string, retainedTileIds: Iterable<string>): Promise<void>
  destroyWorkspace(workspaceId: string): Promise<void>
  dispose(): Promise<void>
}
```

`pruneWorkspace` destroys only keys from the selected workspace whose tile IDs are not retained. `dispose` calls `runtime.dispose(false)` because the existing main-process shutdown flow owns PTY termination.

- [ ] **Step 5: Run focused tests and type checking**

Run:

```bash
npx tsx --test src/renderer/src/utils/terminalRuntimeRegistry.test.ts
npx tsc --noEmit
```

Expected: both commands exit with code `0`.

- [ ] **Step 6: Prepare the task handoff**

Provide the complete diff, changed-file list, RED output, GREEN output, and type-check output. Do not commit or push.

---

### Task 3: Implement one persistent terminal runtime

**Files:**

- Create: `src/renderer/src/utils/terminalRuntime.ts`
- Create: `src/renderer/src/utils/terminalRuntime.test.ts`
- Modify: `src/renderer/src/utils/terminalFitScheduler.ts`
- Modify: `src/renderer/src/utils/terminalFitScheduler.test.ts`

**Interfaces:**

- Consumes: `TerminalRuntimeHandle`, `TerminalSessionTarget`, `TerminalCreateOptions`, `TerminalCreateResult`, `TerminalSessionIdentity`, existing replay sanitizer/controller, and fit scheduler.
- Produces: `TerminalRuntime`, `TerminalRuntimeDependencies`, `TerminalRuntimeViewOptions`, `TerminalRuntimeSnapshot`, and `createTerminalRuntime`.

**Ownership:** This task starts after Task 2 is accepted and integrated. It owns only the four files listed above. Task 1 can continue in parallel.

- [ ] **Step 1: Write failing runtime lifecycle tests**

Build complete fakes for xterm, fit, bridge, DOM roots, resize observer, frames, and fonts. Assert observable order.

```ts
test('creates xterm with PTY dimensions before the initial replay', async () => {
  const harness = createRuntimeHarness({ createResult: createResult({ cols: 132, rows: 41, buffer: 'screen' }) })

  const runtime = await createTerminalRuntime(harness.options)
  await harness.completeReplay()

  assert.deepEqual(harness.terminalCreations, [{ cols: 132, rows: 41 }])
  assert.deepEqual(harness.events.slice(0, 3), [
    'terminal:create:132x41',
    'terminal:open',
    'terminal:write:screen',
  ])
  await runtime.dispose(false)
})
```

Add a parking test. Write `before`, attach a host, park the runtime, write `background`, attach another host, and assert the same fake terminal contains both writes. Assert replay count remains one.

```ts
test('keeps parsing output while parked and does not replay on reattachment', async () => {
  const harness = createRuntimeHarness()
  const runtime = await createTerminalRuntime(harness.options)
  await harness.completeReplay()

  runtime.attachHost(harness.host('first'), visibleViewOptions())
  runtime.park(harness.parkingRoot)
  harness.emitData('background')
  runtime.attachHost(harness.host('second'), visibleViewOptions())

  assert.equal(harness.terminals.length, 1)
  assert.equal(harness.replayCalls, 1)
  assert.match(harness.terminalWrites.join(''), /background/)
  await runtime.dispose(false)
})
```

Add separate tests for:

- hidden runtime does not fit or resize;
- reattached measurable host fits and refreshes;
- an unmeasurable fit stays dirty and retries after observer notification;
- unchanged dimensions do not call PTY resize;
- stale identity callbacks are ignored;
- remote exit state survives parking;
- `dispose(true)` destroys the PTY and `dispose(false)` only detaches delivery;
- alternate-screen fixture `\x1b[?1049h...\x1b[?1049l` and synchronized-output fixture `\x1b[?2026h...\x1b[?2026l` are written once while the same terminal instance is reused.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx tsx --test src/renderer/src/utils/terminalRuntime.test.ts src/renderer/src/utils/terminalFitScheduler.test.ts
```

Expected: the runtime module does not exist. The new dirty-fit scheduler test also fails before implementation.

- [ ] **Step 3: Extend the fit scheduler with measurable readiness**

Retain the existing two-frame coalescing and dimension de-duplication. Change `requestFit` to return a result through the callback or a public state that distinguishes `fitted`, `unchanged`, and `unmeasurable`.

```ts
export type TerminalFitResult = 'fitted' | 'unchanged' | 'unmeasurable'

requestFit(
  fitAddon: TerminalFitAddonLike,
  resizeTerminal: (cols: number, rows: number) => void,
  onComplete?: (result: TerminalFitResult) => void,
): void
```

If `proposeDimensions()` returns no positive geometry, report `unmeasurable`. Do not lose the runtime's dirty flag. The runtime retries only after host attachment, `ResizeObserver`, or font readiness.

- [ ] **Step 4: Define runtime dependencies and observable state**

Use dependency injection so tests execute real lifecycle code without mocking module text.

```ts
export interface TerminalRuntimeSnapshot {
  preparing: boolean
  reconnecting: boolean
  exitEvent: TerminalExitEvent | null
  error: string | null
  title: string | null
}

export interface TerminalRuntimeViewOptions {
  visible: boolean
  edgeToEdge: boolean
  autoFocus: boolean
  fontSize: number
  themeId: TerminalThemeId
  notificationsMuted: boolean
  workspaceRootPath: string
  onFocus: () => void
  onOpenBrowserTile?: (url: string) => void
  onOpenFileTile?: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
}

export interface TerminalRuntimeDependencies {
  bridge: Window['electron']['terminal']
  createElement: () => HTMLDivElement
  createTerminal: (options: { cols: number; rows: number }) => TerminalLike
  createFitAddon: () => FitAddonLike
  createResizeObserver: (callback: () => void) => ResizeObserverLike
  getParkingRoot: () => HTMLElement | null
  whenFontsReady: () => Promise<void>
  onActivity: (target: TerminalSessionTarget) => void
  onClearActivity: (target: TerminalSessionTarget) => void
  onTitle: (target: TerminalSessionTarget, title: string | null) => void
  reportError: (target: TerminalSessionTarget, operation: string, error: unknown) => void
}
```

Keep mutable view callbacks in one runtime-owned options field. Update that field on every host attachment. Do not capture a React render callback permanently.

- [ ] **Step 5: Create the runtime in identity-safe order**

Implement this order:

```ts
const created = await bridge.create(target, createOptions)
const terminal = createTerminal({ cols: created.cols, rows: created.rows })
terminal.loadAddon(fitAddon)
terminal.open(runtimeRoot)
registerTerminalListeners(created.identity)
const attached = await bridge.attach(created.identity)
replayController.replay({
  buffer: sanitizeTerminalReplayBuffer(attached.buffer),
  exitEvent: attached.exitEvent,
})
```

The runtime must queue live data until replay completes. It must use the current identity for input, resize, detach, destroy, and agent-alert acknowledgement. It must never replay again after `ready` becomes true.

- [ ] **Step 6: Implement host attachment, parking, fitting, and refresh**

`attachHost` moves `runtimeRoot` into the host with `host.replaceChildren(runtimeRoot)`. It applies current padding, visibility, theme, font size, and link callbacks. It observes the host. It marks fit dirty and requests a fit only when visible.

`park` disconnects the observer, cancels pending fit, marks the runtime hidden, and moves `runtimeRoot` to the connected parking root. Data subscriptions remain installed.

After a successful or unchanged fit on a visible host, run:

```ts
const lastRow = terminal.rows - 1
if (lastRow >= 0) terminal.refresh(0, lastRow)
```

Send PTY resize only from the scheduler's changed-dimension callback.

- [ ] **Step 7: Implement runtime state and disposal**

Use `subscribe(listener)` and `getSnapshot()` for remote overlays. `dispose(true)` cancels creation, unregisters every listener, disconnects the observer, disposes xterm, removes the runtime root, and destroys the current identity. `dispose(false)` performs the same renderer cleanup but calls detach instead of destroy.

Never log output or command data. Report only target IDs, operation names, and errors through `reportError`.

- [ ] **Step 8: Run focused tests and type checking**

Run:

```bash
npx tsx --test src/renderer/src/utils/terminalRuntime.test.ts src/renderer/src/utils/terminalFitScheduler.test.ts
npx tsc --noEmit
```

Expected: both commands exit with code `0`.

- [ ] **Step 9: Prepare the task handoff**

Provide the complete diff, changed-file list, RED output, GREEN output, and type-check output. Do not commit or push.

---

### Task 4: Integrate persistent runtimes with React and workspace views

**Files:**

- Create: `src/renderer/src/components/TerminalRuntimeProvider.tsx`
- Create: `src/renderer/src/components/TerminalRuntimeProvider.test.tsx`
- Modify: `src/renderer/src/components/TerminalTile.tsx`
- Modify: `src/renderer/src/components/TerminalTile.test.ts`
- Modify: `src/renderer/src/components/TileContent.tsx`
- Modify: `src/renderer/src/components/Canvas.tsx`
- Modify: `src/renderer/src/components/GridView.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/hooks/useCanvasActions.ts`
- Delete: `src/renderer/src/utils/terminalActivationFit.ts`
- Delete: `src/renderer/src/utils/terminalActivationFit.test.ts`

**Interfaces:**

- Consumes: Task 1 dimensions, Task 2 registry, Task 3 runtime and view options.
- Produces: `TerminalRuntimeProvider`, `useTerminalRuntimeRegistry`, `TerminalRuntimeHost`, and explicit workspace target propagation.

**Ownership:** This task starts only after Tasks 1 through 3 are accepted and integrated. It owns only the files listed above.

- [ ] **Step 1: Write failing provider and host tests**

Use the repository's existing lightweight renderer DOM harness. Inject a real registry with fake runtimes.

```ts
test('parks a terminal runtime when its workspace host unmounts', async () => {
  const runtime = createFakeRuntime({ workspaceId: 'workspace-a', tileId: 'terminal-a' })
  const registry = registryWith(runtime)
  const view = renderTerminalHost({ registry, workspaceId: 'workspace-a', tileId: 'terminal-a' })

  await view.ready()
  view.unmount()

  assert.equal(runtime.parkCalls, 1)
  assert.equal(runtime.disposeCalls, 0)
})
```

Add a switch-back test. Mount workspace A, unmount, mount workspace B, unmount, then mount A again. Assert A uses the same runtime object and its replay count remains one.

Add propagation tests for Canvas and GridView. Two workspaces with the same tile ID must acquire different runtime keys.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx tsx --test src/renderer/src/components/TerminalRuntimeProvider.test.tsx src/renderer/src/components/TerminalTile.test.ts src/renderer/src/components/GridView.test.tsx
```

Expected: provider module and explicit workspace target props do not exist.

- [ ] **Step 3: Add the provider and parking root**

Create a context that owns one registry for the App lifetime.

```tsx
const TerminalRuntimeContext = createContext<TerminalRuntimeRegistry<TerminalRuntime> | null>(null)

export function TerminalRuntimeProvider({ children, events }: Props): React.ReactElement {
  const registryRef = useRef<TerminalRuntimeRegistry<TerminalRuntime>>()
  const parkingRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    registryRef.current.setParkingRoot(parkingRef.current)
    return () => {
      registryRef.current.setParkingRoot(null)
      void registryRef.current.dispose()
    }
  }, [])

  return (
    <TerminalRuntimeContext.Provider value={registryRef.current}>
      {children}
      <div ref={parkingRef} aria-hidden className="fixed -left-[100000px] top-0 h-px w-px overflow-hidden" />
    </TerminalRuntimeContext.Provider>
  )
}
```

Create the registry once with a lazy ref initializer valid for React 19 and strict TypeScript. Keep the parking root connected. Do not use `display: none`.

- [ ] **Step 4: Refactor TerminalTile into a runtime host**

Add required `workspaceId: string`. Build the explicit target from props. Acquire a runtime once per target. On each render, update view options. On layout effect, attach the host. On cleanup, call `registry.park(target)`. Do not dispose xterm or detach PTY in React cleanup.

Use `useSyncExternalStore` with runtime `subscribe` and `getSnapshot` for remote preparation, error, exit, and reconnect UI. Keep context menu UI in `TerminalTile`, but call runtime methods for focus, selection, paste, select-all, notification settings, and reconnect.

Retain pure exported helpers that have behavior tests. Remove lifecycle source-text assertions from `TerminalTile.test.ts`.

- [ ] **Step 5: Pass explicit workspace IDs through view components**

Replace `terminalActivationGeneration` with required `workspaceId` in `TileContent`, `Canvas`, and `GridView`.

```tsx
<TileContent
  tile={tile}
  workspaceId={workspaceId}
  workspaceRootPath={workspaceRootPath}
  ...
/>
```

`TerminalTile` must never call `useCanvasStore.getState().activeWorkspaceId` to determine its target.

- [ ] **Step 6: Install the provider and route runtime events**

Wrap the active workspace surface inside `TerminalRuntimeProvider` at an App lifetime level. The provider must not remount when `activeWorkspaceId` changes.

Use target-scoped callbacks:

```ts
onTitle(target, title) {
  const state = useCanvasStore.getState()
  if (state.activeWorkspaceId !== target.workspaceId) return
  state.setTerminalTitle(target.tileId, title)
}

onActivity(target) {
  const state = useCanvasStore.getState()
  if (state.activeWorkspaceId === target.workspaceId) {
    state.markTerminalOutput(target.tileId)
    return
  }
  setWorkspaceAttentionCounts((current) => incrementWorkspaceAttentionCount(current, target.workspaceId))
}
```

Add a tested `incrementWorkspaceAttentionCount` helper in `workspaceAttention.ts` only if direct background activity counting is required. Respect terminal attention settings and the runtime's retained `notificationsMuted` option. Do not mutate the active workspace store for a hidden target.

- [ ] **Step 7: Integrate refresh and deletion cleanup**

For terminal refresh, call `registry.destroy(target, true)` before bumping the tile refresh key. Do not also call `destroyCurrent` for the same operation.

For terminal deletion in `useCanvasActions`, inject or pass a target cleanup callback. Await renderer runtime destruction before removing the tile.

After workspace management removes IDs, call `registry.destroyWorkspace(workspaceId)` for every removed ID. When an active workspace state loads, call `registry.pruneWorkspace(activeWorkspaceId, terminalTileIds)` after the state is restored.

- [ ] **Step 8: Remove the activation-generation workaround**

Remove state, props, imports, and calls related to `terminalActivationGeneration`, `currentActivationGenerationRef`, `completedReplayGenerationRef`, `currentReplayGenerationRef`, `isStaleRef`, and `canFitTerminalAfterActivation`.

Delete the obsolete predicate and its test. Keep workspace-scoped PTY identities, replay ordering for first activation, and view-root keys needed by non-terminal view lifecycle.

- [ ] **Step 9: Run focused tests and type checking**

Run:

```bash
npx tsx --test src/renderer/src/components/TerminalRuntimeProvider.test.tsx src/renderer/src/components/TerminalTile.test.ts src/renderer/src/components/GridView.test.tsx src/renderer/src/utils/workspaceAttention.test.ts
npx tsc --noEmit
```

Expected: both commands exit with code `0`.

- [ ] **Step 10: Prepare the task handoff**

Provide the complete diff, changed-file list, RED output, GREEN output, and type-check output. Do not commit or push.

---

### Task 5: Register regression coverage and verify the complete flow

**Files:**

- Modify: `package.json`
- Modify: `src/renderer/src/components/GridView.refresh.test.ts`
- Review without changing unless a failure requires correction: tests changed by Tasks 1 through 4

**Interfaces:**

- Consumes: every behavior delivered by Tasks 1 through 4.
- Produces: one complete default test command and final verification evidence.

**Ownership:** This task starts only after Task 4 is accepted and integrated. It must not change production behavior unless a failing regression test proves a missed requirement.

- [ ] **Step 1: Add all behavior tests to the default test command**

Add these files to the `tsx --test` section of `npm test`:

```text
src/renderer/src/components/TerminalRuntimeProvider.test.tsx
src/renderer/src/utils/terminalRuntime.test.ts
src/renderer/src/utils/terminalRuntimeRegistry.test.ts
src/renderer/src/utils/terminalFitScheduler.test.ts
```

Remove `src/renderer/src/utils/terminalActivationFit.test.ts` after Task 4 deletes it.

- [ ] **Step 2: Run the complete automated suite**

Run:

```bash
npm test
```

Expected: exit code `0`. No test can inspect source text as proof of terminal lifecycle behavior.

- [ ] **Step 3: Run strict type checking**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code `0` with no TypeScript diagnostics.

- [ ] **Step 4: Build all Electron targets available on Linux**

Run:

```bash
npm run build
```

Expected: exit code `0`. Do not run `npm run dist:win`.

- [ ] **Step 5: Inspect scope and mutation coverage**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Confirm these mutations fail at least one test:

- registry key omits `workspaceId`;
- registry disposes during `park`;
- runtime replays after reattachment;
- hidden runtime sends PTY resize;
- main attach returns hard-coded `80x24`;
- stale identity changes stored dimensions;
- provider remounts on workspace changes.

- [ ] **Step 6: Perform manual Electron verification**

Run:

```bash
npm run dev
```

Verify:

1. Yira opens only the last active workspace.
2. Workspace B loads only after selection.
3. Codex in workspace A continues while B is visible.
4. Claude or OpenCode in workspace B continues while A is visible.
5. Ten repeated switches preserve exact text and cursor layout.
6. Background output appears immediately on return.
7. Full view, split view, grid view, and tile resizing fit correctly.
8. Refresh creates one replacement runtime.
9. Deleting a tile stops only its PTY and runtime.
10. Deleting a workspace stops only runtimes from that workspace.

If no graphical session is available, report manual verification as pending. Do not claim it passed.

- [ ] **Step 7: Prepare final handoff**

Report complete diffs, all command outputs, unresolved manual checks, and remaining unrelated worktree files. Do not commit or push.

## Plan Self-Review

- Spec coverage: Tasks 1 through 5 cover canonical dimensions, persistent renderer runtimes, parking, lazy activation, background output, target-scoped events, cleanup, obsolete workaround removal, automated checks, and manual verification.
- Placeholder scan: Every implementation step names concrete interfaces, behavior, commands, and expected results.
- Type consistency: All runtime keys use `TerminalSessionTarget`. PTY operations use `TerminalSessionIdentity`. The registry owns `TerminalRuntimeHandle` values. React passes explicit `workspaceId` values.
- Dependency order: Tasks 1 and 2 are independent. Task 3 starts after Task 2. Task 4 starts after Tasks 1 and 3. Task 5 verifies the integrated result.
- Git boundary: Agents do not commit, push, create PRs, tag, or release.
