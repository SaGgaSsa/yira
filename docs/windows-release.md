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
- Push a tag like `v0.1.0`: builds the installer and publishes the assets to the GitHub Release for that tag
- Manual run: can be triggered from the Actions tab with `workflow_dispatch`

## GitHub repository setup

Required:

1. Enable GitHub Actions for the repository
2. Make sure the default branch is `main`, or update the workflow branch filter if you use another branch
3. Create a release tag in the format `v*`, for example `v0.1.0`, when you want GitHub to publish the installer as a release asset

Optional:

1. Add a custom Windows icon at `resources/icon.ico` and then set `build.win.icon` in `package.json`
2. Add code signing later if you want SmartScreen-friendly signed installers

## Notes

- The workflow uses the built-in `GITHUB_TOKEN` with `contents: write`, so no extra token is required for GitHub Releases
- `node-pty` is rebuilt during `npm ci` through the existing `postinstall` script
- Installer files are named like `Yira-Setup-0.1.0-x64.exe`

