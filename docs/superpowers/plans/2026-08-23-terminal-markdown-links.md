# Terminal Markdown Links Implementation Plan

> **For agentic workers:** REQUIRED PROCESS: Follow the repository's Luna delegation rules. Implement each task with strict red-green-refactor TDD. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect Markdown paths in terminal output and open the referenced workspace file in a Markdown preview tile.

**Architecture:** A focused renderer utility detects and normalizes Markdown paths and exposes an xterm link provider. `TerminalTile` registers the provider and routes activation through the existing file-tile lifecycle, with a typed initial-view option that also crosses detached-window navigation.

**Tech Stack:** TypeScript 5.7, React 19, xterm.js 6, Electron 33, Node test scripts.

**Spec:** `docs/superpowers/specs/2026-08-23-terminal-markdown-links-design.md`

## Global Constraints

- Keep Node access disabled in the renderer.
- Reuse the existing `files.read` IPC and file-tile lifecycle.
- Do not add a dependency.
- Do not change HTTP or HTTPS link behavior.
- Do not enable local Markdown links for remote SSH terminals.
- Support only workspace-relative paths in this increment.
- Use 2-space indentation, single quotes, and no semicolons.
- Do not push, tag, create a PR, or merge a PR.
- Do not commit in the delegated worktree. The primary agent will integrate the reviewed diff into `main`.

---

### Task 1: Detect Markdown Paths and Provide xterm Links

**Files:**
- Create: `src/renderer/src/utils/terminalMarkdownLinks.ts`
- Create: `src/renderer/src/utils/terminalMarkdownLinks.test.ts`

**Interfaces:**
- Consumes: xterm `Terminal`, `ILink`, and `ILinkProvider` types.
- Produces: `findTerminalMarkdownLinks(text: string, baseDirectory?: string): TerminalMarkdownLinkMatch[]`.
- Produces: `createTerminalMarkdownLinkProvider(terminal, options): ILinkProvider`.
- `TerminalMarkdownLinkMatch` contains `text`, `relativePath`, `startIndex`, and `endIndex`. `endIndex` is exclusive.
- Provider options contain `baseDirectory`, `onActivate`, `onHover`, and `onLeave` callbacks.

- [ ] **Step 1: Write failing detector tests**

  Add literal cases for:

  ```ts
  const cases = [
    ['README.md', '', 'README.md'],
    ['./docs/Guide.MD', '', 'docs/Guide.MD'],
    ['see docs/guide.markdown:24:3 now', '', 'docs/guide.markdown'],
    ['open "My Docs/Guide.md"', '', 'My Docs/Guide.md'],
    ['README.md', 'packages/app', 'packages/app/README.md'],
    ['`README.md`', '', 'README.md'],
  ] as const
  ```

  Assert the exact detected text, normalized path, and exclusive string
  indexes. Include a backtick-wrapped path with a line suffix. Add separate
  assertions that reject `README.md.txt`, HTTP URLs,
  absolute paths, drive paths, UNC paths, control characters, and traversal
  above the workspace root.

- [ ] **Step 2: Run the detector test and verify RED**

  Run:

  ```bash
  npx tsx src/renderer/src/utils/terminalMarkdownLinks.test.ts
  ```

  Expected: failure because `terminalMarkdownLinks.ts` does not exist.

- [ ] **Step 3: Implement minimal candidate detection and normalization**

  Implement `findTerminalMarkdownLinks`. Detect quoted paths before unquoted
  paths. Remove line and column suffixes. Normalize separators and path
  segments. Reject unsafe and non-Markdown candidates. Prevent duplicate or
  overlapping matches. Keep the original matched text and exact string
  indexes for xterm range construction.

- [ ] **Step 4: Run the detector test and verify GREEN**

  Run:

  ```bash
  npx tsx src/renderer/src/utils/terminalMarkdownLinks.test.ts
  ```

  Expected: exit code 0.

- [ ] **Step 5: Write failing provider behavior tests**

  Build a small real-shape xterm buffer-line double. It must expose
  `translateToString`, `length`, and `getCell`. Test these behaviors:

  - A Markdown path after a wide Unicode cell gets the correct 1-based xterm
    range.
  - Left-button activation calls `onActivate` with the normalized relative
    path.
  - Right-button activation does not call `onActivate`.
  - Hover and leave call their callbacks with the normalized relative path.
  - A buffer row without a Markdown path returns an empty link array.

- [ ] **Step 6: Run the provider test and verify RED**

  Run:

  ```bash
  npx tsx src/renderer/src/utils/terminalMarkdownLinks.test.ts
  ```

  Expected: failure because the provider is not implemented.

- [ ] **Step 7: Implement the xterm provider**

  Read `terminal.buffer.active.getLine(bufferLineNumber - 1)`. Convert string
  indexes to cell columns by iterating xterm cells and respecting `getWidth()`
  and `getChars()`. Return `ILink` values with 1-based inclusive ranges.
  Activate only when `shouldOpenTerminalLink(event.button)` returns true.
  Forward hover and leave without accessing the filesystem.

- [ ] **Step 8: Run Task 1 tests and TypeScript**

  Run:

  ```bash
  npx tsx src/renderer/src/utils/terminalMarkdownLinks.test.ts
  npx tsc --noEmit
  ```

  Expected: both commands exit with code 0.

---

### Task 2: Integrate Markdown Links With File Tiles

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/shared/floatingNavigation.ts`
- Create: `src/shared/floatingNavigation.test.ts`
- Modify: `src/main/ipc/floatingTiles.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/TileContent.tsx`
- Modify: `src/renderer/src/components/TerminalTile.tsx`
- Modify: `src/renderer/src/components/FloatingTileWindow.tsx`
- Modify: `src/renderer/src/utils/terminalContextMenu.ts`
- Modify: `src/renderer/src/utils/terminalContextMenu.test.ts`
- Modify: `src/renderer/src/utils/fileTileLifecycle.test.ts`
- Modify: `scripts/terminal-link-actions.test.mjs`
- Modify: `package.json`
- Modify: `src/renderer/src/components/TerminalTile.test.ts`

**Interfaces:**
- Consumes: `createTerminalMarkdownLinkProvider` from Task 1.
- Produces: `FileTileOpenOptions` with optional `markdownView: MarkdownViewMode`.
- Changes file-open callbacks to `(relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>`.
- Extends `FloatingNavigationRequest` with optional `fileMarkdownView: MarkdownViewMode` for `kind: 'file'` requests.
- Produces: `createFloatingFileNavigationRequest(relativePath: string, options?: FileTileOpenOptions): FloatingNavigationRequest`.
- Produces: `normalizeFloatingNavigationRequest(value: unknown): FloatingNavigationRequest | null`.
- Produces a typed terminal hover target: `{ kind: 'web'; value: string } | { kind: 'markdown'; value: string }`.

- [ ] **Step 1: Write failing context-menu tests**

  Preserve the exact current web menu. Add a Markdown target case. Assert this
  exact menu and callback sequence:

  ```ts
  Open in Markdown tile|Copy path
  markdown:docs/guide.md|copy-path:docs/guide.md
  ```

  Keep the existing standard menu test for non-link clicks.

- [ ] **Step 2: Write failing file lifecycle tests**

  Propose a Markdown file tile with `fileMarkdownView: 'preview'`. Assert that
  a created tile retains `preview`. Assert that focusing an existing tile does
  not replace its selected view. Keep the existing reusable-preview assertion
  that preserves the reusable tile's selected view.

- [ ] **Step 3: Run focused tests and verify RED**

  Run:

  ```bash
  npx tsx src/renderer/src/utils/terminalContextMenu.test.ts
  npx tsx src/renderer/src/utils/fileTileLifecycle.test.ts
  ```

  Expected: the context-menu test fails because Markdown targets are not
  supported. The lifecycle test fails if requested preview mode is dropped.

- [ ] **Step 4: Add typed file-open options and detached navigation**

  Add `FileTileOpenOptions` near the file contracts in `src/shared/types.ts`.
  Add `fileMarkdownView?` to `FloatingNavigationRequest`. Update callback types
  in `TileContent` and `FloatingTileWindow`. Preserve the option when a
  detached terminal requests parent-window navigation.

  First add failing tests for `normalizeFloatingNavigationRequest`. Assert
  that file navigation preserves `preview`, browser navigation removes a file
  view, invalid view values are removed, and malformed kind or target values
  return `null`. Run:

  ```bash
  npx tsx src/shared/floatingNavigation.test.ts
  ```

  Verify RED because the normalizer does not exist. Then implement the pure
  normalizer and use it in `src/main/ipc/floatingTiles.ts` before forwarding
  the event to the main renderer. Add and test
  `createFloatingFileNavigationRequest`. Use it in `FloatingTileWindow` so the
  same test covers construction and normalization of the detached payload.

- [ ] **Step 5: Apply the requested initial Markdown view in App**

  Change `openFileTile` to accept `options: FileTileOpenOptions = {}`. Put
  `fileMarkdownView: options.markdownView` on the proposed tile only when the
  option exists. Pass `event.fileMarkdownView` back into `openFileTile` for a
  detached navigation request. Do not change explorer or Markdown-preview
  link defaults.

- [ ] **Step 6: Add typed terminal context-menu behavior**

  Replace `linkUrl` with a discriminated `linkTarget`. Keep existing web menu
  labels and actions. For Markdown targets, create only `Open in Markdown
  tile` and `Copy path`. Use the existing clipboard bridge for copying.

- [ ] **Step 7: Register the Markdown provider in TerminalTile**

  Pass `onOpenFileTile` from `TileContent` to `TerminalTileWrapper`. Register
  the provider only when the terminal is not `remote-ssh`, the callback is
  available, and `workspaceConfig.rootFolderPath` is not empty. Add a pure
  registration-policy function and cover local, remote, rootless, and missing
  callback cases in `TerminalTile.test.ts`. Use `tile.agent?.cwd ?? ''` as its
  base directory. On activation,
  call:

  ```ts
  onOpenFileTile(relativePath, { markdownView: 'preview' })
  ```

  Catch promise rejection and log it. Store web and Markdown hover targets in
  one typed ref. Dispose the custom provider during terminal cleanup.

- [ ] **Step 8: Update the terminal action integration test**

  Extend `scripts/terminal-link-actions.test.mjs` only for behavior that the
  runnable utility tests cannot cover. Verify the renderer build imports the
  provider and exposes both file and browser callbacks. Do not duplicate
  detector or menu assertions.

- [ ] **Step 9: Run focused tests and verify GREEN**

  Run:

  ```bash
  npx tsx src/renderer/src/utils/terminalMarkdownLinks.test.ts
  npx tsx src/renderer/src/utils/terminalContextMenu.test.ts
  npx tsx src/renderer/src/utils/fileTileLifecycle.test.ts
  npx tsx src/shared/floatingNavigation.test.ts
  node --test scripts/terminal-link-actions.test.mjs
  ```

  Expected: every command exits with code 0.

- [ ] **Step 10: Run repository validation**

  Add the detector, terminal component, context-menu, file-lifecycle, and
  floating-navigation tests to the explicit `npm test` command in
  `package.json`. Do not use a broad generated-file pattern.

  Run:

  ```bash
  npm test
  npx tsc --noEmit
  npm run build
  git diff --check
  ```

  Expected: every command exits with code 0. Generated output must not be
  staged or copied to `main`.

- [ ] **Step 11: Manually verify the interaction**

  Run `npm run dev`. Print `README.md`, `docs/guide.md:10`, and
  `https://example.com/readme.md` in a local terminal. Verify Markdown clicks
  open file preview tiles. Verify the URL keeps web-link behavior. Repeat from
  an agent terminal with a workspace-relative `cwd`. Detach a terminal and
  verify that its Markdown click opens the file in the parent workspace. If a
  remote SSH profile is available, verify that local Markdown links are not
  created.
