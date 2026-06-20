# Update Error Messages Design

## Goal

Replace raw `electron-updater` failures in the Settings update panel with concise,
actionable English messages while retaining the original error in the main-process
log for diagnosis.

## Scope

`src/main/updater.ts` will classify failures raised while checking for an update or
downloading it. The renderer will continue to display `UpdateState.message` and
requires no contract change.

## Error contract

The classifier returns only these user-facing messages:

| Failure category | User-facing message |
| --- | --- |
| Network or DNS failure | `Unable to reach GitHub. Check your internet connection and try again.` |
| Timeout | Existing reason-specific timeout message |
| Missing GitHub update manifest (`latest.yml`, HTTP 404) | `This Yira release is missing update information. Try again later or download the latest version from GitHub Releases.` |
| HTTP 401 or 403 | `GitHub could not authorize the update check. Try again later.` |
| Invalid update metadata | `GitHub returned invalid update information. Try again later.` |
| Unknown failure | `Unable to check for updates right now. Try again later.` |

The original error is logged through `console.error` in the Electron main process;
it is never copied into `UpdateState.message`.

## Design

Extract a pure classifier into `src/main/updateErrorMessage.ts`. It accepts
`unknown`, safely derives an error message, recognizes network codes/messages and
HTTP/update-manifest patterns, and falls back to the generic message. This keeps
the Electron event wiring in `updater.ts` small and lets the classification run in
a focused `jiti` test without starting Electron.

`handleUpdateError` will use the classifier and log the original value. Both the
promise rejection from `checkForUpdates()` and the updater's `error` event already
flow through this handler, so the behavior applies consistently to check and
download failures.

## Non-goals

- Repair the already incomplete `v0.1.23` release artifact.
- Change update transport, GitHub publishing, or UI layout.
- Expose technical errors, URLs, headers, stack traces, or authentication details
  in the renderer.

## Verification

Use a dedicated test script for network, missing-manifest, authorization, invalid
metadata, and fallback classification. Run it with `npx jiti`, then run
`npx tsc --noEmit`. Manual verification in a packaged Windows build remains
necessary to exercise `electron-updater` itself.
