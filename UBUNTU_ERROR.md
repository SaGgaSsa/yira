# Ubuntu 26.04 Linux package investigation

## Purpose

This document records the reported Linux packaging failure so the investigation
can continue on the Ubuntu machine where it reproduces. It is a handoff, not a
claim that the root cause has already been proven.

## Reported environment

- Product: Yira `v0.1.32`
- Distribution: Ubuntu 26.04 LTS (reported)
- Architecture: expected `x64`; confirm below.
- Artifacts tried: `Yira-0.1.32-x64.AppImage` and
  `Yira-0.1.32-amd64.deb` (confirm their exact filenames and checksums).

## Reported symptoms

1. The AppImage initially requested FUSE. Installing `libfuse2t64` addressed
   that prerequisite.
2. Starting the AppImage then failed in Chromium/Electron's Linux sandbox. The
   reported message says that `chrome-sandbox` must be owned by `root` and have
   mode `4755` (wording may include `setuid_sandbox_host.cc`).
3. Installing the `.deb` produced Ubuntu 26.04 dependency/package-manager
   errors. Afterwards the application did not appear in the graphical software
   manager, so it may be unpacked or only partially configured in `dpkg`.
4. Retrying both artifacts reportedly leads to the same sandbox-helper failure.

Do not treat `--no-sandbox` as a production workaround. It disables an
Electron/Chromium security boundary and is useful only as a diagnostic control.

## What the repository currently does

- `package.json` uses Electron `^33.2.0` and electron-builder `^25.1.0`.
- Linux output targets are `AppImage` and `deb`, for `x64` only.
- The release workflow builds Linux artifacts on `ubuntu-22.04`, not Ubuntu
  26.04.
- Yira has no custom Linux post-install script or explicit `chrome-sandbox`
  policy. `webPreferences.sandbox: false` in the app's BrowserWindow is a
  renderer setting; it does not disable or configure Chromium's Linux process
  sandbox.
- electron-builder's default Debian post-install template runs `unshare --user
  true`. If that succeeds it sets `/opt/Yira/chrome-sandbox` to `0755`; if it
  fails it sets it to `4755`.

The last point needs particular scrutiny: Debian post-install scripts run as
root, while the application runs as an unprivileged desktop user. A successful
root-side namespace probe does not prove that the desktop user may create an
unprivileged user namespace under Ubuntu 26.04 policy.

## Working hypotheses

These are hypotheses to test, not conclusions.

### H1: Ubuntu blocks the AppImage's user-namespace sandbox

An AppImage cannot reliably use a root-owned, setuid `chrome-sandbox` helper
from its FUSE-mounted image. It normally relies on the unprivileged
user-namespace sandbox. If Ubuntu blocks that capability for the desktop user,
Electron falls back to the SUID helper and aborts because that helper cannot be
valid there.

### H2: The Debian package was never configured successfully

If package dependencies prevented `dpkg` configuration, the default
post-install script may not have run. In that case `/opt/Yira/chrome-sandbox`
can remain non-setuid and fail with the same Chromium error.

### H3: The default Debian post-install probe is insufficient on Ubuntu 26.04

Even if the `.deb` did configure, its root-side `unshare` check can choose mode
`0755` although the application user is subject to Ubuntu's unprivileged
namespace restrictions. Then neither available Electron sandbox mechanism is
usable.

## Evidence to collect on the failing machine

Run these commands as the normal desktop user and paste the complete output
into the continuation session. They are diagnostic and do not alter installed
files.

```bash
uname -a
dpkg --print-architecture
grep -H . /proc/sys/kernel/apparmor_restrict_unprivileged_userns \
  /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || true
unshare --user --map-root-user true && echo 'user namespaces: OK' || echo 'user namespaces: BLOCKED'

dpkg -s yira 2>&1 | sed -n '1,80p'
dpkg-query -W -f='${db:Status-Abbrev} ${Package} ${Version}\n' 'yira*' 2>&1
stat -c '%a %U:%G %n' /opt/Yira/chrome-sandbox 2>&1
```

Also preserve the exact error from both launches, including every line before
and after `setuid_sandbox_host.cc` or `chrome-sandbox`.

To inspect the AppImage without launching Yira, use a disposable directory:

```bash
mkdir -p /tmp/yira-appimage-inspect
cd /tmp/yira-appimage-inspect
/path/to/Yira-*.AppImage --appimage-extract
stat -c '%a %U:%G %n' squashfs-root/chrome-sandbox 2>&1
```

To inspect the `.deb` metadata before repairing or reinstalling it:

```bash
dpkg-deb -I /path/to/Yira-*.deb
dpkg-deb -c /path/to/Yira-*.deb | grep -E 'chrome-sandbox|DEBIAN'
```

## Package-state recovery

Do this only after preserving the original error output. It repairs the local
package database; it does not solve the underlying sandbox compatibility.

```bash
sudo dpkg --configure -a
sudo apt --fix-broken install
dpkg-query -W -f='${db:Status-Abbrev} ${Package} ${Version}\n' 'yira*'
```

If `yira` remains inconsistent and must be removed before a clean retry:

```bash
sudo apt purge yira
sudo dpkg --purge --force-remove-reinstreq yira
sudo apt --fix-broken install
```

Capture any unmet-dependency output verbatim. Do not guess replacement package
names from another Ubuntu release.

## Permanent solution candidates

Do not implement one until the evidence above distinguishes H1, H2, and H3.

1. **Make the Debian package's helper policy compatible with Ubuntu 26.04.**
   Add an explicit Debian post-install policy that leaves
   `/opt/Yira/chrome-sandbox` owned by `root:root` and mode `4755` when the
   target's unprivileged user namespaces are restricted. Preserve the normal
   desktop entry and command registration performed by electron-builder. Test
   as a non-root desktop user after a clean install and after an update.
2. **Treat AppImage separately.** It cannot depend on a setuid helper inside a
   mounted AppImage. Support it only where unprivileged user namespaces work,
   or offer a tested alternative package for Ubuntu 26.04 (a corrected `.deb`,
   Flatpak, or Snap). Do not silently launch it with `--no-sandbox`.
3. **Update the release validation matrix.** Build and launch-test the `.deb`
   and AppImage on Ubuntu 22.04, 24.04, and 26.04 as a normal user. The test
   must check helper ownership/mode, user namespace availability, installation
   success, and a launch without sandbox-disabling flags.

## Implemented package policy

The next release must use a custom Debian post-install script instead of the
electron-builder default user-namespace probe. The script always configures the
installed helper as `root:root` with mode `4755`. This preserves the normal
user-namespace sandbox where it works and makes the secure SUID fallback
available where it does not.

The installer validates the helper metadata and the mount containing
`/opt/Yira`. If that mount uses `nosuid`, installation fails with a Yira-specific
error. A `nosuid` filesystem cannot run Chromium's secure SUID fallback, so a
successful-looking installation would be misleading.

The AppImage has a different constraint: its mounted image cannot safely supply
that SUID fallback. Its launcher now tests unprivileged user namespaces before
starting Electron. If they are unavailable, it exits with a Yira-specific
message recommending the `.deb`; it never uses `--no-sandbox`. If FUSE itself
is unavailable, the AppImage runtime fails before Yira's launcher can run and
reports the missing FUSE setup directly.

## Clean-host release verification

Perform these checks on fresh Ubuntu 22.04, 24.04, and 26.04 installations as
the normal desktop user. Do not run Yira with `--no-sandbox`.

### Debian package

Install with APT so dependencies are resolved by the package manager:

```bash
sudo apt install ./Yira-<version>-amd64.deb
dpkg-query -W -f='${db:Status-Abbrev} ${Package} ${Version}\n' yira
stat -c '%a %U:%G %n' /opt/Yira/chrome-sandbox
findmnt -no TARGET,OPTIONS -T /opt/Yira
```

Expected results:

- `yira` is `ii` (installed and configured).
- `/opt/Yira/chrome-sandbox` is `4755 root:root`.
- The mount options do not include `nosuid`.

Start `yira` from the desktop menu and from a terminal as the normal user. It
must open without a Chromium sandbox error. Repeat the same procedure by
installing a newer `.deb` over the existing package to validate upgrades.

### AppImage

Before launch, verify the two host prerequisites:

```bash
if apt-cache show libfuse2t64 >/dev/null 2>&1; then
  dpkg-query -W -f='${db:Status-Abbrev} ${Package} ${Version}\n' libfuse2t64
else
  dpkg-query -W -f='${db:Status-Abbrev} ${Package} ${Version}\n' libfuse2
fi
test -c /dev/fuse && echo 'FUSE device: OK' || echo 'FUSE device: MISSING'
unshare --user --map-root-user true && echo 'user namespaces: OK' || echo 'user namespaces: BLOCKED'
```

If FUSE support is absent, use the package name supplied by that Ubuntu release:

```bash
if apt-cache show libfuse2t64 >/dev/null 2>&1; then
  sudo apt install libfuse2t64
else
  sudo apt install libfuse2
fi
```

Ubuntu 22.04 uses `libfuse2`; newer releases may provide `libfuse2t64`.
If `/dev/fuse` is missing, repair the host FUSE setup; an AppImage cannot mount
without it. If user namespaces are blocked, launch the AppImage once and verify
that it prints the Yira-specific secure-sandbox message and recommends the
`.deb`. That is an expected compatibility diagnostic, not a reason to disable
the Chromium sandbox.

## Relevant repository files

- `package.json` — Electron/electron-builder versions and Linux targets.
- `.github/workflows/windows-release.yml` — the Linux release job currently
  uses `ubuntu-22.04`.
- `src/main/index.ts` and `src/main/ipc/floatingTiles.ts` — renderer sandbox
  settings; these are not the Linux helper configuration.
- `node_modules/app-builder-lib/templates/linux/after-install.tpl` — local
  electron-builder default post-install behavior, useful for comparison only;
  do not edit `node_modules`.

## Git handoff snapshot

At the time this document was created, `main` was clean and matched
`origin/main` at `416ea22` (`release: v0.1.32`). The following local branches
were not part of this packaging investigation and should not be pushed or
merged incidentally:

- `feat/grid-dynamic-drag` — already contained by `main`; stale local branch.
- `feat/remote-ssh-terminal` — already contained by `main`; active worktree at
  `/tmp/yira-remote-ssh-terminal` but no unpublished commit.
- `feat/note-templates-tasks` — one unpublished commit (`45f9683`) on an old
  base; needs separate review/rebase.
- `feature/workspace-root-open-folder` — one unpublished commit (`7461bd5`) on
  an old base; needs separate review/rebase.

Only the documentation commit containing this file should be pushed to `main`
for the other machine to retrieve it.
