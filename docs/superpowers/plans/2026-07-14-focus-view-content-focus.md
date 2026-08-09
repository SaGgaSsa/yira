# Focus View Content Focus Implementation Plan

> **For agentic workers:** Implement this plan task by task under the repository's **Plan Implementation and Luna Delegation** rules in `AGENTS.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Focus each tile's primary interactive surface whenever it becomes the visible active tile in Focus View.

**Architecture:** A pure renderer utility identifies the one tile eligible for automatic focus. `Canvas` passes that boolean through `TileContent`; each tile component performs its own safe DOM focus operation. This avoids Electron IPC and prevents hidden tiles from taking focus.

**Tech Stack:** React 19, TypeScript, xterm.js, BlockNote, Electron webview.

## Global Constraints

- Keep all behaviour in the renderer process; do not add main-process IPC.
- Preserve the existing 2-space, semicolon-free TypeScript style.
- Focus only the visible `fullviewActiveTileId` while `viewMode === 'fullview'`.
- Terminal, note, browser, and files tiles must use their respective primary input; timer tiles remain unchanged.
- Use `npx tsc --noEmit` for type validation; this checkout is native Linux, so `npm run build` is also permitted for final validation.

---

### Task 1: Model Focus View eligibility

**Files:**
- Create: `src/renderer/src/utils/focusView.ts`
- Create: `src/renderer/src/utils/focusView.test.ts`
- Modify: `src/renderer/src/components/Canvas.tsx`

**Interfaces:**
- Produces: `shouldAutoFocusTile(viewMode: ViewMode, tileId: string, fullviewActiveTileId: string | null, isVisible: boolean): boolean`.
- Consumes: `ViewMode`, the current tile ID, `fullviewActiveTileId`, and Canvas' existing hidden-tile calculation.

- [ ] **Step 1: Write the failing utility test**

```ts
import { shouldAutoFocusTile } from './focusView'

if (!shouldAutoFocusTile('fullview', 'active', 'active', true)) {
  throw new Error('visible active Focus View tile must request autofocus')
}
if (shouldAutoFocusTile('canvas', 'active', 'active', true)) {
  throw new Error('canvas tiles must not request autofocus')
}
if (shouldAutoFocusTile('fullview', 'hidden', 'active', false)) {
  throw new Error('hidden Focus View tiles must not request autofocus')
}
```

- [ ] **Step 2: Compile the test to confirm it fails**

Run: `npx tsc --noEmit`

Expected: failure because `focusView.ts` does not yet exist.

- [ ] **Step 3: Implement the utility and forward its result from Canvas**

```ts
export function shouldAutoFocusTile(
  viewMode: ViewMode,
  tileId: string,
  fullviewActiveTileId: string | null,
  isVisible: boolean,
): boolean {
  return viewMode === 'fullview' && isVisible && tileId === fullviewActiveTileId
}
```

In `Canvas.tsx`, import the utility and pass `autoFocus={shouldAutoFocusTile(viewMode, tile.id, fullviewActiveTileId, !hiddenInFixedView)}` to `TileContent`.

- [ ] **Step 4: Compile the focused test**

Run: `npx tsc --noEmit`

Expected: exit status 0.

### Task 2: Add the shared autofocus contract and tile implementations

**Files:**
- Modify: `src/renderer/src/components/TileContent.tsx`
- Modify: `src/renderer/src/components/TerminalTile.tsx`
- Modify: `src/renderer/src/components/NoteTile.tsx`
- Modify: `src/renderer/src/components/BrowserTile.tsx`
- Modify: `src/renderer/src/components/FilesTile.tsx`

**Interfaces:**
- Consumes: `autoFocus: boolean` from `TileContent`.
- Produces: idempotent per-tile focus effects that run when `autoFocus` changes to `true`.

- [ ] **Step 1: Extend `TileContentProps`**

Add `autoFocus?: boolean`, default it to `false`, and pass it only to terminal, note, browser, and files children. Leave `TimerTile` unchanged.

- [ ] **Step 2: Implement component-local focus effects**

```ts
useEffect(() => {
  if (autoFocus) primaryInputRef.current?.focus()
}, [autoFocus])
```

Use the existing xterm `termRef` for terminals. In rich notes call `editor.prosemirrorView.focus()` inside `RichNoteEditor`; for Markdown notes add a wrapper ref and focus its `textarea`. In browsers call `webviewRef.current?.focus()`. In Files add a ref to the existing `Filter folder` input and focus it. Each effect must guard the missing target and must not call `onFocus`, avoiding Canvas state changes or loops.

- [ ] **Step 3: Type-check the renderer contracts**

Run: `npx tsc --noEmit`

Expected: exit status 0.

### Task 3: Validate Focus View integration

**Files:**
- Modify: `docs/superpowers/specs/2026-07-14-focus-view-content-focus-design.md` only if implementation reveals a design discrepancy.

**Interfaces:**
- Consumes: the completed autofocus flow from Tasks 1–2.
- Produces: verified Focus View behaviour without changes to main-process APIs.

- [ ] **Step 1: Run all relevant static checks**

Run: `npx tsc --noEmit && npm run build`

Expected: each command exits with status 0.

- [ ] **Step 2: Manually verify in `npm run dev`**

Confirm that opening Focus View gives immediate keyboard input to a terminal, rich note, Markdown note, browser page, and Files filter; switch active Focus View tiles and confirm only the newly visible tile receives focus. Confirm timer tiles do not steal focus.
