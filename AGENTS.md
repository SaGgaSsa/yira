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

## Code style

Use strict TypeScript and ES modules. Follow the existing style: 2-space indentation, semicolon-free statements, single quotes, and trailing commas where TypeScript emits them naturally. Use `PascalCase` for React components. Use `camelCase` for hooks, store actions, and utility functions. Group IPC channels by feature under `src/main/ipc/`. Prefer typed imports from `@shared/*` for contracts reused across processes. Use the CSS variable-based theme tokens in Tailwind classes.

## Commits and release notes

Use concise Conventional Commit messages, such as `feat: add workspace switcher` or `fix: persist terminal layout`. Release notes are generated from commit subjects between tags. Use clear `feat:`, `fix:`, `perf:`, or `refactor:` subjects for public changes. Keep private implementation details, private links, SHAs, and file paths out of commit subjects when they should not appear in public release notes.

Pull requests should include a short summary, user-visible impact, console verification commands and results, and verification limits.

## Security

Keep Node access disabled in the renderer. Route privileged work through preload and IPC. Do not commit local workspace data, generated bundles, or machine-specific shell settings.
