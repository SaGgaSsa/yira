# Workspace Agent Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure one optional Claude or Codex provider per workspace and make Agents display only that provider's workspace-local data.

**Architecture:** Add an optional `agentProvider` field to the normalized workspace configuration while retaining the existing per-provider argument map for terminal/resume compatibility. Thread the selection through workspace editing into `AgentPanel`; without a selection the panel is a configuration empty state, while with one it filters active sessions and supplies both workspace ID and provider to history IPC.

**Tech Stack:** Electron, React, TypeScript, node:test, i18next, Tailwind CSS.

## Global Constraints

- Keep Node APIs out of the renderer; use existing preload IPC only.
- Preserve strict TypeScript, 2-space indentation, no semicolons, and single quotes.
- Existing workspaces must not silently choose Claude or Codex after migration.
- History remains restricted to the active workspace root in the main process.
- Do not run `npm run dist:win`.

---

### Task 1: Normalize and edit the selected workspace provider

**Files:**
- Modify: `src/shared/types.ts:18-38,153-188`
- Modify: `src/shared/workspaceConfig.ts:1-120`
- Modify: `src/shared/workspaceManagement.ts:50-105`
- Modify: `src/shared/agentWorkspaceConfig.test.ts`
- Modify: `src/renderer/src/components/WorkspaceDialog.tsx:1-115,220-275`
- Modify: `src/renderer/src/components/WorkspaceManagementDialog.tsx:1-160`
- Modify: `src/renderer/src/App.tsx:680-720,930-970,1470-1520`
- Modify: `src/renderer/src/i18n/resources.ts:180-230,530-570,860-910`

**Interfaces:**
- Consumes: `AgentProvider`, `AgentProvidersConfig`, and `normalizeAgentProvidersConfig`.
- Produces: `WorkspaceConfig.agentProvider?: AgentProvider`, plus matching optional `agentProvider` fields in `WorkspaceConfigInput`, `WorkspaceCreateInput`, and `WorkspaceManagementEntry`.

- [ ] **Step 1: Write failing normalization tests**

  In `src/shared/agentWorkspaceConfig.test.ts`, replace the two-default-enabled assertions with tests that call `normalizeWorkspaceConfig({})` and a legacy config containing only `agentProviders`; assert both results have `agentProvider === undefined`. Add an explicit config assertion:

  ```ts
  const configured = normalizeWorkspaceConfig({ agentProvider: 'codex' })
  if (configured.agentProvider !== 'codex') {
    throw new Error('explicit workspace agent selection must be preserved')
  }
  ```

  Update the management fixture so a selected provider is passed in and assert it remains after an edit. Assert a new management workspace has no selected agent provider.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm test -- src/shared/agentWorkspaceConfig.test.ts`

  Expected: FAIL because `WorkspaceConfig` does not expose `agentProvider` and normalization cannot preserve it.

- [ ] **Step 3: Add the normalized selection and preserve it through workspace management**

  In `src/shared/types.ts`, define `agentProvider?: AgentProvider` directly next to `agentProviders`, and add the optional input properties. In `src/shared/workspaceConfig.ts`, add a small normalizer:

  ```ts
  export function normalizeWorkspaceAgentProvider(value: unknown): AgentProvider | undefined {
    return value === 'claude' || value === 'codex' ? value : undefined
  }
  ```

  Include `agentProvider: normalizeWorkspaceAgentProvider(config?.agentProvider)` in `normalizeWorkspaceConfig`. In `applyWorkspaceManagementChanges`, pass the draft field into the config patch for creates and edits, retaining the existing provider-arguments merge.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `npm test -- src/shared/agentWorkspaceConfig.test.ts`

  Expected: PASS.

- [ ] **Step 5: Replace provider toggles with a single selection in workspace editing**

  Extend `WorkspaceDialogValue` with `agentProvider?: AgentProvider`, normalize it with `normalizeWorkspaceAgentProvider`, and replace each provider's enabled checkbox with three radio-style choices: no provider, Claude, and Codex. Keep the argument textarea only for the selected provider. Thread `agentProvider` through `WorkspaceManagementDialog` draft conversion and all WorkspaceDialog request/confirm call sites in `App.tsx`.

  Add localized labels for the single provider heading, no-selection option, and explanatory help in English and Spanish. Remove obsolete enabled/disabled labels only if they have no remaining consumers.

- [ ] **Step 6: Run focused config tests and static verification**

  Run: `npm test -- src/shared/agentWorkspaceConfig.test.ts && npx tsc --noEmit`

  Expected: PASS.

- [ ] **Step 7: Commit the task**

  ```bash
  git add src/shared/types.ts src/shared/workspaceConfig.ts src/shared/workspaceManagement.ts src/shared/agentWorkspaceConfig.test.ts src/renderer/src/components/WorkspaceDialog.tsx src/renderer/src/components/WorkspaceManagementDialog.tsx src/renderer/src/App.tsx src/renderer/src/i18n/resources.ts
  git commit -m "feat: select one workspace agent provider"
  ```

### Task 2: Make Agents selected-provider and workspace-only

**Files:**
- Modify: `src/renderer/src/components/WorkspacePanel.tsx:1-120`
- Modify: `src/renderer/src/components/AgentPanel.tsx`
- Modify: `src/renderer/src/components/AgentPanel.test.tsx`
- Modify: `src/renderer/src/utils/agentPanel.ts`
- Modify: `src/renderer/src/utils/agentPanel.test.ts`
- Modify: `src/renderer/src/i18n/resources.ts:530-570,860-910`

**Interfaces:**
- Consumes: `WorkspaceConfig.agentProvider?: AgentProvider` from Task 1 and `AgentSessionHistoryQuery` over the existing IPC bridge.
- Produces: `buildAgentHistoryQuery(workspaceId: string, provider: AgentProvider, search: string)` and an `AgentPanel` that never makes a history/session request without a selected provider.

- [ ] **Step 1: Write failing query and panel-source tests**

  Change `src/renderer/src/utils/agentPanel.test.ts` so its expected query is:

  ```ts
  assert.deepEqual(buildAgentHistoryQuery('workspace-1', 'claude', ' release notes '), {
    workspaceId: 'workspace-1',
    provider: 'claude',
    search: 'release notes',
  })
  ```

  Delete the all-local test. In `AgentPanel.test.tsx`, assert the source includes `selectedProvider`, `provider: selectedProvider`, and an unconfigured-state action. Assert it no longer contains `'New agent session'`, `'All local'`, `historyScope`, `launchAgent`, or `agents.availability()`.

- [ ] **Step 2: Run focused tests to verify they fail**

  Run: `npm test -- src/renderer/src/utils/agentPanel.test.ts src/renderer/src/components/AgentPanel.test.tsx`

  Expected: FAIL because the query still accepts a scope and the panel still renders launch/scope UI.

- [ ] **Step 3: Simplify the renderer data model and panel props**

  Change `WorkspacePanel` to receive `agentProvider?: AgentProvider` and pass it to `AgentPanel`. Remove `agentProviders`, shell profiles, and `addTerminal` from both components when they are used only to launch sessions. `AgentPanel` should retain tile focusing and resume terminal creation only; pass `addTerminal` and available profiles only as needed by resume.

  Replace `buildAgentHistoryQuery(scope, workspaceId, search)` with:

  ```ts
  export function buildAgentHistoryQuery(
    workspaceId: string,
    provider: AgentProvider,
    search: string,
  ): AgentSessionHistoryQuery {
    const normalizedSearch = search.trim().replace(/\s+/g, ' ')
    return {
      workspaceId,
      provider,
      ...(normalizedSearch ? { search: normalizedSearch } : {}),
    }
  }
  ```

  Filter session snapshots with `session.provider === selectedProvider`. Only subscribe and load history if `selectedProvider` exists. When it does not, render a concise empty state with a button calling a new `onOpenWorkspaceSettings` callback; do not render Running or History data. Remove availability refresh, launch cards, provider availability state, `historyScope`, and the scope select.

- [ ] **Step 4: Wire workspace settings navigation and localization**

  In `App.tsx`, pass the active workspace's `config.agentProvider` to `WorkspacePanel`. Reuse the app's existing workspace-edit dialog opener for the panel's `onOpenWorkspaceSettings` callback; do not route users to the unrelated global Settings page. Add English and Spanish text for the unconfigured state and its configuration action.

- [ ] **Step 5: Run focused tests to verify they pass**

  Run: `npm test -- src/renderer/src/utils/agentPanel.test.ts src/renderer/src/components/AgentPanel.test.tsx`

  Expected: PASS.

- [ ] **Step 6: Run full verification and manually exercise the affected UI**

  Run: `npx tsc --noEmit && npm test && npm run build`

  Then run `npm run dev` and verify: an unconfigured workspace shows no agent session/history data and opens that workspace's configuration; selecting Claude or Codex makes the panel show only that provider's sessions; history has no scope control; resuming a history item still opens a terminal tile.

- [ ] **Step 7: Commit the task**

  ```bash
  git add src/renderer/src/components/WorkspacePanel.tsx src/renderer/src/components/AgentPanel.tsx src/renderer/src/components/AgentPanel.test.tsx src/renderer/src/utils/agentPanel.ts src/renderer/src/utils/agentPanel.test.ts src/renderer/src/i18n/resources.ts src/renderer/src/App.tsx
  git commit -m "refactor: scope agents to the selected workspace provider"
  ```

## Self-review

- Spec coverage: Task 1 implements optional explicit selection, legacy migration, and editing. Task 2 removes launching and scope selection, gates all data before selection, filters by provider and workspace, and retains resume/focus.
- Placeholder scan: no deferred requirements or unspecified error handling remain; all user-visible text and validation commands are named.
- Type consistency: `agentProvider?: AgentProvider` is produced by Task 1, passed through `WorkspacePanel`, and consumed as `selectedProvider` by Task 2. The history helper always emits both workspace ID and provider.
