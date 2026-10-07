# Yira

A terminal-centered workspace for devtools, notes, browser context, files, and workspace-level task flow.

![Yira screenshot](./docs/assets/yira.png)

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Latest release](https://img.shields.io/github/v/release/SaGgaSsa/yira)](https://github.com/SaGgaSsa/yira/releases/latest)
![Platforms: Windows and Linux](https://img.shields.io/badge/platforms-Windows%20%7C%20Linux-informational)

## What is Yira

Yira is a desktop app that keeps the model small: a workspace owns the flow, tiles hold the tools, and views change the arrangement without changing the work. A **workspace** is the local container for a project, folder, or flow, and keeps view state and tools together. **Tiles** hold terminals, notes, browser sessions, and files, and stay visible where the work happens. **Views** change how the same workspace is arranged: freeform canvas, fixed grid, focused tile, split workflow, or Board View.

## Features

- **Tiles:** Terminal, Note, Browser, Files, and Timer.
- **Views:** Canvas, Grid, Focus, and Split.
- **Board View:** Workspace task board with status columns.
- **Board MCP server:** Exposes board tasks through the `yira-board-mcp` command.
- **Terminal history:** Save shell history under the workspace for supported shells.

## Download

Download the latest build from [GitHub Releases](https://github.com/SaGgaSsa/yira/releases/latest):

- **Windows:** `Yira-Setup-<version>-x64.exe`
- **Linux:** `Yira-<version>-amd64.deb` (recommended) or `Yira-<version>-x86_64.AppImage`

Installed builds update automatically from GitHub Releases.

## Installation

### Windows

Download and run the Windows NSIS installer. The installer is not signed yet. Windows SmartScreen can show a warning. Select **More info**, then **Run anyway** to continue.

### Linux

Use the `.deb` package when it is available for your distribution. AppImage needs FUSE and user namespaces. See the [Linux packaging guide](docs/linux-packaging.md) for requirements and troubleshooting.

## Why another terminal workspace?

- **The terminal stays at the center.** Notes, browser context, and files sit next to your shells in the same project workspace instead of in separate windows.
- **One workspace, many arrangements.** Switch between canvas, grid, focus, split, and Board View without losing tiles, sessions, or state.
- **Agent-friendly task flow.** The workspace board is exposed through a local MCP server, so coding agents running in your terminals can read and update tasks.

## Development

Requirements: Node.js 22 and npm.

Install dependencies:

```bash
npm ci
```

Start the development app:

```bash
npm run dev
```

The development app uses a persistent data directory separate from the normal Yira profile. By default, it uses `~/.yira-dev` and creates example workspaces when that directory has no configuration. Set `YIRA_DEV_DATA_DIR` to use another directory. The development script resolves that path and passes it to the app as `YIRA_HOME`.

```bash
YIRA_DEV_DATA_DIR=/path/to/yira-dev-data npm run dev
```

Run the required checks:

```bash
npx tsc --noEmit
npm test
npm run build
```

Windows installers are produced in CI. Do not run `npm run dist:win` locally.

## Project structure

- `src/main/`: Electron main process, IPC handlers, shell profiles, and workspace filesystem logic.
- `src/preload/`: Safe bridge from the renderer to privileged app features.
- `src/renderer/`: React user interface, views, tiles, hooks, and stores.
- `src/shared/`: Shared TypeScript contracts and workspace data helpers.
- `src/mcp/`: Board MCP server implementation.
- `scripts/`: Development and build scripts.
- `docs/`: Project context, legal documents, and packaging guidance.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

Read [SECURITY.md](SECURITY.md) to report a vulnerability privately.

## License

Yira is licensed under the [MIT License](LICENSE). Read the [Terms of Use](docs/legal/TERMS.md) and [Privacy Policy](docs/legal/PRIVACY.md).

For support and issues, use [GitHub Issues](https://github.com/SaGgaSsa/yira/issues).
