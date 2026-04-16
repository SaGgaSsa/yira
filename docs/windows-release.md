# Windows release

## Local packaging

Do not build the Windows installer from WSL. Use a native Windows shell for packaging.

Available commands:

- `npm run build`: builds Electron main, preload, and renderer in a Windows-compatible way
- `npm run dist:win`: creates the NSIS installer in `release/` without publishing
- `npm run release:win`: creates the installer and publishes it to the configured GitHub repository

## Windows code signing

The project uses `electron-builder`, which already supports Windows code signing. No extra signing service or app code changes are required.

Signing is enabled automatically in CI only when the required secrets exist. If the secrets are missing, the workflow keeps building unsigned binaries, so local builds and current CI builds continue to work.

### Required GitHub secrets

1. `WINDOWS_CERTIFICATE_PFX_BASE64`
   Export your Windows code signing certificate as a `.pfx` file with its private key, then base64-encode the file contents and store the result in this secret.
2. `WINDOWS_CERTIFICATE_PASSWORD`
   The password used to protect that `.pfx` file.

### Optional GitHub variable

1. `WINDOWS_CERTIFICATE_FILE_NAME`
   Optional repository or environment variable. Controls the temporary filename used inside the GitHub runner. If not set, the workflow uses `codesign.pfx`.

### What you need to provide

You need a standard Windows Authenticode code signing certificate that can be exported as `.pfx`/`.p12`.

Important:

- A normal exportable code signing certificate works with this setup
- An EV certificate stored on a USB token usually does not fit this CI model, because it cannot be handled only with GitHub secrets
- No certificate is created automatically by the project or workflow

### How to prepare the secret value

On a machine where you have the `.pfx` file:

- PowerShell:

  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\your-certificate.pfx"))
  ```

- Copy the full output and store it in `WINDOWS_CERTIFICATE_PFX_BASE64`

### Behavior with and without secrets

- With `WINDOWS_CERTIFICATE_PFX_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD`: the workflow reconstructs the certificate in the runner, exposes `CSC_LINK` and `CSC_KEY_PASSWORD`, and `electron-builder` signs the executable and installer
- Without those secrets: the workflow skips signing and still produces unsigned builds
- With only one of the two secrets: the workflow fails early with a clear configuration error

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
2. Configure the Windows signing secrets if you want the published binaries to be signed

## Notes

- The workflow uses the built-in `GITHUB_TOKEN` with `contents: write`, so no extra token is required for GitHub Releases
- `node-pty` is rebuilt during `npm ci` through the existing `postinstall` script
- Installer files are named like `Yira-Setup-0.1.0-x64.exe`
- For tag builds, GitHub Releases is the primary delivery channel; workflow artifacts remain only for non-tag builds on `main`
- Code signing is driven by `electron-builder` through `CSC_LINK` and `CSC_KEY_PASSWORD`, which the workflow populates only when signing secrets are available
