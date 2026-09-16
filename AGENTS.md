# Repository Guidelines

## Project Structure & Module Organization
`src/main/` contains the Electron main process, IPC handlers, shell profile detection, and filesystem-backed workspace logic. `src/preload/` exposes the safe bridge used by the renderer. `src/renderer/` holds the Vite React app; most UI code lives under `src/renderer/src/` with `components/`, `hooks/`, and `store/` subfolders. Shared TypeScript contracts live in `src/shared/types.ts`. Build resources such as the Windows icon belong in `resources/`. Generated output goes to `dist-electron/` and packaged installers go to `release/`; do not edit generated files directly.

## Build, Test, and Development Commands
Codex runs through SSH without access to a graphical interface. Do not run `npm run dev` or `npm run preview` for visual verification. Do not attempt to set up a graphical session or browser for visual tests. On Linux, `npm run build` and `npm run dist:linux` are allowed when the affected release flow needs them. Do not run `npm run dist:win`; produce Windows installers in Windows CI.

## Coding Style & Naming Conventions
This project uses strict TypeScript and ES modules. Follow the existing style: 2-space indentation, semicolon-free statements, single quotes, and trailing commas where TypeScript emits them naturally. Use `PascalCase` for React components, `camelCase` for hooks, store actions, and utility functions, and keep IPC channels grouped by feature under `src/main/ipc/`. Prefer typed imports from `@shared/*` for contracts reused across processes. Tailwind classes should reference the CSS variable-based theme tokens already defined in `tailwind.config.js`.

## Testing Guidelines
Run `npx tsc --noEmit` locally before every push or release; it is the required strict TypeScript check. Run `npm test` when the affected feature has automated coverage, then run the relevant build or Linux packaging validation in proportion to the change. Limit verification to code review and checks that run through the console without a graphical interface. Do not require manual UI verification, screenshots, or screen recordings. If a behavior cannot be verified with these checks, report the limitation without blocking completion or asking the user to perform visual tests. Place new tests beside the feature as `*.test.ts` or `*.test.tsx`.

## Investigación, implementación y delegación a Luna
Para investigaciones e implementaciones, usa el modelo `gpt-5.6-luna` con esfuerzo de razonamiento `max`. Esta regla se aplica con o sin un plan documentado. Delega cada tarea independiente y acotada mediante los controles nativos de agentes de Codex en una tarea visible para el usuario. Crea las tareas con `spawn_agent`. Supervisa las tareas con `list_agents` y `wait_agent`. Usa `send_message` o `followup_task` para las correcciones. No uses un archivo TOML, un perfil de agente personalizado ni una habilidad de subagentes de Superpowers para dirigir el trabajo a Luna.

Before creating a Luna task, confirm that the available native controls support creating, monitoring, receiving the handoff, and messaging tasks with the requested model and reasoning effort. Give each task a complete packet: objective and acceptance criteria, exact file ownership, affected interfaces, constraints, starting branch or worktree state, verification commands, and Git/PR boundaries. Do not delegate a partial prompt or assume the thread inherits this conversation.

Use separate isolated worktrees for Git-backed agent tasks. Tasks with non-overlapping file ownership may run concurrently; shared-file or dependent tasks must run serially after the prior result has been accepted. Monitor each task, read its handoff, and independently inspect its worktree, complete diff, changed-file scope, and verification output before accepting its changes. Keep corrections in the same task. Do not allow a delegated task to push, create, update, or merge a PR without explicit authorization after that review.

## Commit & Pull Request Guidelines
No top-level Git history is available in this workspace, so use concise Conventional Commit-style messages such as `feat: add workspace switcher` or `fix: persist terminal layout`. PRs should include a short summary, the user-visible impact, console verification commands and results, and any verification limitations.

Release patch notes are generated from commit subjects between tags. Commits that should appear publicly should use clear `feat:`, `fix:`, `perf:`, or `refactor:` subjects. Keep private implementation details, private links, SHAs, and file paths out of commit subjects when they should not appear in public release notes.

## Security & Configuration Tips
Keep Node access in the renderer disabled and route privileged work through preload and IPC only. Do not commit local workspace data, generated bundles, or machine-specific shell settings.

Usa español técnico simplificado estilo ASD-STE100: instrucciones directas, frases cortas, una acción por frase, términos consistentes y lenguaje literal; evita ambigüedad, redundancia y variaciones innecesarias de vocabulario.
