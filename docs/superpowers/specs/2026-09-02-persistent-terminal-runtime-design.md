# Persistent Terminal Runtime Design

## Goal

Keep every terminal runtime active after its workspace is activated during the
current Yira process. Preserve the exact xterm state and all output while the
user views another workspace. Restore the same terminal view without replaying
its retained ANSI buffer again.

## Required workspace behavior

- Load the last active workspace when Yira starts.
- Do not load other workspaces at startup.
- Activate another workspace only after the user selects it.
- Keep every workspace activated during the current Yira process active in the
  background.
- Keep PTY processes running when their workspace is hidden.
- Keep parsing terminal output when their workspace is hidden.
- Show all background output when the user returns to the workspace.
- Stop all session runtimes through the existing application shutdown flow.

## Root cause

Commit `460ef3c` added two rendering workarounds. It scheduled a fit after two
animation frames. It also intercepted the synchronized-output reset sequence
used by terminal applications and forced a visible-row refresh. Commit
`72c6249` removed both changes because the parser interception caused a
rendering regression. Those changes acted on repaint timing. They did not
define a stable workspace terminal lifecycle.

Commit `b5afb87` added workspace-scoped PTY identities and ordered terminal
delivery. These changes correctly protect PTY operations from stale renderer
callbacks. The same commit also made `Canvas` and `GridView` remount for every
workspace change. Each new `TerminalTile` creates a new xterm instance and
replays the retained raw ANSI buffer before it fits the terminal.

The main process does not retain the actual PTY dimensions. Terminal create and
attach responses always report `80x24`. The renderer does not use those values
when it constructs xterm. Agent interfaces such as Codex, Claude, and OpenCode
use cursor addressing, alternate-screen buffers, and synchronized output.
Replaying their output into a new terminal with a different geometry changes
the interpreted screen state. A later fit cannot reconstruct the original
state. A view change can cause the live application to redraw, which explains
why that action previously repaired the display.

The current activation guard also depends on replay completion. It prevents
some stale fits, but it does not prevent the incorrect replay. Its unit tests
cover only the predicate. They do not cover a complete workspace switch. Some
terminal tests inspect source text instead of observable runtime behavior.

## Considered approaches

### Persistent terminal runtime registry

Keep one renderer terminal runtime for each activated `workspaceId + tileId`.
Move its already-open DOM root between the visible tile host and a hidden
parking root. Continue to parse output while the runtime is parked. Replay the
main-process buffer only when the runtime is first created.

This approach preserves the exact emulator state during workspace changes. It
also retains the existing lazy workspace activation behavior. This is the
selected approach.

### Geometry-correct replay on every workspace change

Retain actual PTY dimensions. Initialize each new xterm with those dimensions.
Then replay the main-process buffer and fit the visible terminal.

This is less invasive. It cannot guarantee exact reconstruction. The retained
buffer is bounded to 500,000 characters and can start after a required ANSI
state transition. A terminal application can also have produced output under
multiple previous geometries.

### Keep complete workspace surfaces mounted

Keep every activated `Canvas` or `GridView` React tree mounted and hide inactive
trees.

This preserves terminal components. It requires workspace-scoped stores for
all canvas, grid, board, selection, and focus state. It also retains unrelated
editors and browser tiles. This scope is not required to fix terminal output.

## Architecture

### Terminal runtime registry

Add one application-scoped `TerminalRuntimeRegistry`. It owns every renderer
terminal runtime created during the current Yira process. A runtime key contains
the canonical `workspaceId` and `tileId`.

The registry provides these operations:

- `acquire(target, options)` returns the existing runtime or creates it once.
- `attachHost(target, host, visible)` moves the runtime DOM root into a tile.
- `park(target)` moves the runtime DOM root into the parking root.
- `setVisible(target, visible)` controls fit and focus eligibility.
- `destroy(target)` disposes the renderer runtime and destroys its current PTY.
- `dispose()` detaches and disposes all renderer runtimes during shutdown.
- `pruneWorkspace(workspaceId, tileIds)` removes runtimes for deleted tiles.

The registry must not read the current workspace from the global canvas store.
Every operation receives an explicit workspace target.

### Terminal runtime

One `TerminalRuntime` owns:

- One xterm `Terminal` instance.
- One `FitAddon` instance.
- One runtime-owned DOM root.
- One `TerminalSessionIdentity` after PTY creation.
- Data, exit, input, title, clipboard, link, and agent-alert subscriptions.
- Initial replay state.
- Visibility and host state.
- Remote preparation, exit, and reconnect state.
- A cancelable fit scheduler.

The runtime creates xterm and attaches to the PTY once. It does not dispose when
React changes workspace. It disposes only when the terminal tile is deleted,
its workspace is deleted, the user explicitly refreshes that terminal, or Yira
closes.

### Host and parking root

`TerminalRuntimeHost` is the terminal tile's visual adapter. It registers its
host element after React commits. It parks the runtime during cleanup. Cleanup
must not detach the renderer delivery or dispose xterm.

`TerminalParkingRoot` is a single application-owned element. It remains
connected to the document. Parked runtime roots use hidden, non-interactive
layout. They keep their xterm parser and subscriptions active. They do not fit,
focus, or resize their PTY while parked.

Moving a runtime root must preserve the same DOM node created before
`Terminal.open()`. Yira must not call `Terminal.open()` a second time.

### Main-process dimensions

Extend each terminal session with canonical `cols` and `rows` values. Initialize
them to `80` and `24`. Update them only after a valid PTY resize. Return the
current values from terminal create and attach responses.

The renderer uses these values when it creates xterm before the initial replay.
This protects initial activation, renderer reload, and recovery paths. It does
not replace the persistent runtime behavior used for normal workspace changes.

### Workspace activation

Keep workspace metadata loading unchanged. On startup, load only the last active
workspace. When the user selects another workspace, load its persisted view
state as today.

Before the active surface changes, park visible terminal runtimes from the
outgoing workspace. When the new surface commits, each terminal host acquires
and attaches its runtime. A previously activated terminal reuses the same
runtime. A terminal activated for the first time creates a runtime and performs
one initial replay.

The existing workspace-scoped session identity remains mandatory for PTY write,
resize, detach, destroy, data, and exit operations. Delayed work must compare
the captured identity with the runtime's current identity.

The renderer-only `terminalActivationGeneration` predicate becomes redundant.
Remove it after the registry owns runtime identity, replay state, visibility,
and host attachment. Retain `key={activeWorkspaceId}` on workspace view roots
only if another view lifecycle requires it. It must not control terminal runtime
disposal.

## Data flow

### First terminal activation

```text
workspace selected
-> persisted workspace state loaded
-> terminal host committed
-> registry creates runtime
-> main returns identity and current PTY dimensions
-> runtime creates xterm with those dimensions
-> runtime opens xterm in its owned DOM root
-> runtime registers identity-scoped listeners
-> runtime attaches renderer delivery
-> runtime replays retained output once
-> runtime flushes queued live data in order
-> runtime attaches its DOM root to the visible host
-> runtime fits, refreshes visible rows, and resizes the PTY if required
```

### Workspace hidden

```text
terminal host cleanup
-> registry marks runtime hidden
-> registry cancels pending fit
-> registry moves runtime DOM root to parking root
-> PTY continues running
-> data listener continues writing into the same xterm instance
```

### Workspace shown again

```text
terminal host committed
-> registry finds existing runtime
-> registry moves the same DOM root into the visible host
-> registry waits for measurable host geometry
-> registry fits xterm
-> registry refreshes visible rows
-> registry resizes PTY only when dimensions changed
```

No retained-buffer replay occurs in this path.

### Tile refresh and deletion

Refresh destroys the current PTY and renderer runtime for the explicit target.
The next host acquisition creates a new runtime. Deletion performs the same
cleanup and removes persisted tile state. A workspace deletion destroys every
runtime with that workspace ID.

## Fit and rendering rules

- Only a visible runtime with an attached host can request a fit.
- One scheduler coalesces repeated fit requests per runtime.
- A request remains pending when xterm or host dimensions are not measurable.
- `ResizeObserver`, font readiness, and host attachment can retry a pending
  request.
- Do not use an arbitrary timeout as a readiness condition.
- Send a PTY resize only when columns or rows changed.
- Refresh xterm visible rows after host reattachment and final fit.
- Do not register a custom synchronized-output parser handler.
- Do not clear, reset, or replay xterm to repair a workspace change.

## Attention and remote status

A parked runtime must not write terminal attention into the active workspace's
canvas store. Runtime callbacks carry their explicit workspace target. Existing
workspace attention aggregation can receive target-scoped activity without
assuming that its workspace is visible.

Remote preparation, remote exit, and reconnect state belong to the runtime.
When a remote terminal exits while parked, the runtime retains the exit state.
The host reads that state when the workspace becomes visible.

## Error handling

- Ignore stale callbacks whose identity does not match the runtime identity.
- Contain fit errors. Keep the PTY and xterm active.
- If initial replay fails, keep the runtime allocated and expose a visible error.
- Do not clear terminal output after replay, fit, or remote errors.
- If a host disappears during attach, park the runtime after creation completes.
- If a tile is deleted during creation, cancel the creation result and destroy
  only the identity created for that target.
- If a runtime DOM move fails, keep it parked and report the target and operation.
- Do not log terminal output, command text, provider prompts, or filesystem paths.

## Testing

Add behavior tests for these contracts:

- The registry returns the same runtime for repeated acquisition of one target.
- Different workspaces with the same tile ID receive different runtimes.
- Parking preserves the xterm instance and active data subscription.
- Data received while parked is visible after the same runtime is reattached.
- Reattachment does not call the replay operation.
- Initial activation calls replay exactly once.
- Initial xterm dimensions match the current PTY dimensions.
- A resize updates canonical main-process dimensions.
- A later attach returns the updated dimensions.
- Hidden runtimes do not fit or resize.
- Host reattachment fits and refreshes after measurable geometry exists.
- Stale identities cannot write, resize, detach, or destroy another session.
- Remote exit state survives parking and reattachment.
- Refresh, terminal deletion, workspace deletion, and application disposal remove
  only their intended runtimes.
- Alternate-screen and synchronized-output fixtures remain correct across park
  and reattach because the same emulator instance processes all data.

Replace source-text assertions for terminal lifecycle behavior with tests of the
registry, runtime, main delivery, and host adapter. Register all new test files
in `npm test`, including the existing terminal fit scheduler test.

Run these checks:

```bash
npx tsc --noEmit
npm test
npm run build
```

Manually verify this sequence with Codex, Claude, and OpenCode:

1. Open workspace A and start an agent terminal.
2. Open workspace B and start another agent terminal.
3. Leave both agents producing output.
4. Switch between A and B at least ten times.
5. Confirm that no terminal output shifts after any switch.
6. Confirm that background output is present immediately after each return.
7. Change tile size and view mode.
8. Confirm that each visible terminal fits without repairing prior corruption.
9. Restart Yira.
10. Confirm that only the last active workspace loads automatically.

## Scope limits

- Do not persist renderer runtimes across Yira process restarts.
- Do not load every workspace at startup.
- Do not keep complete React workspace surfaces mounted.
- Do not change the 500,000-character retained-output limit in this change.
- Do not change agent commands, PTY shutdown policy, or remote SSH startup policy.
- Do not add a parser hook for synchronized output.
