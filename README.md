# Yira

Yira is an Electron desktop app for building workspace layouts around terminals, notes, browser views, and boards on an infinite canvas.

It is designed for Windows-first usage and persists workspace state through Electron IPC instead of exposing Node APIs directly in the renderer.

## What you can do

- Create multiple workspaces and switch between them
- Open terminal tiles using available shell profiles such as PowerShell, CMD, WSL, Bash, Zsh, or Fish
- Add note tiles for lightweight text capture
- Add browser tiles with a configurable home URL
- Add board tiles for kanban-style task tracking
- Move, resize, lock, and focus tiles on the canvas
- Group tiles into saved collections, rename them, recolor them, lock them, and attach a WSL startup command for new terminals inside the group
- Switch between `Canvas` mode and `Focus` mode
- Change appearance, density, grid visibility, snap-to-grid, and browser defaults from Settings
- Open and edit the raw persisted canvas JSON for advanced adjustments

## Main areas

- `src/main/`: Electron main process, IPC handlers, workspace persistence, terminal lifecycle
- `src/preload/`: safe bridge between renderer and privileged Electron APIs
- `src/renderer/`: React UI rendered with Vite
- `src/shared/types.ts`: shared contracts for tiles, groups, settings, and workspaces

## Run locally

Requirements:

- Node.js 22
- npm

Install dependencies:

```bash
npm ci
```

Start the app in development mode:

```bash
npm run dev
```

Useful validation command:

```bash
npx tsc --noEmit
```

Notes:

- Use `npm run dev` for local testing of the Electron app
- From this WSL workspace, do not use `npm run build` or `npm run dist:win` for packaging
- Packaging the Windows installer should be done from native Windows or from GitHub Actions

## How to test locally

After starting `npm run dev`, manually verify at least these flows:

1. Create a workspace and switch between workspaces
2. Create one tile of each type: terminal, note, browser, and board
3. Move and resize tiles on the canvas
4. Group selected tiles, then rename or lock the group
5. Open Settings and change grid or appearance options
6. Confirm workspace state persists after reload

## Generate a Windows release

### Local Windows packaging

Run these commands from a native Windows shell, not from WSL:

```bash
npm ci
npm run dist:win
```

This generates the installer in `release/`.

If you want to publish the release assets to GitHub from Windows:

```bash
npm run release:win
```

### GitHub Actions

The repository already includes a workflow at `.github/workflows/windows-release.yml`.

Behavior:

- Push to `main`: builds the Windows installer and uploads it as a workflow artifact
- Push a tag like `v0.1.0`: builds the installer and publishes the generated files to GitHub Releases
- Manual trigger: available through `workflow_dispatch`

Repository setup needed in GitHub:

1. Enable GitHub Actions
2. Ensure the workflow has `Read and write permissions`
3. Use `main` as the default branch, or update the workflow branch filter
4. Create release tags in the format `v*` when you want published installers

Exact publish flow for the next version:

1. Update `package.json` to the target version, for example `0.1.0`
2. Commit and push the change to `main`
3. Create and push the matching tag:

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

4. Wait for the `Windows Release` workflow to complete
5. Verify that GitHub created release `v0.1.0` and attached the installer files

### Windows code signing in CI

The Windows release workflow is prepared to sign builds with `electron-builder` if you provide a certificate through GitHub secrets.

Required GitHub secrets:

1. `WINDOWS_CERTIFICATE_PFX_BASE64`: base64 content of an exportable `.pfx` certificate with private key
2. `WINDOWS_CERTIFICATE_PASSWORD`: password for that `.pfx`

Optional GitHub variable:

1. `WINDOWS_CERTIFICATE_FILE_NAME`: temporary filename to use in the runner, defaults to `codesign.pfx`

Behavior:

- If both secrets exist, CI reconstructs the certificate, sets `CSC_LINK` and `CSC_KEY_PASSWORD`, and `electron-builder` signs the Windows binaries
- If neither secret exists, the build still works and produces unsigned binaries
- If only one signing secret exists, the workflow fails early with a clear configuration error

This setup expects a standard Windows code signing certificate that can be exported as `.pfx`. EV certificates tied to USB tokens usually do not fit this secrets-only CI flow.

For more detail, see [docs/windows-release.md](docs/windows-release.md).
