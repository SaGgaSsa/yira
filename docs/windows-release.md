# Windows release

## Local packaging

Do not build the Windows installer from WSL. Use a native Windows shell for packaging.

Available commands:

- `npm run build`: builds Electron main, preload, and renderer in a Windows-compatible way
- `npm run dist:win`: creates the NSIS installer in `release/` without publishing
- `npm run release:win`: creates the installer and publishes it to the configured GitHub repository

## GitHub Actions

The repository includes `.github/workflows/windows-release.yml`.

Behavior:

- Push to `main`: builds the Windows installer on `windows-latest` and uploads it as a workflow artifact
- Push a tag like `v0.1.0`: builds the installer and publishes the generated files to a GitHub Release for that tag
- Manual run: can be triggered from the Actions tab with `workflow_dispatch`

## GitHub repository setup

Required:

1. Enable GitHub Actions for the repository
2. In `Settings > Actions > General`, allow workflow `Read and write permissions` so `GITHUB_TOKEN` can create releases and upload assets
3. Make sure the default branch is `main`, or update the workflow branch filter if you use another branch
4. Create a release tag in the format `v*`, for example `v0.1.0`, when you want GitHub to publish the installer as a release asset

## Publish the next version

1. Update `package.json` to the target version, for example `0.1.0`
2. Commit and push the version change to `main`
3. Create the matching tag locally:

   ```bash
   git tag -a v0.1.0 -m "v0.1.0"
   git push origin v0.1.0
   ```

4. Wait for the `Windows Release` workflow to finish
5. Open GitHub Releases and confirm that release `v0.1.0` was created with the generated installer files attached

Optional:

1. Add a custom Windows icon at `resources/icon.ico` and then set `build.win.icon` in `package.json`
2. Add code signing later if you want SmartScreen-friendly signed installers

## Notes

- The workflow uses the built-in `GITHUB_TOKEN` with `contents: write`, so no extra token is required for GitHub Releases
- `node-pty` is rebuilt during `npm ci` through the existing `postinstall` script
- Installer files are named like `Yira-Setup-0.1.0-x64.exe`
- For tag builds, GitHub Releases is the primary delivery channel; workflow artifacts remain only for non-tag builds on `main`
