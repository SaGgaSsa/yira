# Native Attention Deduplication Design

## Goal

Show one native window-attention request for a continuous episode of unattended tile activity, while retaining the existing fixed 10-second delay.

## Current behavior

Terminal and timer tiles delay their native request independently. Once a delayed request fires, later terminal-output bursts can schedule another request. The native attention target is the Electron window, so per-tile deduplication does not define the correct boundary.

## Decision

Make `notifications:requestAttention` idempotent per `BrowserWindow` in the main process. The first eligible request flashes the window and marks that window as awaiting attention. Further eligible requests return without flashing again. A window `focus` event and explicit `clearAttention` both clear the mark, allowing a future unattended episode to notify again.

The renderer delay remains unchanged: a tile's first eligible event waits 10 seconds, later events while the timer is pending are grouped, and visual Terminal Attention badges continue to track output separately.

## Scope

Change only the native attention IPC path and its shared result contract. No new setting, duration, tile state, or badge behavior is introduced.

## Verification

Add a main-process unit test with a fake window to prove repeated requests flash once, focus re-arms attention, and explicit clearing re-arms attention. Run the focused tests and `npx tsc --noEmit`.
