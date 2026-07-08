# Workspace Attention Badges Design

## Goal

Surface Terminal Attention at the workspace selector level, so output from the
current workspace remains visible even when the user switches away from that
workspace during the same session.

## Current behavior

Terminal Attention is tracked in renderer runtime state per terminal tile. The
sidebar and Focus/Split tabs can show per-tile counts, and the count clears only
when the real xterm input receives keyboard focus. Workspace selectors currently
list metadata only and do not show attention state.

## Decision

Track a session-only attention summary by `workspaceId` in the renderer. The
summary is updated only from the active workspace's existing `terminalAttention`
state. It is not persisted and it does not require loading canvas, grid, board,
or tile state for inactive workspaces.

Show the workspace summary as the same compact count used by tile badges:
`1` through `9`, capped at `9+`. Render it beside the active workspace name in
the selector button and beside each workspace row in the selector dropdown.

A workspace badge is not cleared by opening the selector or seeing the row. It
is cleared only when the user activates that workspace from the selector. Once
inside the workspace, per-tile Terminal Attention keeps the existing rule: clear
only when the user actually focuses the terminal input.

## Scope

Implement this only for activity generated while a workspace is active. Do not
observe terminals from inactive workspaces, do not request native window
attention for inactive workspace badges, and do not move Terminal Attention into
the main process.

Do not add extra automatic clearing rules for seeing the selector. The visible
workspace summary is consumed by activating that workspace, not by opening the
dropdown or hovering/focusing a row.

## Data flow

`App.tsx` derives the active workspace count from `terminalAttention` by summing
the active workspace's tile counts. It stores that total in a local
`workspaceAttentionCounts` map keyed by workspace id. Switching workspaces saves
the outgoing workspace count before loading the next workspace and clears the
selected workspace's summary as part of activation.

The workspace list remains metadata-only. `workspace:list` and
`workspace:getActive` continue to return workspace metadata without loading
workspace canvas state.

## Verification

Add focused renderer-side helper coverage for the workspace summary behavior:
updating the active workspace count, preserving inactive workspace counts while
viewed in the selector, clearing only the activated workspace, and capping
display at `9+`.

Run the focused helper test with `npx jiti`, then run `npx tsc --noEmit` and
`git diff --check`. Do not use `npm run build` from WSL.
