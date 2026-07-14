# Focus View Content Focus Design

## Goal

When the user opens Focus View or changes its active tile, the active tile must place keyboard focus on its primary interactive surface.

## Scope

- Terminal tiles focus the xterm input so typing is immediately sent to the PTY.
- Rich and Markdown note tiles focus their editor content.
- Browser tiles focus the rendered web page, not the address bar.
- Files tiles focus their search field.
- Timer tiles retain their existing attention behaviour and do not receive DOM focus because they have no primary text entry surface.
- The behaviour applies when entering Focus View and when switching the active Focus View tile. Hidden tiles must not receive focus.

## Architecture

Canvas derives a transient `autoFocus` flag for the visible active tile in `fullview` mode and passes it through `TileContent`. The flag changes from false to true whenever a tile becomes visible in Focus View, including when the tile was already selected before the view transition. Each tile component owns the DOM-specific focus operation for its primary surface; no IPC or Electron-main changes are needed.

## Components

- `Canvas.tsx` identifies the visible Focus View tile and forwards `autoFocus`.
- `TileContent.tsx` extends the shared content contract and routes the signal to relevant tile implementations.
- Terminal, note, browser, and files components perform their own guarded focus effect. A missing or not-yet-ready target is a no-op.

## Error Handling

Focus attempts are optional UI enhancement operations. They must not throw if a component has not mounted, a note is still loading, or a browser webview is unavailable.

## Verification

Add focused unit coverage for the Focus View activation predicate and run the TypeScript no-emit check. Manual verification should confirm immediate typing in each editable tile, active-tile switching, and that inactive hidden tiles do not steal focus.
