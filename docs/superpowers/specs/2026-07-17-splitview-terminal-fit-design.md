# Split View Terminal Fit Design

## Goal

Keep xterm's rendered grid and the terminal PTY dimensions synchronized after a
terminal enters or resizes within vertical Split View. This prevents TUI input
areas and wrapped text from being drawn at stale full-width dimensions.

## Scope

- Apply only to terminal fitting in `TerminalTile`.
- Cover the width change caused by entering vertical Split View or switching its
  active terminal.
- Preserve the existing single resize notification for unchanged terminal
  dimensions.
- Do not recreate terminals, alter their sessions, or change Codex behavior.

## Architecture

`TerminalTile` already observes the terminal content container and delegates
fits to `createTerminalFitScheduler`. The scheduler will perform the requested
fit on the next animation frame, then schedule one final fit on the following
frame. The latter runs after the browser has settled the vertical split's
percentage-based column geometry.

Each fit calculates the dimensions from the current container. The scheduler
continues to compare them against the last dimensions sent to the PTY, so the
stabilization fit is a no-op when the first measurement was already final.

## Error Handling

Existing containment remains in place: a failed xterm fit or unavailable
dimensions does not escape to the renderer. Cancelling a pending fit cancels
both scheduled frames.

## Verification

- Extend the terminal fit scheduler test to prove a resize request executes a
  stabilization fit on the following animation frame.
- Prove that unchanged final dimensions do not trigger a second PTY resize.
- Run the focused scheduler test and `npx tsc --noEmit`.
- Manually verify a Codex terminal in vertical Split View: the prompt and text
  layout remain aligned after entering Split View, switching terminal tabs, and
  resizing the application window.
