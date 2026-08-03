# Update Diagnostics Design

## Goal

Provide an opt-in local diagnostic trail for Yira's update flow so a support
investigation can determine whether an update check, download, installation
request, Polkit authorization, package-manager invocation, application quit,
or restart failed.

## Current delivery

The current delivery is deliberately main-process-only. It persists and reads
the preference, writes the bounded log, and traces updater boundaries. The
Settings UI toggle and open-folder action described below are deferred work;
for this investigation, diagnostics are enabled manually in `settings.json`.

## Scope

This feature records only update-related activity. It does not record terminal
content, workspace data, user commands, clipboard contents, credentials, or
other general application activity.

## User experience

The planned `Settings > Advanced` panel will contain an **Update diagnostics** checkbox. It is
off by default and persists in the existing user settings file. Enabling it
takes effect immediately and remains enabled for the next application launch,
so it can capture the startup update check. Disabling it takes effect
immediately and stops future writes without deleting existing diagnostic data.

The same panel displays the local log location and provides an **Open log
folder** action. The action opens the directory in the operating system's file
manager; it never exposes Node access to the renderer.

## Storage and retention

The main process owns all file writes. When diagnostics are enabled it writes
newline-delimited JSON records to:

`~/.yira/logs/updater.log`

The actual base directory remains `YIRA_HOME`, so the existing `YIRA_HOME`
environment override is honored in development and tests. The writer retains
at most two files: `updater.log` and `updater.previous.log`. Before appending a
record that would make the active file exceed 512 KiB, it replaces the previous
file with the active file and begins a new active file. Failures to create,
rotate, or append the diagnostic log must not interrupt checking for or
installing an update; they are reported to the existing main-process console
only.

## Recorded events

Each record contains an ISO timestamp, an event name, the installed Yira
version, and only event-specific metadata necessary for diagnosis. The event
set covers:

- diagnostic logging enabled or disabled;
- update check requested, with `startup` or `manual` source;
- updater events: checking, update available, no update available, download
  progress, update downloaded, and updater error;
- installation IPC requested, including whether the current state was eligible
  for installation;
- `quitAndInstall` requested;
- updater-library messages relevant to package-manager execution, including
  the selected package manager, Polkit command start, process result, and
  library error;
- application `before-quit`, `will-quit`, and `quit` lifecycle events after a
  downloaded update exists.

Version values, update state, rounded progress, safe updater error category,
and package-manager exit status may be recorded. Raw error text, absolute file
paths, release URLs, environment variables, command arguments, and any secret
or credential data must not be written. The main process converts updater log
messages to event categories rather than copying their text verbatim.

## Architecture

A small main-process `updateDiagnostics` module owns the safe record schema,
preference loading, bounded file retention, and a main-process-only API for
recording events. `updater.ts` calls it at every updater and installation
boundary, including the no-op guard that currently returns when installation is
requested before an update is downloaded.

The existing settings contract gains a top-level
`updateDiagnosticsEnabled: boolean` field. Its normalizer defaults missing or
invalid values to `false`, allowing existing settings files to migrate without
user action. A dedicated, safe preload/IPC surface immediately synchronizes a
toggle to the main process and opens the fixed diagnostics directory. The
renderer settings store persists the option through the existing settings save
path.

At startup the main process reads the persisted preference before the delayed
update check. This avoids relying on the renderer's asynchronous settings load
and ensures an enabled option captures the first update event.

## Error handling and privacy

The visible update status remains concise and does not receive raw process
errors. Diagnostic logging is best-effort: all file-system failures are caught
and never change updater state or prevent installation. Toggling the setting
is similarly best-effort for logging but remains persisted through the normal
settings mechanism.

No log file is created while diagnostics are disabled. Existing diagnostic
files are retained after disabling so they can be inspected, and are replaced
only by the bounded rotation policy after diagnostics is enabled again.

Before `quitAndInstall`, the main process waits up to 250 ms for the request
marker to reach disk. Updater-library messages emitted during the synchronous
installer command, including the Polkit command marker, remain best-effort:
the process must not be held open indefinitely merely to finish diagnostics.

## Testing

Focused main-process tests will use a temporary `YIRA_HOME` directory to
verify that disabled diagnostics write nothing, enabled diagnostics write only
the documented fields, rotation retains the active and previous file, and
write failures do not throw. Shared settings tests will verify the disabled
default and migration of a persisted `true` value. Updater-focused tests will
verify that an installation request records both the eligible and no-op paths
without exposing command text.

Renderer tests will cover persistence of the toggle through the existing store
only if the project's current test harness can exercise it without a browser;
otherwise TypeScript validation and a manual settings verification cover the
small UI wiring.

## Manual verification

On a native Linux `.deb` install, add the following field to
`~/.yira/settings.json`, preserving the other settings, then restart Yira:

```json
{
  "updateDiagnosticsEnabled": true
}
```

Make an update available. Confirm that `~/.yira/logs/updater.log` records
the startup check, download completion, install button request, and Polkit
launch. Repeat from the Settings modal, then inspect the same file after a
normal quit to confirm whether the application reached the install path.
