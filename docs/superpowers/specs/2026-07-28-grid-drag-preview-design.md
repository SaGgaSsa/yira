# Grid drag preview stability

## Objective

Make the grid workspace tile drag-and-drop interaction stable and predictable. Hovering a tile must never cause tiles to move before release, and hovering an adjacent tile must not make the drop preview flicker or jump.

The interaction will preserve Wave Terminal's layout semantics:

- Drop in the center of another tile to swap the two tiles.
- Drop on an inner edge to insert beside that tile, splitting in the corresponding direction.
- Drop on an outer edge to insert at the corresponding outer position when the layout tree permits it.
- Commit the selected operation only when the pointer is released over the grid.

## Root cause

`GridView` currently derives `displayRootNode` by applying the pending drag action to the persisted `rootNode`. It then obtains the next drop target with `document.elementFromPoint` from this projected layout. The preview therefore changes the geometry and identity of the element used to calculate the next preview. Moving across a target can repeatedly select a different target/action, producing the observed self-moving tiles and flicker.

## Reference pattern

Wave Terminal separates its tiling control into three layers:

1. A display layer renders the committed layout tree.
2. A geometrically equivalent overlay owns the drop targets.
3. A pointer-events-free placeholder visualizes the pending operation.

The layout tree remains unchanged while dragging. Wave computes a pending move from the stable overlay and commits that pending action only on drop. Yira will use that model with its existing Pointer Events implementation rather than introducing React DnD.

## Architecture

### Stable drag state

`GridView` will hold a transient drag state containing the source tile ID, latest pointer position, the pending `GridDragAction`, and the stable target rectangle/metadata required for preview rendering. This state never writes the workspace layout.

Pointer movement is throttled to the interaction rate used by Wave (about 50 ms) and only updates React state if the computed action or preview geometry changes. Leaving the grid, targeting the source tile, or calculating a no-op clears the pending action and preview.

### Independent drop-target overlay

During a drag, `GridView` will render an absolute overlay that recursively mirrors the *committed* grid tree. Each leaf is a drop target identified by tile ID. It contains no tile content and has the same flex sizing, split direction, gaps, and bounds as the display layer.

Target selection uses this overlay, so a pending action cannot alter the target geometry underneath the pointer. The display layer always renders `rootNode`; the dragged tile remains in its committed position with a lightweight dragging affordance.

### Placeholder preview

A pointer-events-free absolute placeholder will be rendered above the display layer and below the drop-target overlay. Its rectangle is derived from the stable target's bounds and the pending action:

- `swap`: cover the target tile.
- side and outer-edge moves: show the prospective half/edge region in the matching direction.
- `none`: render nothing.

The placeholder gives immediate feedback but does not replace tile content or trigger tree reconciliation. It may animate between valid preview rectangles, but its geometry is always based on the committed layout.

### Commit and cancellation

On pointer release inside the grid, commit the last non-no-op action against the unchanged `rootNode` using `commitGridDragAction`. Pointer cancellation, leaving the grid, and release outside it discard transient state without layout changes. Resize handling remains mutually exclusive with move dragging.

## Scope

The existing pure grid tree operations (`computeGridDragAction` and `commitGridDragAction`) and their center/inner/outer directions remain the source of truth. The change is limited to grid drag sensing and preview rendering, plus small pure helper(s) when necessary to calculate preview rectangles.

No new drag-and-drop package will be added, no persisted workspace format will change, and non-grid canvas behavior is out of scope.

## Tests and verification

Add focused regression tests for:

- pending drag preview not applying `commitGridDragAction` to the displayed layout;
- stable target/action selection while a valid preview is present;
- center swap preview and directional/outer-edge preview geometry;
- no-op, source hover, exit, and cancel clearing the preview without changing the tree;
- release committing exactly the final pending action.

Run the project type check and relevant test files. On native Linux, also run the project build and manually verify `npm run dev` with center swap, all four inner edges, all four outer edges, exit/cancel, and resizing after a drag.
