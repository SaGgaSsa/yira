# Linux .deb background update design

## Goal

Install a downloaded Linux `.deb` update without freezing Yira's Electron main
process, then relaunch Yira automatically when the package manager succeeds.

## Problem

`electron-updater` 6.8.3 installs Debian packages through a synchronous
`spawnSync` call to `pkexec ... dpkg -i`. The call blocks the Electron event
loop until `dpkg` returns. On the affected machine this takes about nine
seconds after authorization, so GNOME reports the still-visible Yira window as
not responding before the updater can quit it.

The downloaded file is available in the supported `UpdateDownloadedEvent` as
`downloadedFile`; Yira must retain that exact path rather than inferring a
file name from the updater cache.

## Chosen design

For installed Linux `.deb` builds, Yira will replace the direct
`autoUpdater.quitAndInstall()` call with a detached, unprivileged launcher.
The launcher is packaged with the application, is executed as the current
desktop user, and receives only the verified downloaded `.deb` path.

The launcher will:

1. Run `pkexec --disable-internal-agent /usr/bin/dpkg -i -- "$packagePath"`.
   `pkexec` and `dpkg` are direct process arguments, never a shell command
   assembled from the package path.
2. When update diagnostics are enabled, write timestamped install lifecycle
   and exit-status events to the existing diagnostics log, without recording
   the local package path. When the user has disabled diagnostics, write none.
3. On a zero exit status, `exec /usr/bin/yira` to start the newly installed
   package as the original desktop user.
4. On failure or authorization cancellation, record the sanitized failure,
   keep Yira closed, and leave the downloaded package available for a later
   retry.

The main process will save user changes through its existing close-preparation
bridge, start the launcher with `detached: true` and ignored stdio, hide the
main window, then quit. It does not wait for `pkexec` or `dpkg`.

Windows and AppImage builds retain their existing `electron-updater`
`quitAndInstall` behavior.

## Lifecycle and failure handling

```
Yira: downloaded .deb
  -> prepare unsaved renderer state
  -> start detached user launcher
  -> hide window and quit immediately
launcher: pkexec -> dpkg
  -> success: exec /usr/bin/yira
  -> error/cancel: log outcome and exit
```

If the launcher cannot be started, Yira stays open and surfaces an update
error. This means the user never loses their current session for an update
that could not be handed off. If close preparation is cancelled, the launcher
is not started.

## Security constraints

- The elevated command is fixed to `/usr/bin/dpkg -i -- <downloaded file>`;
  no `bash -c`, user-writable script, or interpolated command string is used.
- The launcher runs unprivileged and is loaded from the installed application
  resources, not copied to a user-writable cache before it is run.
- Yira only passes the file path received in `UpdateDownloadedEvent`; it checks
  that it is an absolute `.deb` regular file before starting the launcher.
- Diagnostics must contain event categories, status codes, and versions only;
  they must not persist local file paths or authorization output.
- The main process passes the current diagnostics-enabled value to the
  launcher; the launcher treats every value other than the explicit enabled
  flag as disabled.

## Components

- `src/main/linuxDebUpdateLauncher.ts`: validates the downloaded artifact,
  creates the detached launcher process, and converts failures into safe
  update states/diagnostics.
- `resources/linux-deb-update-launcher.mjs`: unprivileged detached process
  that starts `pkexec`, waits for `dpkg`, writes lifecycle events, and relaunches
  `/usr/bin/yira` on success.
- `src/main/updater.ts`: retains `event.downloadedFile`, routes only packaged
  Linux `.deb` installations to the launcher, and leaves other platforms on
  the existing updater path.
- Update diagnostics: adds sanitized handoff, launcher, installer, and
  relaunch events.

## Verification

- Unit tests cover artifact validation, platform routing, detached process
  arguments, launcher success, authorization cancellation, installer failure,
  and relaunch behavior.
- `npx tsc --noEmit` and `npm test` pass.
- Build a Linux `.deb` with `npm run dist:linux`; inspect the package to verify
  the launcher is included.
- Manually update an installed older build: after confirming the restart,
  Yira's window must disappear immediately, Polkit must appear if needed, and
  Yira must relaunch at the new version with no GNOME unresponsive dialog.

