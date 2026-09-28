# Contribution Guide

## Project structure

- `src/main/` contains the Electron main process, IPC handlers, shell profile detection, and filesystem-backed workspace logic.
- `src/preload/` exposes the safe bridge used by the renderer.
- `src/renderer/` contains the Vite React application. Most UI code is under `src/renderer/src/`, with `components/`, `hooks/`, and `store/` subfolders.
- `src/shared/types.ts` contains contracts shared across processes.
- `src/mcp/` contains the Board MCP server.
- `resources/` contains build resources such as the Windows icon.
- `docs/CONTEXT.md` is the domain glossary.
- `dist-electron/` and `dist/` are generated output. `release/` contains packaged installers. Do not edit generated files directly.

## Development and verification

Use the scripts in `package.json` for development, builds, tests, and packaging. Automated checks run through the console. Run `npx tsc --noEmit` before every push or release. Run `npm test` when the changed feature has automated coverage. Run the relevant build or Linux packaging validation for the change. Do not run `npm run dist:win` locally. Produce Windows installers in Windows CI.

Pull requests must report the verification commands and results. Report any verification limits.

### App profiles

The maintainer uses Yira daily. Its real profile lives in `~/.yira` (config, workspaces, Electron data). Never launch the app against that profile from a working copy.

- `npm run dev` runs the app for local development with the persistent dev profile `~/.yira-dev` (or `YIRA_DEV_DATA_DIR`). Use it only when the maintainer asks to run the app locally.
- `npm run dev:test` is the command for agents and automated checks that need to open the app. It creates a fresh profile under the system temp directory (`yira-test-profile-*`), seeds the example workspaces, and deletes it when the app exits. Set `YIRA_KEEP_TEST_PROFILE=1` to keep it for inspection.
- To test a scenario that needs specific data, write a `config.json` into a new directory under your scratch or temp folder and run `npm run dev` with `YIRA_DEV_DATA_DIR` pointing there. Delete that directory afterwards. Workspace `rootFolderPath` values may point at real repositories. Never point `YIRA_DEV_DATA_DIR` or `YIRA_HOME` at `~/.yira`.
- The app also reads `~/.claude` and `~/.codex` for agent usage and history. That access is read-only. The Settings actions that install or remove agent hooks write `~/.claude/settings.json` and `~/.codex/hooks.json`. Do not trigger them in test runs.
- On Windows, agents can launch the app to check a change. Stop it when done and leave no Electron processes running.

## Code style

Use strict TypeScript and ES modules. Follow the existing style: 2-space indentation, semicolon-free statements, single quotes, and trailing commas where TypeScript emits them naturally. Use `PascalCase` for React components. Use `camelCase` for hooks, store actions, and utility functions. Group IPC channels by feature under `src/main/ipc/`. Prefer typed imports from `@shared/*` for contracts reused across processes. Use the CSS variable-based theme tokens in Tailwind classes.

## Commits and release notes

Use concise Conventional Commit messages, such as `feat: add workspace switcher` or `fix: persist terminal layout`. Release notes are generated from commit subjects between tags. Use clear `feat:`, `fix:`, `perf:`, or `refactor:` subjects for public changes. Keep private implementation details, private links, SHAs, and file paths out of commit subjects when they should not appear in public release notes.

Pull requests should include a short summary, user-visible impact, console verification commands and results, and verification limits.

## Security

Keep Node access disabled in the renderer. Route privileged work through preload and IPC. Do not commit local workspace data, generated bundles, or machine-specific shell settings.
