# Repository Guidelines

## Project Structure & Module Organization
`src/main/` contains the Electron main process, IPC handlers, shell profile detection, and filesystem-backed workspace logic. `src/preload/` exposes the safe bridge used by the renderer. `src/renderer/` holds the Vite React app; most UI code lives under `src/renderer/src/` with `components/`, `hooks/`, and `store/` subfolders. Shared TypeScript contracts live in `src/shared/types.ts`. Build resources such as the Windows icon belong in `resources/`. Generated output goes to `dist-electron/` and packaged installers go to `release/`; do not edit generated files directly.

## Build, Test, and Development Commands
Detect WSL before choosing local validation:

```bash
if grep -qiE '(microsoft|wsl)' /proc/version /proc/sys/kernel/osrelease 2>/dev/null; then
  echo 'WSL'
else
  echo 'native Linux'
fi
```

Use `npm run dev` to launch the Electron app with the Vite renderer in development mode. On native Linux, `npm run build` and `npm run dist:linux` are allowed when the affected release flow needs them; manually verify the app with `npm run dev`. In WSL, do not run `npm run build`, `npm run build:main`, `npm run build:preload`, `npm run build:renderer`, or Linux distribution builds; prefer non-mutating checks such as `npx tsc --noEmit` because Electron packaging is not reliable there. Do not run `npm run dist:win` from either Linux or WSL; produce Windows installers in Windows CI. Use `npm run preview` only when you specifically need to inspect the renderer bundle behavior.

## Coding Style & Naming Conventions
This project uses strict TypeScript and ES modules. Follow the existing style: 2-space indentation, semicolon-free statements, single quotes, and trailing commas where TypeScript emits them naturally. Use `PascalCase` for React components, `camelCase` for hooks, store actions, and utility functions, and keep IPC channels grouped by feature under `src/main/ipc/`. Prefer typed imports from `@shared/*` for contracts reused across processes. Tailwind classes should reference the CSS variable-based theme tokens already defined in `tailwind.config.js`.

## Testing Guidelines
There is no committed automated test suite yet. In WSL, use syntax/type validation only. On native Linux, run the relevant build or Linux packaging validation in proportion to the change, then manually verify the affected flow in `npm run dev`, especially terminal creation, workspace switching, and IPC-backed persistence. When adding tests later, place them beside the feature as `*.test.ts` or `*.test.tsx`.

## Plan Implementation and Luna Delegation
When implementing a documented plan, delegate each independent, bounded implementation task through Codex native agent controls to a user-visible task configured with model `gpt-5.6-luna` and reasoning effort `max`. Create tasks with `spawn_agent`; monitor them with `list_agents` and `wait_agent`; and use `send_message` or `followup_task` for corrections. Do not use a custom-agent TOML/profile or a Superpowers native-subagent skill to route work to Luna.

Before creating a Luna task, confirm that the available native controls support creating, monitoring, receiving the handoff, and messaging tasks with the requested model and reasoning effort. Give each task a complete packet: objective and acceptance criteria, exact file ownership, affected interfaces, constraints, starting branch or worktree state, verification commands, and Git/PR boundaries. Do not delegate a partial prompt or assume the thread inherits this conversation.

Use separate isolated worktrees for Git-backed agent tasks. Tasks with non-overlapping file ownership may run concurrently; shared-file or dependent tasks must run serially after the prior result has been accepted. Monitor each task, read its handoff, and independently inspect its worktree, complete diff, changed-file scope, and verification output before accepting its changes. Keep corrections in the same task. Do not allow a delegated task to push, create, update, or merge a PR without explicit authorization after that review.

## Commit & Pull Request Guidelines
No top-level Git history is available in this workspace, so use concise Conventional Commit-style messages such as `feat: add workspace switcher` or `fix: persist terminal layout`. PRs should include a short summary, the user-visible impact, manual verification steps, and screenshots or screen recordings for renderer changes.

Release patch notes are generated from commit subjects between tags. Commits that should appear publicly should use clear `feat:`, `fix:`, `perf:`, or `refactor:` subjects. Keep private implementation details, private links, SHAs, and file paths out of commit subjects when they should not appear in public release notes.

## Security & Configuration Tips
Keep Node access in the renderer disabled and route privileged work through preload and IPC only. Do not commit local workspace data, generated bundles, or machine-specific shell settings.
