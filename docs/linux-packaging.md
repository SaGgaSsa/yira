# Linux packaging

## Implemented package policy

The Debian package configures `/opt/Yira/chrome-sandbox` as `root:root` with mode `4755`. This provides Chromium's secure SUID sandbox fallback when unprivileged user namespaces are unavailable. Installation stops with an error if the `/opt/Yira` mount uses `nosuid`.

The AppImage launcher checks whether unprivileged user namespaces are available before starting Electron. It exits with a Yira-specific message and recommends the `.deb` when they are unavailable. It does not use `--no-sandbox`. The AppImage runtime reports missing FUSE before the Yira launcher can start.

## Clean-host verification

Verify each release on fresh Ubuntu 22.04, 24.04, and 26.04 installations as a normal desktop user. Do not use `--no-sandbox`.

Install the `.deb` with APT. Confirm that the package is installed and configured, `/opt/Yira/chrome-sandbox` is `4755 root:root`, and the mount containing `/opt/Yira` does not use `nosuid`. Start Yira from the desktop menu and a terminal. Repeat the installation with a newer `.deb` to check upgrades.

For the AppImage, confirm that FUSE is installed, `/dev/fuse` exists, and unprivileged user namespaces work. Start the AppImage as a normal user. When user namespaces are blocked, confirm that the launcher displays its secure-sandbox message and recommends the `.deb`.

## AppImage requirements

The host must provide FUSE and an accessible `/dev/fuse` device to mount the AppImage. The host must also allow unprivileged user namespaces for Yira's Chromium sandbox. The AppImage cannot use the setuid helper safely from its mounted image. Use the `.deb` when the host blocks user namespaces. The `.deb` is the recommended package for those hosts.
