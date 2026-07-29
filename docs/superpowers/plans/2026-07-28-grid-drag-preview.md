# Grid Drag Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make grid tile drag-and-drop use Wave-style stable drop targets and a non-mutating preview, eliminating tile movement and preview flicker before release.

**Architecture:** Keep `rootNode` as the sole displayed layout during a drag. `GridView` will mirror that committed tree in an absolute drop-target overlay, compute the existing shared `PendingGridDragAction` against those fixed targets, and render a separate pointer-events-free placeholder. On release it will commit the final action once with `commitGridDragAction`; all other drag updates stay local to the component.

**Tech Stack:** React 19 Pointer Events, TypeScript 5.7, Tailwind CSS, existing shared grid layout operations, colocated TypeScript script tests.

## Global Constraints

- Preserve Wave-style center swap plus inner and outer top/right/bottom/left insertion semantics already defined by `computeGridDragAction`.
- Do not add React DnD or any other runtime dependency.
- Do not mutate or persist `rootNode` during pointer movement; commit only on a valid pointer release inside the grid.
- Use a fixed overlay derived from the committed layout for hit testing and a pointer-events-free placeholder for feedback.
- Leave canvas workspaces, persisted workspace schema, tile content, and resize semantics unchanged.
- Use test-first changes and run `npx --no-install tsx` for focused script tests, `npx tsc --noEmit`, `npm run build`, and native-Linux manual verification.
- Do not create a Git commit unless the user explicitly asks for one.

---

## File Structure

- `src/renderer/src/utils/gridDragPreview.ts` — pure, DOM-free calculation of stable preview rectangles, pending-action equality, and preview resolution from a fixed target.
- `src/renderer/src/utils/gridDragPreview.test.ts` — direct behavioral regressions for center, inner-edge, outer-edge, no-op, equality, and repeated fixed-target resolution.
- `src/renderer/src/components/GridView.tsx` — committed display tree, drag-only overlay, placeholder, throttled transient drag state, and one-time release commit.
- `src/shared/gridWorkspaceState.test.ts` — preserve the pre-existing shared tree behavior for all four outer directions that the UI exposes.

### Task 1: Lock down Wave-compatible grid operations

**Files:**
- Modify: `src/shared/gridWorkspaceState.test.ts:183-205`

**Interfaces:**
- Consumes: `computeGridDragAction(rootNode, sourceTileId, targetTileId, targetRect, pointer)` and `commitGridDragAction(rootNode, action)`.
- Produces: regression coverage that `outer-top`, `outer-right`, `outer-bottom`, and `outer-left` are legal stable actions with their established tree placement semantics.

- [ ] **Step 1: Add outer-direction assertions before touching the renderer**

  Immediately after the existing `outerLeft` assertion, add equivalent checks for the remaining three outer directions using `dragRoot`, `dropRect`, and the pointer coordinates already implied by the one-fifth edge zones:

  ```ts
  const outerTopAction = computeGridDragAction(dragRoot, 'd', 'a', dropRect, { x: 350, y: 210 })
  if (outerTopAction.type !== 'move' || outerTopAction.direction !== 'outer-top') {
    throw new Error('outer-top must remain available as a move action')
  }
  const outerTop = commitGridDragAction(dragRoot, outerTopAction)
  const outerTopFirstChild = outerTop?.type === 'split' ? outerTop.children[0] : null
  if (outerTopFirstChild?.type !== 'split' || outerTopFirstChild.direction !== 'column') {
    throw new Error('outer-top must place the source in a vertical split before the target')
  }

  const outerLeftAction = computeGridDragAction(dragRoot, 'd', 'c', dropRect, { x: 110, y: 350 })
  const outerRight = computeGridDragAction(dragRoot, 'a', 'c', dropRect, { x: 590, y: 350 })
  const outerBottom = computeGridDragAction(dragRoot, 'a', 'c', dropRect, { x: 350, y: 490 })
  if (outerLeftAction.type !== 'move' || outerLeftAction.direction !== 'outer-left') {
    throw new Error('outer-left must remain available as a move action')
  }
  if (outerRight.type !== 'move' || outerRight.direction !== 'outer-right') {
    throw new Error('outer-right must remain available as a move action')
  }
  if (outerBottom.type !== 'move' || outerBottom.direction !== 'outer-bottom') {
    throw new Error('outer-bottom must remain available as a move action')
  }
  ```

  All four operation names are asserted explicitly rather than relying on a tree snapshot alone.

- [ ] **Step 2: Run the shared grid regression test**

  Run:

  ```bash
  npx --no-install tsx src/shared/gridWorkspaceState.test.ts
  ```

  Expected: exit code 0. These checks document existing shared behavior; a failure means the renderer must not be changed until the tree behavior is understood.

- [ ] **Step 3: Commit the test-only contract if commits are authorized**

  ```bash
  git add src/shared/gridWorkspaceState.test.ts
  git commit -m "test: cover grid outer drop directions"
  ```

  Skip this step unless the user has explicitly authorized a local commit.

### Task 2: Add a pure stable-placeholder geometry helper

**Files:**
- Create: `src/renderer/src/utils/gridDragPreview.ts`
- Create: `src/renderer/src/utils/gridDragPreview.test.ts`

**Interfaces:**
- Consumes: `PendingGridDragAction` and `GridDropRect` from `@shared/gridWorkspaceState`.
- Produces: `GridPreviewRect`, `getGridDragPreviewRect(action, targetRect)`, and `samePendingGridDragAction(first, second)` for use by `GridView`.

- [ ] **Step 1: Write the failing preview geometry test**

  Create `gridDragPreview.test.ts` with a `targetRect` of `{ left: 100, top: 200, width: 400, height: 300 }`. Import the yet-to-be-created helper and assert the following public behavior:

  ```ts
  import { getGridDragPreviewRect, samePendingGridDragAction } from './gridDragPreview'

  const targetRect = { left: 100, top: 200, width: 400, height: 300 }
  const swap = getGridDragPreviewRect({ type: 'swap', sourceTileId: 'a', targetTileId: 'b' }, targetRect)
  if (JSON.stringify(swap) !== JSON.stringify(targetRect)) throw new Error('swap preview must cover the fixed target')

  const left = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'left' }, targetRect)
  if (!left || left.left !== 100 || left.top !== 200 || left.width !== 200 || left.height !== 300) {
    throw new Error('left preview must occupy the target’s stable left half')
  }

  const bottom = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'outer-bottom' }, targetRect)
  if (!bottom || bottom.left !== 100 || bottom.top !== 350 || bottom.width !== 400 || bottom.height !== 150) {
    throw new Error('outer-bottom preview must occupy the target’s stable bottom half')
  }

  if (getGridDragPreviewRect({ type: 'none' }, targetRect) !== null) throw new Error('no action must have no preview')
  if (!samePendingGridDragAction({ type: 'none' }, { type: 'none' })) throw new Error('equal no-op actions must be deduplicated')
  if (samePendingGridDragAction({ type: 'swap', sourceTileId: 'a', targetTileId: 'b' }, { type: 'swap', sourceTileId: 'a', targetTileId: 'c' })) {
    throw new Error('different targets must not be deduplicated')
  }
  ```

  Add these remaining directional assertions so every direction maps to the correct fixed half of `targetRect`:

  ```ts
  const right = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'right' }, targetRect)
  const top = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'top' }, targetRect)
  const outerLeft = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'outer-left' }, targetRect)
  const outerRight = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'outer-right' }, targetRect)
  const outerTop = getGridDragPreviewRect({ type: 'move', sourceTileId: 'a', targetTileId: 'b', direction: 'outer-top' }, targetRect)
  if (!right || right.left !== 300 || right.width !== 200) throw new Error('right preview must occupy the right half')
  if (!top || top.top !== 200 || top.height !== 150) throw new Error('top preview must occupy the top half')
  if (!outerLeft || outerLeft.left !== 100 || outerLeft.width !== 200) throw new Error('outer-left preview must occupy the left half')
  if (!outerRight || outerRight.left !== 300 || outerRight.width !== 200) throw new Error('outer-right preview must occupy the right half')
  if (!outerTop || outerTop.top !== 200 || outerTop.height !== 150) throw new Error('outer-top preview must occupy the top half')
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```bash
  npx --no-install tsx src/renderer/src/utils/gridDragPreview.test.ts
  ```

  Expected: failure because `./gridDragPreview` does not exist.

- [ ] **Step 3: Implement the smallest pure helper**

  Create `gridDragPreview.ts` with this implementation:

  ```ts
  import type { GridDropRect, PendingGridDragAction } from '@shared/gridWorkspaceState'

  export interface GridPreviewRect extends GridDropRect {}

  export function getGridDragPreviewRect(
    action: PendingGridDragAction,
    targetRect: GridDropRect | null,
  ): GridPreviewRect | null {
    if (!targetRect || action.type === 'none') return null
    if (action.type === 'swap') return targetRect

    const { left, top, width, height } = targetRect
    if (action.direction === 'left' || action.direction === 'outer-left') {
      return { left, top, width: width / 2, height }
    }
    if (action.direction === 'right' || action.direction === 'outer-right') {
      return { left: left + width / 2, top, width: width / 2, height }
    }
    if (action.direction === 'top' || action.direction === 'outer-top') {
      return { left, top, width, height: height / 2 }
    }
    return { left, top: top + height / 2, width, height: height / 2 }
  }

  export function samePendingGridDragAction(
    first: PendingGridDragAction,
    second: PendingGridDragAction,
  ): boolean {
    if (first.type !== second.type) return false
    if (first.type === 'none' || second.type === 'none') return true
    if (first.type === 'swap' && second.type === 'swap') {
      return first.sourceTileId === second.sourceTileId && first.targetTileId === second.targetTileId
    }
    return first.type === 'move' && second.type === 'move'
      && first.sourceTileId === second.sourceTileId
      && first.targetTileId === second.targetTileId
      && first.direction === second.direction
  }
  ```

  Use only arithmetic on `GridDropRect`; do not read the DOM or call `commitGridDragAction`. The same visual rule for inner and outer directions is intentional: both show the stable target edge that will receive the dragged tile.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run:

  ```bash
  npx --no-install tsx src/renderer/src/utils/gridDragPreview.test.ts
  ```

  Expected: exit code 0, including all eight directional preview assertions.

- [ ] **Step 5: Commit the isolated helper if commits are authorized**

  ```bash
  git add src/renderer/src/utils/gridDragPreview.ts src/renderer/src/utils/gridDragPreview.test.ts
  git commit -m "feat: add stable grid drag preview geometry"
  ```

  Skip this step unless the user has explicitly authorized a local commit.

### Task 3: Add behavioral coverage for fixed-target drag resolution

**Files:**
- Modify: `src/renderer/src/utils/gridDragPreview.ts`
- Modify: `src/renderer/src/utils/gridDragPreview.test.ts`
- Delete: `src/renderer/src/components/GridView.drag.test.ts`

**Interfaces:**
- Consumes: the committed `GridLayoutNode`, source and target IDs, a stable `GridDropRect`, and pointer coordinates.
- Produces: a `resolveGridDragPreview` result that derives a pending action and placeholder strictly from the committed tree and one fixed target, with no DOM reads or layout mutation.

- [ ] **Step 1: Write the failing fixed-target behavior test**

  Extend `gridDragPreview.test.ts` to import `resolveGridDragPreview` and use a small committed tree plus one fixed `targetRect`. Assert all of the following behavior:

  - resolving the same source, target, rectangle, and pointer twice yields an equal non-`none` action and an equal preview rectangle;
  - moving the pointer from target center to its left edge changes only the resolved action/preview, never the input tree;
  - a source target, missing target, or missing rectangle resolves to `{ pendingAction: { type: 'none' }, targetRect: null }`;
  - `commitGridDragAction` is not called by the helper (the test validates it by comparing the original root to a saved JSON snapshot after every resolution).

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```bash
  npx --no-install tsx src/renderer/src/utils/gridDragPreview.test.ts
  ```

  Expected: failure because `resolveGridDragPreview` does not exist yet.

- [ ] **Step 3: Implement the smallest pure resolver**

  Add and export:

  ```ts
  export interface GridDragPreviewState {
    pendingAction: PendingGridDragAction
    targetRect: GridDropRect | null
  }

  export function resolveGridDragPreview(
    rootNode: GridLayoutNode | null,
    sourceTileId: string,
    targetTileId: string | null | undefined,
    targetRect: GridDropRect | null | undefined,
    pointer: GridPointerPosition | null | undefined,
  ): GridDragPreviewState
  ```

  It must return the no-op state when any required input is absent, when the target is the source, or when `computeGridDragAction` returns `none`. Otherwise it returns the exact action from `computeGridDragAction` together with the supplied target rectangle. It must be a pure wrapper: no DOM access, state updates, or `commitGridDragAction` call.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run:

  ```bash
  npx --no-install tsx src/renderer/src/utils/gridDragPreview.test.ts
  ```

  Expected: exit code 0. This replaces the obsolete source-text `GridView.drag.test.ts` with a logic test that can catch unstable drag-resolution behavior.

- [ ] **Step 5: Remove the obsolete source-text test**

  Delete `src/renderer/src/components/GridView.drag.test.ts`; its text search is not a behavioral regression test and is superseded by the pure resolver coverage.

### Task 4: Port the Wave-style stable overlay into `GridView`

**Files:**
- Modify: `src/renderer/src/components/GridView.tsx:1-337`

**Interfaces:**
- Consumes: `getGridDragPreviewRect`, `resolveGridDragPreview`, `samePendingGridDragAction`, and `commitGridDragAction`.
- Produces: a display that always renders `rootNode`, `renderDropTargetNode(node)` for drag-only hit targets, and a final `onSetRootNode(commitGridDragAction(...))` only in the pointer-release path.

- [ ] **Step 1: Import the pure helper and reshape transient drag state**

  Import the Task 2 functions. Replace `MoveDragState` with a state that includes `targetRect: GridDropRect | null` in addition to source ID, pointer coordinates, and pending action. Remove `displayRootNode` entirely.

  Retain `rootNodeRef` as the committed-tree reference. Add a `lastMoveUpdateRef` containing the last update timestamp and last action/target rectangle so pointer movement can be limited to one state update per 50 ms unless the action or rectangle changes.

- [ ] **Step 2: Render the committed display tree unchanged during a drag**

  Keep the existing recursive `renderNode` for the tile-content display layer, but always call it as `renderNode(rootNode)`. Replace `isDragPlaceholder` content replacement with a dragging affordance that does not alter the leaf’s dimensions or remove `TileContent`; for example, retain the cyan border and add a low-opacity/blur class only while `draggedTileId === tile.id`.

  The drag ghost remains fixed-position and `pointer-events-none`, following `moveDrag.pointerX` and `moveDrag.pointerY`.

- [ ] **Step 3: Add the stable drop-target overlay and placeholder**

  Add a recursive `renderDropTargetNode(node)` next to `renderNode`. For a leaf, render only:

  ```tsx
  <div
    key={node.id}
    data-grid-drop-target-id={node.tileId}
    className="h-full min-h-[180px] w-full min-w-[260px]"
  />
  ```

  For a split, copy the committed display’s `flexDirection`, `flex` child sizes, and 0.5rem-equivalent spacing while omitting resize handles. Render it only while a move is active in an absolute, full-size, transparent layer above the display and below the ghost.

  Derive `previewRect` with `getGridDragPreviewRect(moveDrag.pendingAction, moveDrag.targetRect)`. Convert its viewport coordinates into container-relative `left` and `top` values using `containerRef.current?.getBoundingClientRect()`. Render it as an `absolute pointer-events-none` cyan dashed rectangle only when the helper returns a rectangle. Give it a short `transition-[transform,width,height]` so valid target changes feel deliberate without altering hit testing.

- [ ] **Step 4: Compute actions exclusively from the stable overlay**

  In `updateMoveDrag`, use `document.elementFromPoint` and `closest('[data-grid-drop-target-id]')`. Read `dataset.gridDropTargetId`, then its `getBoundingClientRect()`. Never query `[data-grid-tile-id]`, because those are content nodes and may change styling during the drag.

  Call `resolveGridDragPreview(rootNodeRef.current, drag.sourceTileId, targetTileId, targetRect, pointer)` so this component never evaluates against a projected tree. When outside the container, on the source tile, or when the action is `none`, the resolver returns `targetRect: null`. If `samePendingGridDragAction(drag.pendingAction, nextAction)` and the rectangle has not changed, return without calling `setMoveDrag`. Otherwise, update both the ref and React state, subject to the 50 ms throttle.

- [ ] **Step 5: Commit or discard only at the drag terminal event**

  Keep the global `pointermove`, `pointerup`, and `pointercancel` listeners while `moveDrag` is active. On pointer up, call `updateMoveDrag(event)` first; if its last action is non-`none` and the pointer is still inside `containerRef`, call exactly:

  ```ts
  onSetRootNode(commitGridDragAction(rootNodeRef.current, drag.pendingAction))
  ```

  Then clear both refs and state. On `pointercancel`, outside release, source hover, or no-op, clear without calling `onSetRootNode`. Do not change the resize handlers except to continue excluding an active move drag.

- [ ] **Step 6: Run the behavioral preview test after integrating it**

  Run:

  ```bash
  npx --no-install tsx src/renderer/src/utils/gridDragPreview.test.ts
  ```

  Expected: exit code 0; the pure action and fixed-target preview behavior stays valid while `GridView` consumes it.

- [ ] **Step 7: Commit the renderer behavior if commits are authorized**

  ```bash
  git add src/renderer/src/components/GridView.tsx
  git commit -m "fix: stabilize grid tile drag preview"
  ```

  Skip this step unless the user has explicitly authorized a local commit.

### Task 5: Verify the behavior end to end

**Files:**
- Verify: `src/shared/gridWorkspaceState.test.ts`
- Verify: `src/renderer/src/utils/gridDragPreview.test.ts`
- Verify: `src/renderer/src/components/GridView.tsx`

**Interfaces:**
- Consumes: the pure helper, the shared layout operations, and the GridView overlay implementation from Tasks 1-4.
- Produces: fresh evidence that all script tests, strict typing, renderer build, and the original interaction work.

- [ ] **Step 1: Run the focused regression tests**

  ```bash
  npx --no-install tsx src/shared/gridWorkspaceState.test.ts
  npx --no-install tsx src/renderer/src/utils/gridDragPreview.test.ts
  ```

  Expected: all commands exit 0.

- [ ] **Step 2: Run strict TypeScript validation and the native Linux build**

  ```bash
  npx tsc --noEmit
  npm run build
  ```

  Expected: both commands exit 0 with no TypeScript diagnostics or bundling errors.

- [ ] **Step 3: Manually reproduce the original failure cases**

  Run:

  ```bash
  npm run dev
  ```

  In a grid workspace with at least four tiles, drag one tile slowly over another tile’s center, then each inner edge and each outer edge. The layout must remain stationary while only the cyan placeholder changes; the operation must commit once on release. Hover the source tile, leave the grid, release outside, and press Escape/cancel where supported; none may change the tree. Repeat after resizing a split to confirm the overlay still shares the committed geometry.

- [ ] **Step 4: Inspect change hygiene**

  ```bash
  git diff --check
  git status --short
  ```

  Expected: no whitespace errors and only intentional grid preview source, tests, spec, and plan files are present.

- [ ] **Step 5: Commit the complete change only if requested**

  If the user requests a local commit after reviewing the evidence, stage explicit source and test paths and use the subject:

  ```bash
  git add src/shared/gridWorkspaceState.test.ts src/renderer/src/utils/gridDragPreview.ts src/renderer/src/utils/gridDragPreview.test.ts src/renderer/src/components/GridView.tsx
  git commit -m "fix: stabilize grid tile drag preview"
  ```
