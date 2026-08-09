# Linux Launcher Icon Implementation Plan

> **For agentic workers:** Implement this plan task by task under the repository's **Plan Implementation and Luna Delegation** rules in `AGENTS.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Linux packages explicitly declare the Yira icon source and window class required for Ubuntu dock association.

**Architecture:** Electron Builder reads Linux packaging metadata from `package.json`. The main process already sets the matching runtime application name (`Yira`), so the change adds explicit Linux-only `icon` and desktop-entry metadata without altering runtime code. The existing Node test script verifies the configuration contract.

**Tech Stack:** Electron Builder 25, Node.js built-in test runner, TypeScript.

## Global Constraints

- Use `resources/icon.png` as the Linux icon source.
- Use `Yira` as `StartupWMClass`, matching `app.setName('Yira')` in `src/main/index.ts`.
- Do not self-install desktop entries from a direct AppImage launch.
- Run Linux package builds only on native Linux; this environment is native Linux.

---

### Task 1: Lock the Linux desktop metadata contract

**Files:**
- Modify: `scripts/linux-packaging.test.mjs:31-41`
- Modify: `package.json:103-124`
- Test: `scripts/linux-packaging.test.mjs`

**Interfaces:**
- Consumes: `package.json.build.linux`, parsed by `readPackageJson()`.
- Produces: Explicit Electron Builder metadata used by both `deb` and `AppImage` Linux targets.

- [ ] **Step 1: Write the failing test**

Add these assertions to the existing `configures the Linux after-pack hook and Debian installer script` test, before the AppImage assertions:

```js
  assert.equal(packageJson.build.linux.icon, 'resources/icon.png')
  assert.deepEqual(packageJson.build.linux.desktop, {
    StartupWMClass: 'Yira',
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/linux-packaging.test.mjs`

Expected: the first test fails because `packageJson.build.linux.icon` is currently `undefined`.

- [ ] **Step 3: Add the minimal packaging configuration**

Add these properties to the existing `build.linux` object in `package.json`:

```json
"icon": "resources/icon.png",
"desktop": {
  "StartupWMClass": "Yira"
},
```

Place them before `target`, preserving the existing JSON style and all current Linux targets.

- [ ] **Step 4: Run the regression test to verify it passes**

Run: `node scripts/linux-packaging.test.mjs`

Expected: all six packaging tests pass.

- [ ] **Step 5: Run type validation**

Run: `npx tsc --noEmit`

Expected: exit code 0.

### Task 2: Inspect the generated Debian launcher

**Files:**
- Generated: `release/Yira-<version>-amd64.deb` (do not edit)

**Interfaces:**
- Consumes: Electron Builder's Linux target configuration from Task 1.
- Produces: a Debian desktop entry with `Icon=yira` and `StartupWMClass=Yira`.

- [ ] **Step 1: Build Linux artifacts**

Run: `npm run dist:linux`

Expected: exit code 0 and updated `.deb` and `.AppImage` artifacts in `release/`.

- [ ] **Step 2: Inspect the Debian desktop entry without extracting files**

Run: `dpkg-deb --fsys-tarfile release/Yira-0.1.34-amd64.deb | tar -xO ./usr/share/applications/yira.desktop`

Expected output includes:

```ini
Icon=yira
StartupWMClass=Yira
```

- [ ] **Step 3: Confirm the working tree only contains source and documentation changes**

Run: `git status --short`

Expected: `package.json`, `scripts/linux-packaging.test.mjs`, and the two `docs/superpowers/` documents; generated release artifacts remain ignored.
