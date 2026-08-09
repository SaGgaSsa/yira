# Update Diagnostics Settings Implementation Plan

> **For agentic workers:** Implement this plan task by task under the repository's **Plan Implementation and Luna Delegation** rules in `AGENTS.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable update diagnostics for testing installations and let users control the setting in Advanced settings.

**Architecture:** The shared settings normalizer adds a persisted migration marker. Settings without that marker are migrated to enabled diagnostics once; later explicit opt-outs are retained. The renderer exposes the existing persisted setting in the Advanced section through a dedicated store action.

**Tech Stack:** TypeScript, Electron IPC, React, Zustand, i18next, Node test runner, tsx.

## Global Constraints

- Diagnostics must continue to store only sanitized local event data.
- A failed settings or diagnostics write must not block update operations.
- The migration must enable diagnostics only once; a later user opt-out persists.
- Use 2-space indentation, single quotes, no semicolons, and existing Tailwind theme tokens.
- On this native Linux host, run `npm run build` only after focused tests and type validation.

---

### Task 1: Migrate persisted update diagnostics settings

**Files:**
- Modify: `src/shared/types.ts:117-164`
- Modify: `src/shared/userSettings.ts:10-75`
- Modify: `src/shared/userSettings.test.ts:1-35`
- Modify: `src/main/ipc/settings.ts:15-35`

**Interfaces:**
- Consumes: persisted `updateDiagnosticsEnabled?: unknown` and `updateDiagnosticsMigrationComplete?: unknown`.
- Produces: `UserSettings.updateDiagnosticsEnabled: boolean` and `UserSettings.updateDiagnosticsMigrationComplete: boolean`.
- Guarantees: settings without a completed marker normalize to `{ updateDiagnosticsEnabled: true, updateDiagnosticsMigrationComplete: true }`; settings with a completed marker preserve an explicit `false`.

- [x] **Step 1: Write the failing migration assertions**

Replace the existing diagnostics default assertions in `src/shared/userSettings.test.ts` with these cases:

```ts
const diagnosticsDefault = normalizeUserSettings({} as unknown as Partial<UserSettings>)
if (diagnosticsDefault.updateDiagnosticsEnabled !== true) {
  throw new Error('update diagnostics must default enabled during testing')
}
if (diagnosticsDefault.updateDiagnosticsMigrationComplete !== true) {
  throw new Error('new settings must mark update diagnostics migration complete')
}

const migratedDiagnostics = normalizeUserSettings({ updateDiagnosticsEnabled: false } as unknown as Partial<UserSettings>)
if (migratedDiagnostics.updateDiagnosticsEnabled !== true) {
  throw new Error('existing settings must enable update diagnostics once')
}

const optedOutDiagnostics = normalizeUserSettings({
  updateDiagnosticsEnabled: false,
  updateDiagnosticsMigrationComplete: true,
} as unknown as Partial<UserSettings>)
if (optedOutDiagnostics.updateDiagnosticsEnabled !== false) {
  throw new Error('explicit update diagnostics opt-out must be preserved after migration')
}
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npx tsx src/shared/userSettings.test.ts`

Expected: failure because the default is currently disabled and the migration marker is absent from the settings contract.

- [x] **Step 3: Implement the smallest migration contract**

Add the following fields to the existing `UserSettings` and `DEFAULT_USER_SETTINGS` declarations:

```ts
updateDiagnosticsEnabled: true,
updateDiagnosticsMigrationComplete: true,
```

Extend `RawUserSettings` with `updateDiagnosticsMigrationComplete?: unknown`. In `normalizeUserSettings`, compute whether the marker is complete and return the enabled value as `true` until it is complete; once complete, only literal `true` enables diagnostics. Always return a completed marker. Update `loadStoredUserSettings` so files missing or containing an invalid migration marker are rewritten with the normalized result.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `npx tsx src/shared/userSettings.test.ts`

Expected: exit code 0.

### Task 2: Expose the diagnostics option in Advanced settings

**Files:**
- Modify: `src/renderer/src/store/settingsStore.ts:9-205`
- Modify: `src/renderer/src/components/SettingsPanel.tsx:95-350`
- Modify: `src/renderer/src/i18n/resources.ts:44-115,323-395,602-675`

**Interfaces:**
- Consumes: `UserSettings.updateDiagnosticsEnabled` and the existing `settings:save` bridge.
- Produces: `setUpdateDiagnosticsEnabled(enabled: boolean): void` in `SettingsState` and an Advanced-section checkbox.
- Guarantees: toggling the checkbox updates the Zustand state and persists both diagnostics fields through the existing debounced save path.

- [x] **Step 1: Add the store action, checkbox, and translations**

Add the action to `SettingsState` and implement it using `set({ updateDiagnosticsEnabled: enabled })` followed by `scheduleSave()`. Include `updateDiagnosticsMigrationComplete` in both store save payloads. In `SettingsPanel`, select the boolean and action, then render a checkbox in Advanced with the existing rounded settings-row pattern:

```tsx
<input
  type="checkbox"
  checked={updateDiagnosticsEnabled}
  onChange={(event) => setUpdateDiagnosticsEnabled(event.target.checked)}
/>
```

Add `settings.updateDiagnostics` and `settings.updateDiagnosticsDescription` in English and Spanish. The description must state that update events are stored locally for investigation.

- [x] **Step 2: Run strict type validation for the UI contract**

Run: `npx tsc --noEmit`

Expected: exit code 0, confirming the store action, settings payload, translation keys, and JSX are type-compatible.

### Task 3: Validate the integrated settings flow

**Files:**
- Test: `src/shared/userSettings.test.ts`

**Interfaces:**
- Consumes: the normalized shared settings contract and renderer save payload.
- Produces: a type-valid installed build with diagnostics enabled on migrated settings and controllable in the UI.

- [x] **Step 1: Run all automated tests**

Run: `npm test && npx tsx src/shared/userSettings.test.ts`

Expected: all Node and tsx tests pass.

- [x] **Step 2: Run strict type validation**

Run: `npx tsc --noEmit`

Expected: exit code 0 with no TypeScript errors.

- [x] **Step 3: Build the native Linux package inputs**

Run: `npm run build`

Expected: Electron main, preload, and renderer builds complete successfully.

- [x] **Step 4: Inspect the final change set**

Run: `git diff --check && git diff --stat`

Expected: no whitespace errors; only settings migration, UI, translations, tests, and documentation are changed.
