# Update Diagnostics Settings Design

## Goal

Keep update diagnostics enabled while Yira is being tested, and expose the
setting that controls them in the application UI.

## Behavior

- `updateDiagnosticsEnabled` defaults to `true` for newly created settings.
- Existing settings files migrate to `true` on their next load, including files
  that previously stored `false` or an invalid value. This is an intentional,
  temporary testing-mode migration.
- A persisted `updateDiagnosticsMigrationComplete` marker distinguishes that
  one-time migration from a later explicit user choice. Once a user turns the
  setting off in the UI, that `false` value is preserved on later launches.
- The Advanced settings section contains a labelled checkbox and a short
  description that diagnostics are stored locally to help investigate update
  failures.

## Components and Data Flow

`normalizeUserSettings` consumes the migration marker and sets it to complete
after applying the migration. The settings IPC writes the resulting settings
back to disk on load, and the updater uses the normalized enabled value before
it records events.

The renderer settings store gets a dedicated `setUpdateDiagnosticsEnabled`
action. The Advanced settings control invokes the action, then the existing
debounced save path writes the setting through the established preload and IPC
boundary.

## Error Handling and Privacy

Diagnostics remain best-effort: a failure to save settings or diagnostics must
not prevent Yira from checking for or installing updates. Existing diagnostic
sanitization remains unchanged; the UI does not expose file paths or event
contents.

## Tests

- Shared settings tests cover the new default, existing-install migration, and
  preservation of an explicit post-migration opt-out.
- Type checking validates the UI, translations, and IPC contracts.
