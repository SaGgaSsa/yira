# Terminal link actions design

## Goal

Make URLs printed in every Yira terminal interactive, independently of the
underlying shell or connection. A normal click opens the URL in the system
browser. A right click opens actions for using the URL inside or outside Yira.

## Scope

The feature applies to terminal output rendered by xterm, including local Bash,
WSL, PowerShell, and SSH sessions. It does not change shell configuration,
terminal input, or browser tile navigation.

## Interaction

- Left-clicking a detected HTTP or HTTPS URL opens it through the existing
  `shell:openExternal` bridge.
- Right-clicking a detected URL opens a context menu with these actions:
  - **Open in Browser tile** creates a browser tile in the active workspace,
    initialized with the clicked URL.
  - **Open externally** opens the URL through the system browser.
  - **Copy URL** writes the URL to the clipboard.
- Right-clicking anywhere else retains the terminal context menu: Copy, Paste,
  Select All, and notification controls.

## Architecture and data flow

`TerminalTile` loads xterm's official web-links addon when it creates a
terminal. The addon detects URLs in terminal output and invokes callbacks for
left-click activation and hover behavior.

The terminal context-menu handler determines whether its coordinates overlap a
detected URL. It stores that URL with the menu position. URL-aware menu actions
either call existing preload bridges (external open and clipboard) or add a
browser `TileState` to the active canvas workspace. The browser URL uses the
same normalization utility as a browser tile's address bar.

The link interaction logic is kept in a small renderer utility so URL detection
and menu selection can be unit tested without a live xterm instance.

## Error handling

Only web URLs accepted by the link addon are actionable. Failed external-open
or clipboard calls are caught and logged, leaving the terminal usable. If a
browser tile cannot be created, no terminal data or existing tiles are changed.

## Verification

- Unit tests cover URL selection for context menus and construction of browser
  tile input.
- TypeScript validation passes with no emitted output.
- Manual verification checks a printed URL in local Bash and one non-local
  terminal profile when available: left click opens externally; right click
  exposes all three URL actions; non-link right click retains existing actions.
