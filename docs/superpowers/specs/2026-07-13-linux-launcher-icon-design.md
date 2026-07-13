# Linux launcher icon design

## Context

Yira is packaged for Linux as both a Debian package and an AppImage. The
installed Debian package already places `yira.png` in the `hicolor` icon
theme, and its generated desktop entry is valid. Electron Builder currently
derives `StartupWMClass=Yira` from `productName`, while the main process sets
the same application name before it creates any windows.

The Linux metadata is currently implicit. A future product-name or Electron
Builder change could therefore change the generated desktop entry without a
regression test detecting it.

## Goal

Make the icon source and window-class association explicit in the Linux build
configuration, and protect those values with the existing packaging test.

## Design

Add `build.linux.icon` with `resources/icon.png` and add
`build.linux.desktop.StartupWMClass` with `Yira` in `package.json`.
Electron Builder applies `linux.desktop` fields to the desktop entries used by
both the Debian and AppImage targets. The existing production code remains the
source of the runtime identity: it calls `app.setName('Yira')` before creating
windows.

Extend `scripts/linux-packaging.test.mjs` to require those two explicit
configuration values. This is a configuration-level regression test: it
prevents the metadata required for shell association from being silently
removed or renamed.

## Non-goals

- Do not change the application's runtime icon or Electron window setup.
- Do not add first-run self-installation for AppImages.
- Do not modify the user's host desktop files.

A standalone AppImage is not automatically registered with the host desktop.
For it to appear as a persistent Ubuntu launcher, the user must integrate it
with a tool such as AppImageLauncher or create a desktop entry. The embedded
metadata benefits an AppImage once it is integrated, but cannot register it
from inside the image without host-side changes.

## Verification

Run the Linux packaging test script and TypeScript's no-emit type check. On
native Linux, also create Linux artifacts and inspect their desktop entries
when practical.
