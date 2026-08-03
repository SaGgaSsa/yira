# Main Update Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, bounded update diagnostic log owned by Yira's Electron main process.

**Architecture:** A new `updateDiagnostics` module reads the persisted main-process preference, serializes safe structured update events, and writes them to a bounded JSON-lines log beneath `YIRA_HOME`. `updater.ts` records every update and installation boundary, while the settings normalizer supplies the default-disabled preference. This delivery deliberately omits the renderer toggle; the preference can be added to `settings.json` for the diagnostic investigation and exposed by the approved Settings UI work separately.

**Tech Stack:** Electron main process, Node.js `fs/promises`, strict TypeScript, existing script-style TypeScript tests run through `jiti`.

## Global Constraints

- Diagnostics default to disabled and create no files unless enabled.
- Never log terminal data, workspace data, credentials, raw errors, full paths, release URLs, environment variables, or command arguments.
- Store all diagnostic files under `YIRA_HOME/logs` and honor the `YIRA_HOME` override.
- Retain only `updater.log` and `updater.previous.log`; rotate before the active file exceeds 512 KiB.
- Diagnostic I/O is best-effort and must never affect updater state or installation.
- In WSL use focused script tests and `npx tsc --noEmit`; on native Linux use the same checks before any manual installed-app verification.

---

### Task 1: Add the persisted disabled-by-default preference

**Files:**
- Modify: `src/shared/types.ts:117-160`
- Modify: `src/shared/userSettings.ts:10-75`
- Modify: `src/shared/userSettings.test.ts:1-70`

**Interfaces:**
- Produces: `UserSettings.updateDiagnosticsEnabled: boolean` and `DEFAULT_USER_SETTINGS.updateDiagnosticsEnabled === false`.
- Consumes: `normalizeUserSettings(raw)` migration contract used by the main settings IPC.

- [ ] **Step 1: Write the failing migration test**

Add these assertions to `src/shared/userSettings.test.ts`:

```ts
const diagnosticsDefault = normalizeUserSettings({})
if (diagnosticsDefault.updateDiagnosticsEnabled !== false) {
  throw new Error('update diagnostics must default disabled')
}

const diagnosticsEnabled = normalizeUserSettings({ updateDiagnosticsEnabled: true })
if (diagnosticsEnabled.updateDiagnosticsEnabled !== true) {
  throw new Error('enabled update diagnostics must be preserved')
}

const diagnosticsInvalid = normalizeUserSettings({ updateDiagnosticsEnabled: 'yes' as never })
if (diagnosticsInvalid.updateDiagnosticsEnabled !== false) {
  throw new Error('invalid update diagnostics values must normalize to disabled')
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jiti src/shared/userSettings.test.ts`

Expected: failure because `updateDiagnosticsEnabled` is absent from `UserSettings` and `normalizeUserSettings`.

- [ ] **Step 3: Add the minimal shared implementation**

Add the required boolean to `UserSettings` and set it to `false` in `DEFAULT_USER_SETTINGS`. Extend the raw input type with `updateDiagnosticsEnabled?: unknown`, then return `raw.updateDiagnosticsEnabled === true` from `normalizeUserSettings`. Do not use truthiness so malformed persisted values stay disabled.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx jiti src/shared/userSettings.test.ts`

Expected: exit status `0`.

### Task 2: Create a safe, bounded main-process diagnostic writer

**Files:**
- Create: `src/main/updateDiagnostics.ts`
- Create: `src/main/updateDiagnostics.test.ts`

**Interfaces:**
- Produces:

```ts
export type UpdateDiagnosticEvent = {
  event: string
  version: string
  data?: Record<string, boolean | number | string | null>
}

export class UpdateDiagnostics {
  constructor(options: { homeDir: string; getVersion: () => string; maxBytes?: number })
  setEnabled(enabled: boolean): void
  isEnabled(): boolean
  record(event: UpdateDiagnosticEvent): Promise<void>
}
```

- Consumes: `homeDir` derived from `YIRA_HOME` and `getVersion` supplied by the Electron application.

- [ ] **Step 1: Write failing writer tests**

Create `src/main/updateDiagnostics.test.ts` using `mkdtemp`, `rm`, `readFile`, `stat`, and `join`. Include these cases:

```ts
const disabled = new UpdateDiagnostics({ homeDir: tempRoot, getVersion: () => '1.2.3' })
await disabled.record({ event: 'check-requested', version: '1.2.3', data: { source: 'startup' } })
await assert.rejects(stat(join(tempRoot, 'logs', 'updater.log')), { code: 'ENOENT' })

const enabled = new UpdateDiagnostics({ homeDir: tempRoot, getVersion: () => '1.2.3' })
enabled.setEnabled(true)
await enabled.record({ event: 'check-requested', version: '1.2.3', data: { source: 'manual' } })
const record = JSON.parse(await readFile(join(tempRoot, 'logs', 'updater.log'), 'utf8'))
if (record.event !== 'check-requested' || record.version !== '1.2.3' || record.data.source !== 'manual') throw new Error('safe event must be written')
if (typeof record.timestamp !== 'string') throw new Error('record must include timestamp')
```

Add a rotation case with `maxBytes: 1` that records two events and asserts that both `updater.log` and `updater.previous.log` exist. Add a sanitization case asserting that unsupported data values are omitted rather than serialized.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jiti src/main/updateDiagnostics.test.ts`

Expected: failure because `./updateDiagnostics` does not exist.

- [ ] **Step 3: Implement the minimal writer**

Implement a serial queue for writes. `record` returns immediately when disabled; otherwise it builds a JSON object with an ISO timestamp, event name, supplied version, and only primitive `data` values. It writes one JSON line to `homeDir/logs/updater.log`, creates the directory recursively, rotates before append when the projected size exceeds `maxBytes` (default `512 * 1024`), and catches every file-system error. The public method must resolve rather than reject on diagnostic I/O failure.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx jiti src/main/updateDiagnostics.test.ts`

Expected: exit status `0`.

### Task 3: Load the main-process preference and trace updater boundaries

**Files:**
- Modify: `src/main/updater.ts:1-195`
- Modify: `src/main/ipc/settings.ts:9-50`
- Modify: `src/main/updateDiagnostics.test.ts`

**Interfaces:**
- Consumes: `UpdateDiagnostics` from Task 2 and normalized `UserSettings.updateDiagnosticsEnabled` from Task 1.
- Produces: update diagnostic events for all update-check, updater-event, timeout, installation-request, no-op-installation, and application-lifecycle boundaries.

- [ ] **Step 1: Extend the failing diagnostics test with updater-safe event expectations**

Add pure helper tests for the event-data mapper introduced in `updater.ts` or `updateDiagnostics.ts`. Verify that a raw updater message such as:

```ts
'Executing: pkexec with args: --disable-internal-agent,/bin/bash,-c,\'dpkg -i /home/alice/.cache/yira-updater/pending/Yira.deb\''
```

becomes exactly `{ category: 'privilege-command-started' }`, and that an unknown string becomes `{ category: 'updater-message' }`. Assert that no source string, path, or argument text is included.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jiti src/main/updateDiagnostics.test.ts`

Expected: failure because the safe updater-message mapper has not been implemented.

- [ ] **Step 3: Wire the writer into settings and updater code**

In `src/main/ipc/settings.ts`, export an async `loadStoredUserSettings()` helper that returns normalized settings or defaults without registering IPC handlers. Keep the existing IPC behavior by calling this helper. In `src/main/updater.ts`, initialize diagnostics by loading that helper before the delayed startup check and set its enabled state from `updateDiagnosticsEnabled`.

Record these event names with safe data only:

- `check-requested` with `source`;
- `check-skipped` with `reason` for unpackaged, in-flight, and downloading cases;
- `checking`, `update-available`, `update-not-available`, `download-progress`, `update-downloaded`, `update-error`, and `check-timeout`;
- `install-requested` with `eligible` and current status;
- `quit-and-install-requested` immediately before calling `quitAndInstall`;
- `app-before-quit`, `app-will-quit`, and `app-quit` with whether the update state was downloaded.

Set `autoUpdater.logger` to an adapter that sends the updater library's `info`, `warn`, and `error` calls through a pure safe-category mapper and then delegates to `console`. Do not persist its original text. Keep all existing visible update-state behavior unchanged.

- [ ] **Step 4: Run focused tests to verify they pass**

Run:

```bash
npx jiti src/shared/userSettings.test.ts
npx jiti src/main/updateDiagnostics.test.ts
npx jiti src/main/updateErrorMessage.test.ts
```

Expected: all commands exit status `0`.

### Task 4: Validate the main-process delivery

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-update-diagnostics-design.md` only if implementation deliberately narrows an approved requirement.

**Interfaces:**
- Consumes: all code from Tasks 1–3.
- Produces: evidence that diagnostics compile and the existing repository script tests still pass.

- [ ] **Step 1: Run the repository script suite**

Run: `npm test`

Expected: exit status `0`.

- [ ] **Step 2: Run strict TypeScript validation**

Run: `npx tsc --noEmit`

Expected: exit status `0` with no TypeScript diagnostics.

- [ ] **Step 3: Perform a safe manual configuration verification**

Create no production data. Inspect a temporary `YIRA_HOME` test directory generated by `updateDiagnostics.test.ts` to confirm that diagnostics are disabled unless the explicit persisted field is `true`, and that the JSON lines contain no forbidden raw fields.

- [ ] **Step 4: Report the deferred UI work explicitly**

State that the existing specification's Settings Advanced toggle and open-folder action remain separate renderer/preload work. Include the exact manual activation field for this main-process delivery:

```json
{
  "updateDiagnosticsEnabled": true
}
```
