# Linux .deb Background Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install a downloaded Linux Debian update without blocking Electron, then automatically relaunch Yira after a successful installation.

**Architecture:** The updater retains the exact `downloadedFile` from electron-updater. A Linux `.deb` is passed to a detached unprivileged launcher, which invokes `pkexec /usr/bin/dpkg` through direct process arguments and relaunches `/usr/bin/yira` only after success. Windows and AppImage updates keep their current updater flow.

**Tech Stack:** TypeScript, Electron, Node child processes, POSIX shell, electron-builder, Node test runner, tsx.

## Global Constraints

- The privileged command is `/usr/bin/dpkg -i -- <downloaded .deb>` via `pkexec`; do not use `bash -c`, `eval`, or an interpolated package path.
- Run the launcher as the desktop user from installed resources, never from a user-writable executable cache.
- A failed handoff leaves Yira open; a successful handoff closes it without waiting for Polkit or dpkg.
- Relaunch only after a zero dpkg exit status, with `/usr/bin/yira`.
- Diagnostics may contain only safe event names, versions, and numeric exit codes; never local paths or command output. When diagnostics are disabled in Yira settings, the launcher must write no diagnostic events.
- Use 2-space indentation, single quotes, no semicolons, and trailing commas where TypeScript emits them naturally.
- Run `npx tsc --noEmit` before Linux packaging; do not run `npm run dist:win`.

---

### Task 1: Create the validated detached handoff boundary

**Files:**

- Create: `src/main/linuxDebUpdateLauncher.ts`
- Create: `src/main/linuxDebUpdateLauncher.test.ts`

**Interfaces:**

- Produces `isLinuxDebUpdatePath(filePath: string | null): Promise<boolean>`.
- Produces `startLinuxDebUpdateLauncher(input: LinuxDebUpdateLauncherInput): Promise<void>`.
- Consumes an absolute existing regular `.deb`, installed launcher path, diagnostics path, diagnostics-enabled flag, version, and optional injected `spawn`.
- Guarantees a detached direct spawn with ignored stdio; invalid input starts no process.

- [ ] **Step 1: Write the failing validation and handoff test**

Create `src/main/linuxDebUpdateLauncher.test.ts`. Create a real temporary `update.deb` with `mkdtemp` and `writeFile`. Assert the validator accepts it and rejects a relative path, directory, and `.AppImage`. Inject a fake spawn and assert:

~~~ts
await startLinuxDebUpdateLauncher({
  launcherPath: '/opt/Yira/resources/linux-deb-update-launcher.sh',
  packagePath,
  diagnosticsPath: '/home/alice/.yira/logs/updater.log',
  diagnosticsEnabled: true,
  version: '0.1.51',
  spawn: fakeSpawn,
})

assert.deepEqual(calls[0], {
  command: '/bin/sh',
  args: [
    '/opt/Yira/resources/linux-deb-update-launcher.sh', packagePath,
    '/home/alice/.yira/logs/updater.log', '1', '0.1.51', '/usr/bin/yira',
  ],
  options: { detached: true, stdio: 'ignore' },
})
~~~

Assert a non-`.deb` input rejects with `Downloaded Linux update is not a Debian package` and creates no child process.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx tsx src/main/linuxDebUpdateLauncher.test.ts`

Expected: failure because the module does not exist.

- [ ] **Step 3: Implement the minimal handoff module**

Create `src/main/linuxDebUpdateLauncher.ts`:

~~~ts
export interface LinuxDebUpdateLauncherInput {
  launcherPath: string
  packagePath: string
  diagnosticsPath: string
  diagnosticsEnabled: boolean
  version: string
  spawn?: typeof spawn
}

export async function isLinuxDebUpdatePath(filePath: string | null): Promise<boolean>
export async function startLinuxDebUpdateLauncher(input: LinuxDebUpdateLauncherInput): Promise<void>
~~~

Require an absolute lower-case `.deb` that passes `stat(filePath).isFile()`. Require an absolute launcher path. Spawn only `/bin/sh` with the six arguments from Step 1, using `'1'` only when `diagnosticsEnabled` is true, and `{ detached: true, stdio: 'ignore' }`, then call `child.unref()`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx tsx src/main/linuxDebUpdateLauncher.test.ts`

Expected: exit code 0.

- [ ] **Step 5: Commit the handoff boundary**

~~~bash
git add src/main/linuxDebUpdateLauncher.ts src/main/linuxDebUpdateLauncher.test.ts
git commit -m "feat: add detached Debian update handoff"
~~~

### Task 2: Package and test the unprivileged installer/relauncher

**Files:**

- Create: `resources/linux-deb-update-launcher.sh`
- Modify: `package.json:80-95`
- Modify: `scripts/linux-packaging.test.mjs:1-190`

**Interfaces:**

- Consumes package path, diagnostics path, diagnostics-enabled flag, Yira version, and relaunch command from Task 1.
- Produces `process.resourcesPath/linux-deb-update-launcher.sh` in installed packages.
- Guarantees success logs then execs `/usr/bin/yira`; a nonzero installer exit logs its numeric status and does not relaunch.

- [ ] **Step 1: Write the failing packaging-policy test**

Extend `scripts/linux-packaging.test.mjs` to assert `build.extraResources` contains:

~~~js
{
  from: 'resources/linux-deb-update-launcher.sh',
  to: 'linux-deb-update-launcher.sh',
}
~~~

Read the launcher and assert:

~~~js
assert.match(launcher, /pkexec --disable-internal-agent \/usr\/bin\/dpkg -i -- "\$package_path"/)
assert.match(launcher, /exec "\$relaunch_command"/)
assert.doesNotMatch(launcher, /bash -c/)
assert.doesNotMatch(launcher, /eval /)
~~~

Assert that only `linux-deb-installer-started`, `linux-deb-installer-succeeded`, and `linux-deb-installer-failed` are emitted and no `printf` output includes `$package_path`.
Also assert the `record` function starts with the exact guard
`[ "$diagnostics_enabled" = '1' ] || return 0`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test scripts/linux-packaging.test.mjs`

Expected: failure because the resource and packaging entry are absent.

- [ ] **Step 3: Add the launcher and package it**

Create executable `resources/linux-deb-update-launcher.sh`:

~~~sh
#!/bin/sh
set -u
package_path=$1
diagnostics_path=$2
diagnostics_enabled=$3
version=$4
relaunch_command=$5

record() {
  event=$1
  status=$2
  [ "$diagnostics_enabled" = '1' ] || return 0
  mkdir -p "$(dirname -- "$diagnostics_path")"
  if [ -n "$status" ]; then
    printf '{"timestamp":"%s","event":"%s","version":"%s","data":{"exitCode":%s}}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$event" "$version" "$status" >> "$diagnostics_path"
  else
    printf '{"timestamp":"%s","event":"%s","version":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$event" "$version" >> "$diagnostics_path"
  fi
}

record linux-deb-installer-started ''
pkexec --disable-internal-agent /usr/bin/dpkg -i -- "$package_path"
status=$?
if [ "$status" -ne 0 ]; then
  record linux-deb-installer-failed "$status"
  exit "$status"
fi
record linux-deb-installer-succeeded ''
exec "$relaunch_command"
~~~

Mark it executable. Add the exact resource object above to `package.json` so electron-builder copies it to the root of `process.resourcesPath`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test scripts/linux-packaging.test.mjs`

Expected: exit code 0.

Run the shell launcher once with a temporary fake `pkexec` that exits 0, a
temporary fake relaunch command that exits 0, and diagnostics argument `0`.
Assert no diagnostics file is created. Repeat with diagnostics argument `1`
and assert the file contains only the started and succeeded event names.

- [ ] **Step 5: Commit the packaged launcher**

~~~bash
git add resources/linux-deb-update-launcher.sh package.json scripts/linux-packaging.test.mjs
git commit -m "feat: add Linux update installer launcher"
~~~

### Task 3: Route downloaded Debian updates through the detached launcher

**Files:**

- Modify: `src/main/updater.ts:1-250`
- Modify: `src/main/updateDiagnostics.ts:1-190`
- Modify: `src/main/updateDiagnostics.test.ts:1-150`
- Modify: `src/main/linuxDebUpdateLauncher.test.ts`

**Interfaces:**

- Consumes `UpdateDownloadedEvent.downloadedFile`, `process.platform`, `process.resourcesPath`, `YIRA_HOME`, and `prepareToClose(): Promise<boolean>`.
- Consumes Task 1 functions.
- Produces immediate close after a successful `.deb` handoff; retains `quitAndInstall(false, true)` for other artifacts.
- Guarantees a Linux `.deb` sets `autoInstallOnAppQuit` false before electron-updater registers its quit callback; a failed launcher start does not quit Yira.

- [ ] **Step 1: Write the failing routing and diagnostics tests**

Add to `src/main/updateDiagnostics.test.ts`:

~~~ts
assert.deepEqual(getSafeUpdaterLogData('Linux Debian update launcher started'), {
  category: 'linux-deb-launcher-started',
})
assert.deepEqual(getSafeUpdaterLogData('Linux Debian update launcher failed with exit code 126'), {
  category: 'linux-deb-launcher-failed', exitCode: 126,
})
~~~

Export `shouldUseLinuxDebUpdateLauncher(platform, downloadedFile)` from `updater.ts`. In `linuxDebUpdateLauncher.test.ts`, assert it is true for Linux + `.deb`, false for Windows + `.deb`, and false for Linux + AppImage.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx tsx src/main/updateDiagnostics.test.ts && npx tsx src/main/linuxDebUpdateLauncher.test.ts`

Expected: failure because categories and routing helper are absent.

- [ ] **Step 3: Implement routing without the synchronous Debian installer**

Retain `event.downloadedFile` in a module variable. When that event is a Linux `.deb`, set `getUpdater().autoInstallOnAppQuit = false`; keep it true otherwise. After `prepareToClose()` succeeds, route a Debian file to Task 1 with:

~~~ts
{
  launcherPath: join(process.resourcesPath, 'linux-deb-update-launcher.sh'),
  packagePath: downloadedUpdateFile,
  diagnosticsPath: join(YIRA_HOME, 'logs', 'updater.log'),
  diagnosticsEnabled: updateDiagnostics.isEnabled(),
  version: app.getVersion(),
}
~~~

On a successful handoff, record `linux-deb-launcher-started` and call `app.quit()`; never call `getUpdater().quitAndInstall` in that route. On rejection, call `handleUpdateError(error)` and return without quitting. Keep the existing diagnostic flush and `quitAndInstall(false, true)` path unchanged for non-Debian artifacts. Classify only the two exact launcher messages in `updateDiagnostics.ts`; arbitrary messages remain `updater-message`.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npx tsx src/main/updateDiagnostics.test.ts && npx tsx src/main/linuxDebUpdateLauncher.test.ts`

Expected: exit code 0.

- [ ] **Step 5: Commit the updater integration**

~~~bash
git add src/main/updater.ts src/main/updateDiagnostics.ts src/main/updateDiagnostics.test.ts src/main/linuxDebUpdateLauncher.test.ts
git commit -m "fix: hand off Debian updates before quitting"
~~~

### Task 4: Verify package contents and update behavior

**Files:**

- Verify only: files changed by Tasks 1-3.

**Interfaces:**

- Produces a tested Linux `.deb` package input and manual-update acceptance evidence.

- [ ] **Step 1: Run all automated tests**

Run: `npm test && npx tsx src/main/updateDiagnostics.test.ts && npx tsx src/main/linuxDebUpdateLauncher.test.ts`

Expected: every test exits with code 0.

- [ ] **Step 2: Run strict type validation**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Build and inspect the Linux package**

Run: `npm run build && npm run dist:linux && dpkg-deb --contents release/Yira-*.deb | rg 'linux-deb-update-launcher\\.sh'`

Expected: the launcher appears in the package resources directory.

- [ ] **Step 4: Manually verify an installed update**

Install an older `.deb`, download a newer Yira `.deb`, and choose Restart to install. Verify Yira closes immediately, Polkit appears when required, `/usr/bin/yira` reopens at the new version only after dpkg finishes, and `~/.yira/logs/updater.log` has safe launcher events with no local package path.

- [ ] **Step 5: Inspect the final change set**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; changed files are limited to the planned updater, launcher, package policy, tests, specification, and plan.

