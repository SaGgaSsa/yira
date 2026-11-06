const { existsSync } = require('node:fs')
const { chmod, rename, writeFile } = require('node:fs/promises')
const { join } = require('node:path')

const APPIMAGE_PREFLIGHT = `#!/bin/sh
set -eu

LAUNCHER=$(readlink -f "$0")
HERE=$(CDPATH= cd -- "$(dirname -- "$LAUNCHER")" && pwd)

if [ -n "\${APPIMAGE:-}" ] && ! unshare --user --map-root-user true >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Yira AppImage cannot start securely because this system does not allow unprivileged user namespaces.
Install the Yira .deb package instead, or enable user namespaces according to your system security policy.
Yira will not start with Chromium sandboxing disabled.
EOF
  exit 78
fi

exec "$HERE/yira-bin" "$@"
`

// Terminals spawn through node-pty's bundled ConPTY, so a build without it would ship with no working terminal.
async function verifyBundledConpty(appOutDir) {
  const nodePty = join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', 'node-pty')
  const nativeDirectories = ['build/Release', 'prebuilds/win32-x64'].map((directory) => join(nodePty, directory))
  for (const directory of nativeDirectories) {
    if (!existsSync(join(directory, 'conpty.node'))) continue
    for (const file of ['conpty.dll', 'OpenConsole.exe']) {
      if (!existsSync(join(directory, 'conpty', file))) throw new Error(`Missing bundled ConPTY file: ${join(directory, 'conpty', file)}`)
    }
    return
  }
  throw new Error(`Missing node-pty native module under ${nodePty}`)
}

async function afterPack(context) {
  if (context.electronPlatformName === 'win32') await verifyBundledConpty(context.appOutDir)
  if (context.electronPlatformName !== 'linux') return

  const launcherPath = join(context.appOutDir, 'yira')
  const binaryPath = join(context.appOutDir, 'yira-bin')

  await rename(launcherPath, binaryPath)
  await writeFile(launcherPath, APPIMAGE_PREFLIGHT, { mode: 0o755 })
  await chmod(launcherPath, 0o755)
}

module.exports = { afterPack }
