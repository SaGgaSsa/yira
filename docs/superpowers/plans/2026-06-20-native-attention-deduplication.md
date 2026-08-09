# Native Attention Deduplication Implementation Plan

> **For agentic workers:** Implement this plan task by task under the repository's **Plan Implementation and Luna Delegation** rules in `AGENTS.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coalesce repeated native attention requests for the same Electron window until the user returns to that window.

**Architecture:** Keep the renderer's 10-second per-tile delay. Add a small main-process controller that owns window-scoped attention state and clears it on window focus or explicit clear; IPC delegates all flashing decisions to it.

**Tech Stack:** Electron main process, TypeScript, focused `jiti` scripts.

---

### Task 1: Specify and prove window-scoped attention state

**Files:**
- Create: `src/main/windowAttention.test.ts`
- Create: `src/main/windowAttention.ts`

- [ ] **Step 1: Write the failing test**

```ts
const controller = createWindowAttentionController()
controller.request(window, true)
controller.request(window, true)
expectNumber(window.flashCalls.filter(Boolean).length, 1, 'repeated requests must flash once')
window.emitFocus()
controller.request(window, true)
expectNumber(window.flashCalls.filter(Boolean).length, 2, 'focus must re-arm attention')
```

- [ ] **Step 2: Run the focused test and verify it fails because `windowAttention.ts` is absent**

Run: `npx jiti src/main/windowAttention.test.ts`

Expected: non-zero exit with a module-resolution failure for `./windowAttention`.

- [ ] **Step 3: Write the minimal controller**

```ts
export function createWindowAttentionController() {
  const markedWindows = new WeakSet<AttentionWindow>()
  return {
    request(window, onlyWhenInactive) {
      if (onlyWhenInactive && window.isFocused()) return 'window-focused'
      if (markedWindows.has(window)) return 'already-marked'
      window.flashFrame(true)
      markedWindows.add(window)
      return 'marked'
    },
    clear(window) {
      markedWindows.delete(window)
      window.flashFrame(false)
    },
  }
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npx jiti src/main/windowAttention.test.ts`

Expected: exit 0.

### Task 2: Delegate notification IPC to the controller

**Files:**
- Modify: `src/main/ipc/notifications.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Extend the shared result reason**

```ts
export type NotificationAttentionReason = 'marked' | 'already-marked' | 'no-window' | 'window-focused' | 'cleared'
```

- [ ] **Step 2: Replace direct `flashFrame` calls with the controller**

```ts
const attention = createWindowAttentionController()
const result = attention.request(window, options?.onlyWhenInactive !== false)
return { marked: result === 'marked', reason: result }
```

- [ ] **Step 3: Verify the focused test and type check**

Run: `npx jiti src/main/windowAttention.test.ts && npx tsc --noEmit`

Expected: both commands exit 0.
