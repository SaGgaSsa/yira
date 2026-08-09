# Persisted Board Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users close a workspace board so it is persistently removed from the top view selector until they explicitly open it again, without changing board/MCP data.

**Architecture:** Store `boardVisible` as workspace presentation state in both canvas and grid layout payloads. The Zustand store exposes it with the current workspace state and snapshots persist it; the App uses it to gate board navigation and display. The creation selector remains the recovery path: an enabled but hidden board opens there rather than creating a task.

**Tech Stack:** TypeScript, React 19, Zustand, Electron IPC persistence, Node test runner with `tsx`, Lucide React, i18next.

## Global Constraints

- Do not modify `BoardState`, board storage, MCP configuration, IPC board handlers, or board task data.
- Existing workspace layouts lacking `boardVisible` must normalize to `true`.
- The close action must persist per workspace and choose `fullview` for canvas or `gridview` for grid workspaces.
- The Board action must re-open a hidden enabled board; it must not create a task in that case.
- Follow the repository TypeScript style: 2 spaces, single quotes, no semicolons.

---

### Task 1: Persist board presentation state across workspace layouts

**Files:**
- Modify: `src/shared/types.ts:599-655`
- Modify: `src/shared/gridWorkspaceState.ts:405-441`
- Modify: `src/shared/workspaceTypeSwitch.ts:115-200`
- Modify: `src/renderer/src/store/canvasStore.ts:300-360, 362-410, 829-890`
- Modify: `src/renderer/src/App.tsx:88-124, 465-488`
- Test: `src/shared/gridWorkspaceState.test.ts`
- Test: `src/shared/workspaceTypeSwitch.test.ts`

**Interfaces:**
- Produces `CanvasState.boardVisible: boolean` and `GridWorkspaceState.boardVisible: boolean`.
- Produces `CanvasStore.boardVisible: boolean` and `CanvasStore.setBoardVisible(visible: boolean): void`.
- `createCanvasSnapshot` and `createGridSnapshot` include `boardVisible` so the existing save path persists it.

- [ ] **Step 1: Write failing normalization and conversion tests**

Append assertions that prove a new grid state is visible by default, malformed/legacy grid data without the field normalizes to visible, and an explicit `false` is retained. Add canvas-to-grid and grid-to-canvas reconciliation inputs with `boardVisible: false`, then assert the resulting state remains hidden.

```ts
const hiddenGrid = normalizeGridWorkspaceState({
  ...createEmptyGridWorkspaceState(),
  boardVisible: false,
})
if (hiddenGrid.boardVisible !== false) {
  throw new Error('grid normalization must retain an explicitly hidden board')
}

const legacyGrid = normalizeGridWorkspaceState({
  ...createEmptyGridWorkspaceState(),
  boardVisible: undefined as unknown as boolean,
})
if (legacyGrid.boardVisible !== true) {
  throw new Error('legacy grid layouts must default board visibility to true')
}
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx tsx --test src/shared/gridWorkspaceState.test.ts src/shared/workspaceTypeSwitch.test.ts`

Expected: FAIL because `boardVisible` does not yet exist on the persisted layout types or is not retained by normalization/conversion.

- [ ] **Step 3: Add the state field and minimal persistence plumbing**

Add `boardVisible` to `CanvasState`, `GridWorkspaceState`, and the Zustand state/action interface. Initialize it to `true` in new canvas/grid layouts; normalize it with `state.boardVisible !== false` so only an explicit boolean `false` hides it. Include it in grid/canvas type-switch creation and reconciliation. Add the store action, restore it from either persisted state, and include it in both App snapshot source picks and returned snapshots.

```ts
boardVisible: state.boardVisible !== false,
setBoardVisible: (boardVisible) => set({ boardVisible }),
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx tsx --test src/shared/gridWorkspaceState.test.ts src/shared/workspaceTypeSwitch.test.ts`

Expected: PASS with all grid/workspace-type state assertions passing.

- [ ] **Step 5: Commit the state layer**

```bash
git add src/shared/types.ts src/shared/gridWorkspaceState.ts src/shared/workspaceTypeSwitch.ts src/shared/gridWorkspaceState.test.ts src/shared/workspaceTypeSwitch.test.ts src/renderer/src/store/canvasStore.ts src/renderer/src/App.tsx
git commit -m "feat: persist board visibility"
```

### Task 2: Add close/reopen interactions and selector behavior

**Files:**
- Modify: `src/renderer/src/components/BoardView.tsx:1-175`
- Modify: `src/renderer/src/components/TopBar.tsx:1-152`
- Modify: `src/renderer/src/components/TileCreationSelector.tsx:4-100`
- Modify: `src/renderer/src/components/TileCreationSelector.test.ts`
- Modify: `src/renderer/src/App.tsx:305-321, 1108-1172, 1580-1610, 1885-1930, 2177-2195`
- Modify: `src/renderer/src/i18n/resources.ts:274-282, 571-579, 868-876`
- Test: `src/renderer/src/components/TileCreationSelector.test.ts`

**Interfaces:**
- `BoardViewProps` gains `onClose: () => void`.
- `TopBarProps` gains `boardVisible: boolean`; its board segment renders only when `boardEnabled && boardVisible`.
- `TileCreationSelectorProps` gains `boardVisible: boolean` and `onOpenBoard: () => void`; `getTileCreationActions` calls `onOpenBoard` for an enabled hidden board, and keeps `onCreateBoard` for all other board states.
- `App` calls `setBoardVisible(false)` on close, `setBoardVisible(true)` before any successful board open, and only renders BoardView when the board is enabled and visible.

- [ ] **Step 1: Write the failing selector behavior test**

Extend the existing selector test with two counters. Request actions for `{ boardEnabled: true, boardVisible: false }`, invoke the Board action, and assert it calls only `onOpenBoard`. Also assert its accessible title is the translated `Open board` copy rather than `New task`.

```ts
let openedBoard = 0
let createdTask = 0
const hiddenBoard = getTileCreationActions({
  canCreateNote: false,
  canCreateBrowser: false,
  canCreateTimer: false,
  boardEnabled: true,
  boardVisible: false,
  onOpenBoard: () => { openedBoard += 1 },
  onCreateBoard: () => { createdTask += 1 },
})
hiddenBoard.find(({ id }) => id === 'board')?.onClick()
if (openedBoard !== 1 || createdTask !== 0) {
  throw new Error('a hidden enabled board action must reopen the board without creating a task')
}
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx tsx --test src/renderer/src/components/TileCreationSelector.test.ts`

Expected: FAIL because the selector has no visibility/reopen contract.

- [ ] **Step 3: Implement the smallest UI change**

Import `X` in BoardView and add a labelled close button to its header that invokes `onClose`. Add `boardVisible` gating in TopBar and BoardView rendering. In App, select `boardVisible` and `setBoardVisible`; add `openBoard()` to set it true and enter `board` mode; add `closeBoard()` to set it false and select the type-appropriate normal view. Use `openBoard()` from top-bar navigation, first-time enablement, and `onOpenBoard`; retain `handleCreateBoardTask()` only for enabled visible boards. Add `board.open` and `board.close` translations in English and Spanish.

```ts
const closeBoard = useCallback(() => {
  setBoardVisible(false)
  setViewMode(activeWorkspaceType === 'grid' ? 'gridview' : 'fullview')
}, [activeWorkspaceType, setBoardVisible, setViewMode])

const openBoard = useCallback(() => {
  setBoardVisible(true)
  setViewMode('board')
}, [setBoardVisible, setViewMode])
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx tsx --test src/renderer/src/components/TileCreationSelector.test.ts`

Expected: PASS; the hidden Board action opens the board and does not create a task.

- [ ] **Step 5: Compile and run the complete automated suite**

Run: `npx tsc --noEmit && npm test`

Expected: both commands exit 0.

- [ ] **Step 6: Manually verify the persisted workflow**

Run: `npm run dev`

Verify in both a canvas and a grid workspace: enable/open Board, close it, confirm it disappears from the top selector, restart the app, confirm it remains absent, use the sidebar Board action to reopen it, and confirm no task is created solely by reopening. Confirm existing board tasks and MCP command are unchanged.

- [ ] **Step 7: Commit the UI layer**

```bash
git add src/renderer/src/components/BoardView.tsx src/renderer/src/components/TopBar.tsx src/renderer/src/components/TileCreationSelector.tsx src/renderer/src/components/TileCreationSelector.test.ts src/renderer/src/App.tsx src/renderer/src/i18n/resources.ts
git commit -m "feat: allow hiding workspace boards"
```
