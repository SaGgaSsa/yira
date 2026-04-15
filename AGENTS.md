# Repository Guidelines

## Project Structure & Module Organization
`src/main/` contains the Electron main process, IPC handlers, shell profile detection, and filesystem-backed workspace logic. `src/preload/` exposes the safe bridge used by the renderer. `src/renderer/` holds the Vite React app; most UI code lives under `src/renderer/src/` with `components/`, `hooks/`, and `store/` subfolders. Shared TypeScript contracts live in `src/shared/types.ts`. Build resources such as the Windows icon belong in `resources/`. Generated output goes to `dist-electron/` and packaged installers go to `release/`; do not edit generated files directly.

## Build, Test, and Development Commands
Use `npm run dev` to launch the Electron app with the Vite renderer in development mode. Do not run `npm run build`, `npm run build:main`, `npm run build:preload`, `npm run build:renderer`, or `npm run dist:win` from this WSL workspace, because the Windows Electron build breaks in this environment. For non-mutating validation, prefer syntax/type checks only, such as `npx tsc --noEmit`. Use `npm run preview` only when you specifically need to inspect the renderer bundle behavior.

## Coding Style & Naming Conventions
This project uses strict TypeScript and ES modules. Follow the existing style: 2-space indentation, semicolon-free statements, single quotes, and trailing commas where TypeScript emits them naturally. Use `PascalCase` for React components, `camelCase` for hooks, store actions, and utility functions, and keep IPC channels grouped by feature under `src/main/ipc/`. Prefer typed imports from `@shared/*` for contracts reused across processes. Tailwind classes should reference the CSS variable-based theme tokens already defined in `tailwind.config.js`.

## Testing Guidelines
There is no committed automated test suite yet. Do not use `npm run build` as a verification step in this repository while working from WSL. Before opening a PR, run syntax/type validation only, then manually verify the affected flow in `npm run dev`, especially terminal creation, workspace switching, and IPC-backed persistence. When adding tests later, place them beside the feature as `*.test.ts` or `*.test.tsx`.

## Commit & Pull Request Guidelines
No top-level Git history is available in this workspace, so use concise Conventional Commit-style messages such as `feat: add workspace switcher` or `fix: persist terminal layout`. PRs should include a short summary, the user-visible impact, manual verification steps, and screenshots or screen recordings for renderer changes.

## Security & Configuration Tips
Keep Node access in the renderer disabled and route privileged work through preload and IPC only. Do not commit local workspace data, generated bundles, or machine-specific shell settings.
