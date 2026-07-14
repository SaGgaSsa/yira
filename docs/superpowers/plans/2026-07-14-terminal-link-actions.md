# Terminal Link Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** URLs printed by terminal tiles open externally on a normal click and expose Browser-tile, external-open, and copy actions on a right click.

**Architecture:** The xterm web-links addon detects HTTP and HTTPS URLs from rendered output. `TerminalTile` stores its hovered URL and combines link-specific entries with the existing terminal menu. `useCanvasActions` remains the single creator of browser tiles and receives a URL from the root workspace UI.

**Tech Stack:** Electron 33, React 19, TypeScript 5.7, xterm 6, `@xterm/addon-web-links` 0.12, Zustand.

## Global Constraints

- Link behavior applies to rendered output from Bash, WSL, PowerShell, and SSH terminals.
- A normal click uses `window.electron.shell.openExternal`; a right-click on a URL offers **Open in Browser tile**, **Open externally**, and **Copy URL**.
- A right-click that is not over a URL retains Copy, Paste, Select All, and notification controls.
- Work directly on `main`; do not create a worktree.
- In WSL, run only non-mutating validation: targeted checks and `npx tsc --noEmit`.

---

## File structure

- `package.json`, `package-lock.json`: the official xterm web-links addon.
- `src/renderer/src/utils/terminalContextMenu.ts`: pure menu construction.
- `src/renderer/src/utils/terminalContextMenu.test.ts`: callback and menu-label assertions.
- `src/renderer/src/hooks/useCanvasActions.ts`: `addBrowser(url?: string)`.
- `src/renderer/src/components/TerminalTile.tsx`: addon lifecycle and terminal menu state.
- `src/renderer/src/components/TileContent.tsx`, `Canvas.tsx`, `GridView.tsx`, `App.tsx`: browser-creation callback propagation for canvas, full view, split view, and grid view.

### Task 1: URL-aware terminal menu utility

**Files:**
- Create: `src/renderer/src/utils/terminalContextMenu.ts`
- Create: `src/renderer/src/utils/terminalContextMenu.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces `buildTerminalContextMenuItems(input: TerminalContextMenuInput): MenuItem[]`.
- `TerminalContextMenuInput` contains `selectedText`, `notificationsMuted`, optional `linkUrl`, plus `onCopySelection`, `onPaste`, `onSelectAll`, `onToggleNotifications`, `onOpenBrowserTile`, `onOpenExternal`, and `onCopyLink` callbacks.

- [ ] **Step 1: Write the failing test**

Create `terminalContextMenu.test.ts` with an input whose `linkUrl` is `https://example.com/docs`, whose callbacks append to a `calls: string[]`, and these assertions:

```ts
const labels = items.filter((item) => !item.divider).map((item) => item.label)
if (labels.join('|') !== 'Open in Browser tile|Open externally|Copy URL|Copy|Paste|Select All|Mute Notifications') {
  throw new Error(`unexpected menu: ${labels.join('|')}`)
}
items[0].action?.()
items[1].action?.()
items[2].action?.()
if (calls.join('|') !== 'browser:https://example.com/docs|external:https://example.com/docs|copy-link:https://example.com/docs') {
  throw new Error(`unexpected callbacks: ${calls.join('|')}`)
}
```

- [ ] **Step 2: Verify the test fails**

Run `npx --yes tsx src/renderer/src/utils/terminalContextMenu.test.ts`.

Expected: failure because the utility module does not yet exist.

- [ ] **Step 3: Add the dependency and implementation**

Run `npm install @xterm/addon-web-links@^0.12.0`. Implement the utility to prepend this exact array only when `input.linkUrl` exists:

```ts
[
  { label: 'Open in Browser tile', action: () => input.onOpenBrowserTile(input.linkUrl!) },
  { label: 'Open externally', action: () => input.onOpenExternal(input.linkUrl!) },
  { label: 'Copy URL', action: () => input.onCopyLink(input.linkUrl!) },
  { divider: true },
]
```

Append the existing Copy, Paste, Select All, and mute/unmute entries. Preserve the current disabled state for Copy when no selection exists.

- [ ] **Step 4: Verify and commit**

Run `npx --yes tsx src/renderer/src/utils/terminalContextMenu.test.ts`; expect exit code 0. Then run `git add package.json package-lock.json src/renderer/src/utils/terminalContextMenu.ts src/renderer/src/utils/terminalContextMenu.test.ts` and `git commit -m "feat: add terminal link menu actions"`.

### Task 2: Extend the shared browser action

**Files:**
- Modify: `src/renderer/src/hooks/useCanvasActions.ts:1-14,228-250`
- Modify: `src/renderer/src/utils/browserUrl.test.ts`

**Interfaces:**
- Consumes `normalizeBrowserUrl(raw: string): string`.
- Changes the exposed hook action to `addBrowser(url?: string): void`.

- [ ] **Step 1: Write a URL-preservation assertion**

Append to `browserUrl.test.ts`:

```ts
const secure = normalizeBrowserUrl('https://example.com/path?tab=1')
if (secure !== 'https://example.com/path?tab=1') {
  throw new Error(`secure URLs must be preserved, got ${secure}`)
}
```

- [ ] **Step 2: Run the test before the hook change**

Run `npx --yes tsx src/renderer/src/utils/browserUrl.test.ts`; expect exit code 0 because this test locks the existing normalizer needed by the new call path.

- [ ] **Step 3: Implement the optional URL**

Import `normalizeBrowserUrl`, change the callback declaration to `const addBrowser = useCallback((url?: string) => {`, and set the created tile's value to `browserUrl: normalizeBrowserUrl(url ?? browserHomeUrl)`. Preserve availability, position, grouping, focus, and grid-capacity behavior.

- [ ] **Step 4: Verify and commit**

Run `npx --yes tsx src/renderer/src/utils/browserUrl.test.ts && npx tsc --noEmit`; expect exit code 0. Then run `git add src/renderer/src/hooks/useCanvasActions.ts src/renderer/src/utils/browserUrl.test.ts` and `git commit -m "feat: open terminal links in browser tiles"`.

### Task 3: Load xterm links and route their actions

**Files:**
- Modify: `src/renderer/src/components/TerminalTile.tsx:1-365`
- Modify: `src/renderer/src/components/TileContent.tsx:15-43`
- Modify: `src/renderer/src/components/Canvas.tsx:84-145,723-736`
- Modify: `src/renderer/src/components/GridView.tsx:13-40,250-260`
- Modify: `src/renderer/src/App.tsx:2246-2270`
- Create: `scripts/terminal-link-actions.test.mjs`

**Interfaces:**
- Consumes `WebLinksAddon`, `buildTerminalContextMenuItems`, and `onOpenBrowserTile(url: string): void`.
- Produces interactive links in canvas, full view, split view, and grid view terminals.

- [ ] **Step 1: Write the failing wiring test**

Create `scripts/terminal-link-actions.test.mjs`:

```js
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/renderer/src/components/TerminalTile.tsx', import.meta.url), 'utf8')
for (const required of [
  "@xterm/addon-web-links",
  'new WebLinksAddon',
  'window.electron.shell.openExternal',
  'onOpenBrowserTile',
  'buildTerminalContextMenuItems',
]) {
  if (!source.includes(required)) throw new Error(`TerminalTile is missing ${required}`)
}
```

- [ ] **Step 2: Verify it fails**

Run `node scripts/terminal-link-actions.test.mjs`.

Expected: failure because `TerminalTile` does not yet load the addon.

- [ ] **Step 3: Implement the addon lifecycle and context menu**

In the terminal mount effect, load and later dispose this addon:

```ts
const webLinksAddon = new WebLinksAddon((_event, url) => {
  void window.electron.shell.openExternal(url).catch((error: unknown) => {
    console.error('[TerminalTile] Failed to open terminal link externally:', error)
  })
}, {
  hover: (_event, url) => { hoveredLinkUrlRef.current = url },
  leave: () => { hoveredLinkUrlRef.current = null },
})
term.loadAddon(webLinksAddon)
```

Store `linkUrl?: string` with the menu position using `hoveredLinkUrlRef.current` during `onContextMenu`. Replace the inline `menuItems` array with `buildTerminalContextMenuItems`, route browser creation to `onOpenBrowserTile(url)`, and wrap external-open and clipboard failures in the existing console-error style.

- [ ] **Step 4: Thread the callback from `App`**

Add `onOpenBrowserTile: (url: string) => void` to `TileContentProps`, terminal props, `CanvasProps`, and `GridViewProps`. Forward it at each `TileContent` call. In both App render paths pass `onOpenBrowserTile={(url) => addBrowser(url)}`. Canvas covers full view and split view through its current `viewMode` rendering.

- [ ] **Step 5: Verify end-to-end code and type safety**

Run `node scripts/terminal-link-actions.test.mjs && npx --yes tsx src/renderer/src/utils/terminalContextMenu.test.ts && npx --yes tsx src/renderer/src/utils/browserUrl.test.ts && npx tsc --noEmit`; expect exit code 0.

Run the required platform check:

```bash
if grep -qiE '(microsoft|wsl)' /proc/version /proc/sys/kernel/osrelease 2>/dev/null; then
  echo WSL
else
  echo native Linux
fi
```

On native Linux only, run `npm run dev`, print `https://example.com`, and verify left-click external open, all three right-click link actions, Browser tile URL persistence, and the unchanged non-link context menu. In WSL, stop after the non-mutating checks.

- [ ] **Step 6: Commit**

Run `git add src/renderer/src/components/TerminalTile.tsx src/renderer/src/components/TileContent.tsx src/renderer/src/components/Canvas.tsx src/renderer/src/components/GridView.tsx src/renderer/src/App.tsx scripts/terminal-link-actions.test.mjs` and `git commit -m "feat: make terminal links actionable"`.
