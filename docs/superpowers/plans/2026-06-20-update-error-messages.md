# Update Error Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show safe, actionable update errors instead of raw `electron-updater` exceptions.

**Architecture:** A new pure main-process helper maps an unknown updater failure to a stable English message. `updater.ts` logs the original failure for diagnostics and sends only the mapped text through the existing `UpdateState` IPC path.

**Tech Stack:** TypeScript, Electron main process, `electron-updater`, `jiti` focused scripts, TypeScript compiler.

---

### Task 1: Specify the error-message classifier

**Files:**
- Create: `src/main/updateErrorMessage.test.ts`
- Create: `src/main/updateErrorMessage.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { getUpdateErrorMessage } from './updateErrorMessage'

const noNetwork = getUpdateErrorMessage(Object.assign(new Error('getaddrinfo ENOTFOUND github.com'), { code: 'ENOTFOUND' }))
if (noNetwork !== 'Unable to reach GitHub. Check your internet connection and try again.') throw new Error(`unexpected network message: ${noNetwork}`)

const missingManifest = getUpdateErrorMessage(new Error('Cannot find latest.yml in the latest release artifacts: HttpError: 404'))
if (missingManifest !== 'This Yira release is missing update information. Try again later or download the latest version from GitHub Releases.') throw new Error(`unexpected manifest message: ${missingManifest}`)

const authorization = getUpdateErrorMessage(new Error('HttpError: 403'))
if (authorization !== 'GitHub could not authorize the update check. Try again later.') throw new Error(`unexpected authorization message: ${authorization}`)

const invalidMetadata = getUpdateErrorMessage(new Error('Cannot parse latest.yml'))
if (invalidMetadata !== 'GitHub returned invalid update information. Try again later.') throw new Error(`unexpected metadata message: ${invalidMetadata}`)

const fallback = getUpdateErrorMessage(new Error('unexpected upstream failure'))
if (fallback !== 'Unable to check for updates right now. Try again later.') throw new Error(`unexpected fallback message: ${fallback}`)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jiti src/main/updateErrorMessage.test.ts`

Expected: FAIL because `./updateErrorMessage` does not exist.

- [ ] **Step 3: Implement the minimal classifier**

```ts
export function getUpdateErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const normalizedMessage = message.toLowerCase()

  if (/enotfound|eai_again|econnrefused|enetunreach|network error/.test(normalizedMessage)) {
    return 'Unable to reach GitHub. Check your internet connection and try again.'
  }
  if (normalizedMessage.includes('latest.yml') && /httperror:\\s*404|status(?:code)?\\s*[:=]?\\s*404/.test(normalizedMessage)) {
    return 'This Yira release is missing update information. Try again later or download the latest version from GitHub Releases.'
  }
  if (/httperror:\\s*(401|403)|status(?:code)?\\s*[:=]?\\s*(401|403)/.test(normalizedMessage)) {
    return 'GitHub could not authorize the update check. Try again later.'
  }
  if (/parse|invalid.*(yml|yaml|update)|malformed/.test(normalizedMessage)) {
    return 'GitHub returned invalid update information. Try again later.'
  }
  return 'Unable to check for updates right now. Try again later.'
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx jiti src/main/updateErrorMessage.test.ts`

Expected: exits with status 0.

### Task 2: Use the classifier in updater events

**Files:**
- Modify: `src/main/updater.ts:1-4`
- Modify: `src/main/updater.ts:48-50`
- Modify: `src/main/updater.ts:97-103`

- [ ] **Step 1: Import the classifier and remove the raw-message helper**

```ts
import { getUpdateErrorMessage } from './updateErrorMessage'
```

Delete `getErrorMessage`; it copies untrusted updater text into the renderer.

- [ ] **Step 2: Log the original error and send the classified message**

```ts
function handleUpdateError(error: unknown): void {
  console.error('Yira update error:', error)
  setUpdateState({
    status: 'error',
    progressPercent: null,
    message: getUpdateErrorMessage(error),
  })
}
```

- [ ] **Step 3: Re-run the focused classifier test**

Run: `npx jiti src/main/updateErrorMessage.test.ts`

Expected: exits with status 0.

- [ ] **Step 4: Run the TypeScript check**

Run: `npx tsc --noEmit`

Expected: exits with status 0 and produces no files.

- [ ] **Step 5: Manually verify a packaged Windows build**

Trigger a check with no internet, then against a release missing `latest.yml`.

Expected: Settings shows the classified message; the app remains usable; raw error details appear only in the main-process log.
