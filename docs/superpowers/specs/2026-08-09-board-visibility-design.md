# Persisted board visibility

## Goal

Let a user hide the workspace board from the view selector without disabling the board, changing its MCP setup, or changing any board tasks. The choice must survive application restarts and remain in effect until the user explicitly opens the board again.

## Behavior

- The board header has a close control.
- Closing the board switches to the workspace's standard non-board view: `fullview` for canvas workspaces and `gridview` for grid workspaces.
- Closing records that the board is hidden for the active workspace. The Board button is removed from the top view selector.
- The board remains enabled and its persisted board data is unchanged.
- The Board action in the tile-creation selector remains available. When the board is hidden, activating it reveals the board instead of creating a task. When visible and enabled, it retains its current New Task behavior. When disabled, it retains its current enable-and-open behavior.
- Opening the board clears the hidden state so the Board button returns to the top view selector.

## Data model and persistence

Add a boolean presentation field to both persisted workspace layout types. It is normalized to visible by default so existing workspaces and malformed data continue to show an enabled board. The field belongs to canvas/grid workspace state, not to `BoardState`, workspace configuration, board storage, or MCP configuration.

Snapshot, restore, and workspace-type conversion paths preserve the field. View-mode guards treat a hidden board as unavailable and fall back to the workspace's regular view if stale saved state requests `board`.

## UI components

- `BoardView` receives an `onClose` callback and renders an accessible close button in its header.
- `TopBar` receives board visibility rather than inferring selector presence solely from board enablement.
- `App` owns the close/reopen callbacks and changes the tile-creation Board action according to the visibility state.

## Validation

- Add focused tests for state normalization/conversion: missing visibility defaults to visible and an explicit hidden value is retained.
- Add a selector-action test confirming that a hidden, enabled board opens the board rather than creating a task.
- Run the affected tests, the full test suite, and `npx tsc --noEmit`.
