# Terminal Workspace Lifecycle Design

## Goal

Keep terminal output correct when an agent process exits and when the user
changes workspace. Preserve all process output. Do not append a Yira message,
clear the terminal, or start a replacement shell.

## Scope

- Preserve the final terminal screen and scrollback for local agent terminals.
- Deliver all PTY output before Yira marks a session exited and disconnects
  renderer delivery.
- Keep process identity, renderer delivery, and xterm widget lifecycle
  separate.
- Refit each visible xterm instance after a workspace restore and after its
  replay completes.
- Prevent an operation from a previous workspace instance from changing a
  newer terminal instance with the same tile ID.
- Add automated coverage for PTY exit delivery and workspace activation fit.

## Out of scope

- Change the behavior of `Ctrl+C`. It remains input `\x03` to the foreground
  PTY process.
- Add a terminal exit banner, an agent-completed message, a restart action, or
  a replacement shell.
- Clear output or reset xterm as a generic response to process exit.
- Reintroduce the removed synchronized-output refresh handler without a
  separate confirmed regression.
- Diagnose or change Wayland-specific rendering behavior.
- Rebuild Yira around Orca ADE's parking, visibility-claim, or worktree
  architecture.

## Current failure modes

### Agent process exit

`TerminalTile` forwards `Ctrl+C` as normal terminal input. The main process
stores PTY output and forwards it to renderer listeners. When a local process
exits, Yira keeps the terminal session for later reattach, but the renderer
does not apply a local-exit lifecycle action. The final xterm state therefore
depends on the provider's ANSI output.

The main process also combines lifecycle cleanup with listener cleanup. This
coupling makes the terminal vulnerable to an output-versus-exit ordering race.
A local terminal must retain its last output exactly. It must not receive a
synthetic status line or a broad reset.

### Workspace activation

`activateWorkspace` restores tiles, view state, and workspace configuration in
one store update. A newly mounted terminal replays its retained buffer before
its fit request. A reused React component can receive no lifecycle signal at
all because its key is only `tile.id`. Changing view updates visibility or
padding and calls `doFit`, which explains why that action repairs the visual
drift.

## Chosen design

### Three independent lifecycles

Maintain these three lifecycles explicitly:

1. **PTY session.** The main process owns the process, retained output,
   terminal dimensions, exit event, and one monotonically increasing session
   generation. A process exit changes this lifecycle to `exited`. It does not
   delete the retained output.
2. **Renderer delivery.** Each mounted renderer attaches with the PTY
   generation that it expects. Main sends data and exit events only to current
   delivery registrations. Main finishes queued output delivery before it
   publishes the exit event and removes the registration.
3. **xterm widget.** A `TerminalTile` owns one xterm instance for one
   workspace activation generation. It can detach without killing the PTY.
   It replays the retained buffer when it attaches. It retains the provider's
   final terminal state and shows no Yira-generated output.

The implementation must use a `TerminalSessionIdentity` value. It contains
`workspaceId`, `tileId`, and `generation`. `tileId` alone is not a valid
identity for lifecycle work. Main continues to use its normalized runtime tile
ID as its PTY lookup key. The renderer identity prevents old async callbacks
from issuing resize, detach, replay, or exit actions for a newer mount.

### Silent exit finalization

Main must record an exit event without discarding queued PTY data. It must
retain the output buffer and make the exit event available to later attaches.
The renderer must subscribe to local and remote exit events. For a local exit,
the handler records only internal completion state. It does not call
`term.write` with Yira text, `term.clear`, `term.reset`, or a generic ANSI
reset sequence.

If xterm has queued terminal writes when the exit event arrives, the renderer
must wait for that queue to complete before it completes the widget's internal
exit finalization. The finalization may call a bounded visible-row refresh only
when xterm reports a completed synchronized-output mode. It must not restore
the removed parser handler as a blanket workaround.

The main process must preserve the ordering contract:

```
PTY output -> retained buffer and active renderer delivery -> exit event -> delivery cleanup
```

The contract applies to a normal agent exit, `Ctrl+C` that exits a direct agent
PTY, and a later renderer reattach to an exited session. It does not assume
that a manually launched OpenCode process exits the parent shell PTY.

### Workspace activation fit

The renderer owns a workspace activation generation. `activateWorkspace`
increments it only after the requested workspace state becomes active. Visible
terminal widgets receive that generation as an explicit lifecycle input.

For each visible widget, the activation flow is:

```
restore workspace state -> React commit -> replay retained buffer -> xterm write completion
-> first fit -> next-frame stabilization fit -> PTY resize when dimensions changed
```

The existing `TerminalFitScheduler` remains the only component that calculates
and de-duplicates PTY dimensions. The activation coordinator only requests a
fit. It does not calculate columns or rows itself.

Hidden widgets must not issue activation fits. Their next visible transition
requests the same fit sequence. The final request must verify the renderer
identity before it resizes the PTY. This prevents a delayed callback from
workspace A from resizing a matching tile in workspace B.

The fit happens after replay completion because xterm must calculate wrapping
against final dimensions. A viewport refresh is permitted only after the final
fit and only for the visible rows. It must be tested separately from terminal
output delivery.

### Mount and reattach behavior

Use the workspace activation generation in `Canvas` and `GridView` terminal
keys or in an equivalent explicit terminal lifecycle prop. A workspace change
must not preserve an xterm widget merely because another workspace contains
the same tile ID.

When a previous widget unmounts, it detaches only its own renderer delivery
registration. Main must ignore that detach if the request identity does not
match the current registration. A new widget attaches to the retained PTY
session, receives its buffer and exit event, then starts the activation fit
sequence when visible.

## Components

- `src/shared/types.ts`: add the typed identity and terminal-create/attach
  fields needed across renderer, preload, and main process.
- `src/main/ipc/terminal.ts`: retain output through exit, coordinate ordered
  data and exit delivery, and validate renderer attachment or detachment by
  session identity.
- `src/preload/index.ts` and `src/renderer/src/electron.d.ts`: expose the
  typed terminal identity and exit result through the safe IPC bridge.
- `src/renderer/src/components/TerminalTile.tsx`: attach one xterm widget to
  one identity, wait for replay writes, handle local exits silently, and
  request activation fits only when the widget is visible and current.
- `src/renderer/src/utils/terminalFitScheduler.ts`: retain its two-frame fit
  and dimension de-duplication. Extend only if an identity guard needs a
  cancelable request boundary.
- `src/renderer/src/components/Canvas.tsx`, `GridView.tsx`, and `App.tsx`:
  provide the activation generation and lifecycle key after workspace restore.

## Error handling and limits

- A stale attach, detach, resize, replay callback, or exit callback is ignored.
- A failed `FitAddon` calculation remains contained. It must not terminate the
  PTY or clear retained output.
- Main keeps the current retained-output limit of 500,000 characters unless a
  focused test proves another limit is required.
- The renderer records errors with terminal identity and operation name. It
  must not log terminal output, command text, provider prompts, or paths.
- A detached renderer does not make the main process destroy a live PTY.

## Verification

- Main-process tests prove that final data is delivered before a local exit,
  the buffer and exit event survive reattach, and stale detach or resize calls
  cannot affect a newer generation.
- Renderer tests prove that a local exit adds no text and does not clear or
  reset xterm.
- Renderer tests prove that replay completion requests a fit for the active,
  visible workspace generation and suppresses it for hidden widgets.
- Scheduler tests prove that the first and stabilization frames retain
  dimension de-duplication and ignore canceled or stale work.
- Integration-level component tests cover a workspace switch with different
  terminal dimensions and a reused tile ID.
- Run `npx tsc --noEmit`, `npm test`, and `npm run build`.
- Manually verify with `npm run dev` on a non-Wayland-specific environment:
  start Claude and Codex agent terminals, interrupt each with `Ctrl+C`, switch
  between workspaces with different terminal layouts, and change views. The
  output must be preserved. Yira must add no terminal text. The visible grid
  must remain aligned without using a view change as a repair action.
