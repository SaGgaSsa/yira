# Claude Status-Line Usage Discovery Design

## Goal

Show Claude subscription usage in Yira by reading status-line payload files that an existing Claude Code status-line command already writes, without changing Claude settings or writing new cache files.

## Scope

- Yira reads candidate JSON files from `~/.claude/statusline/`.
- Each file is a raw Claude Code status-line payload and is named by session, such as `<session_id>.json`.
- Yira chooses the most recently modified valid payload with usable `rate_limits` data.
- The selected file's modification time is the capture time used for Yira's existing five-minute freshness rule.
- Yira retains only the normalized 5-hour and weekly values in memory. It never exposes, copies, or persists other payload fields.
- If the directory is absent, unreadable, contains invalid data, or has only stale payloads, Claude usage is unavailable.

## Non-goals

- Do not create, replace, wrap, or otherwise modify `~/.claude/settings.json` or its `statusLine` command.
- Do not create a Yira-owned Claude usage cache.
- Do not clean, rename, or delete files in `~/.claude/statusline/`; they are owned by the user's status-line script.
- Do not associate usage with a particular Yira workspace. Claude rate limits are account-global, so the newest valid payload is the correct global source.

## Architecture

Replace the current Claude reader's dependency on `~/.yira/claude-usage.json` with a passive status-line payload reader. The reader scans only regular `.json` files directly under `~/.claude/statusline`, in descending modification-time order. For each candidate, it parses the file through the existing safe Claude payload normalizer using that file's modification time. It returns the first snapshot that contains at least one complete rate-limit window and is fresh.

`AgentUsageService` continues to poll once per minute and keeps the existing renderer contract unchanged. The renderer's unavailable state remains the outcome when no recent valid payload exists.

## Settings UI

Remove the Claude usage status-line Configure and Uninstall controls. The application no longer owns Claude's status-line configuration, so displaying those controls would imply an action that Yira deliberately does not take.

## Errors and Safety

Filesystem errors, malformed JSON, unsupported payload shapes, temporary files, missing rate-limit fields, and stale files are non-fatal and result in unavailable usage if no later candidate succeeds. No raw payload content is logged or forwarded across the main-process boundary.

## Testing

Add focused tests for selecting the newest valid fresh payload, falling back when the newest candidate is invalid or stale, ignoring non-JSON and non-file entries, and returning unavailable when the directory is absent. Update IPC/UI coverage to assert that status-line installation controls are no longer exposed. Retain existing normalization and usage-service tests.
