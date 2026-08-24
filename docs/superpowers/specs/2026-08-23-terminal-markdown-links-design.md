# Terminal Markdown Links Design

## Goal

Detect workspace Markdown paths printed in a terminal. Open the referenced
file in a Markdown file tile when the user selects the path.

## Scope

- Support `.md` and `.markdown` extensions without case sensitivity.
- Support workspace-relative paths, `./` paths, quoted paths with spaces,
  inline-code backticks, and optional `:line` or `:line:column` suffixes.
- Resolve normal local-terminal paths from the workspace root.
- Resolve resumed agent-terminal paths from `tile.agent.cwd` when available.
- Do not create local file links in remote SSH terminals.
- Do not add shell integration, runtime CWD tracking, absolute-path support,
  or source-line navigation.
- Do not register Markdown links when the active workspace has no root folder.

## Interaction

- A left click on a detected Markdown path opens the file in a `files` tile.
- A new Markdown file tile starts in `preview` mode.
- An existing file tile keeps its selected Markdown mode.
- A right click on a detected Markdown path offers `Open in Markdown tile`
  and `Copy path`.
- Existing HTTP and HTTPS link behavior does not change.
- A right click outside a link keeps the standard terminal context menu.

## Architecture

Add a renderer utility that detects and normalizes Markdown path candidates.
The utility also exposes an xterm `ILinkProvider`. The provider maps text
indexes to xterm buffer cells and emits actionable link ranges.

`TerminalTile` registers the provider beside `WebLinksAddon`. It stores a
typed hover target for either a web URL or a Markdown file. Markdown
activation calls the existing file-tile opening callback with `preview` as
the requested initial view.

The file-open callback accepts an optional Markdown view. The option travels
through attached and detached tile navigation. `openFileTile` continues to
read and validate the file through the existing restricted files IPC. It
continues to focus an existing tile or reuse one clean temporary tile.

The main process validates each detached navigation request. It forwards a
Markdown view only for file navigation and only when the value is `edit`,
`preview`, or `live`. Browser navigation cannot carry a file view.

The detached renderer builds file navigation through a pure shared helper.
Tests cover request construction and main-process normalization as one data
flow without starting Electron windows.

## Path Rules

- Convert backslashes to `/`.
- Remove matching single quotes, double quotes, or one pair of backticks.
- Remove a final `:line` or `:line:column` suffix.
- Join relative paths to a normalized workspace-relative base directory.
- Collapse `.` segments.
- Collapse safe `..` segments. Reject a path that moves above the workspace
  root.
- Reject control characters, URL protocols, root-relative paths, Windows
  drive paths, UNC paths, and non-Markdown extensions.
- Exclude HTTP and HTTPS URLs that end in `.md` so the web-link provider keeps
  ownership of them.

## Error Handling

File access remains in the main process. The existing file IPC rejects
absolute paths, path traversal, external symlinks, and invalid files. A failed
activation must not change terminal data or existing tiles. Activation and
clipboard promise rejections are caught and logged.

## Verification

- Unit tests cover candidate extraction, normalization, unsafe inputs,
  xterm ranges, hover state, and left-click activation.
- Context-menu tests cover web and Markdown targets.
- File lifecycle tests cover requested preview mode and preservation of an
  existing mode.
- Run focused tests, `npm test`, `npx tsc --noEmit`, and `npm run build`.
- `npm test` must include every new or modified feature test in its required
  gate.
- Manually verify local-terminal, agent-terminal, detached-terminal, and web
  URL behavior with `npm run dev`.
