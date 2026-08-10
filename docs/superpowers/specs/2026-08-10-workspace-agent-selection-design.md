# Workspace agent selection

## Goal

Make the Agents panel a workspace-scoped viewer for one explicitly selected
provider. The workspace decides whether Claude Code or Codex supplies its
running-session and local-history data.

## Configuration and migration

- Replace the workspace's independently enabled provider settings with one
  optional `agentProvider` selection (`claude` or `codex`).
- Keep provider-specific launch arguments only as compatibility data; the
  Agents panel no longer launches new sessions.
- Normalize existing workspaces without an explicit selection to
  `agentProvider: undefined`, even when their legacy provider settings enabled
  both CLIs. This prevents silently choosing a provider or exposing data until
  the user makes that choice.
- Workspace creation and editing present a single-choice control. No provider
  selected is valid.

## Agents panel

- Remove the New agent session section and its provider availability controls.
- Remove the Workspace / All local scope selector. All history requests include
  the active workspace root and are therefore workspace-scoped.
- When no provider is selected, do not subscribe to running sessions or query
  history. Instead show an empty-state explanation and a direct action that
  opens workspace configuration.
- When a provider is selected, show only its running sessions and its history.
  Search, refresh, session focus, and resume remain available.

## Data flow and error handling

- The renderer derives the selected provider from the normalized workspace
  configuration and includes it in history requests.
- Main-process history validation continues to restrict requests to recognised
  providers and the provided workspace root.
- An unavailable CLI does not hide already discovered local history; it only
  affects functionality that needs the CLI, such as resume, using the existing
  availability checks.

## Tests

- Cover normalization of old configurations to no selected provider and
  preservation of an explicit selection.
- Cover the workspace dialog's single-provider value.
- Cover Agents-panel source behavior: no launch section or scope selector,
  provider-specific history queries, and the unconfigured empty state linking
  to workspace settings.
- Run the focused tests, `npx tsc --noEmit`, `npm test`, and `npm run build`.
