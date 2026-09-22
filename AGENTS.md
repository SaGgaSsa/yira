# Repository Guidelines

## Project Structure & Module Organization
`src/main/` contains the Electron main process, IPC handlers, shell profile detection, and filesystem-backed workspace logic. `src/preload/` exposes the safe bridge used by the renderer. `src/renderer/` holds the Vite React app; most UI code lives under `src/renderer/src/` with `components/`, `hooks/`, and `store/` subfolders. Shared TypeScript contracts live in `src/shared/types.ts`. Build resources such as the Windows icon belong in `resources/`. Generated output goes to `dist-electron/` and packaged installers go to `release/`; do not edit generated files directly.

## Build, Test, and Development Commands
Codex runs through SSH without access to a graphical interface. Do not run `npm run dev` or `npm run preview` for visual verification. Do not attempt to set up a graphical session or browser for visual tests. On Linux, `npm run build` and `npm run dist:linux` are allowed when the affected release flow needs them. Do not run `npm run dist:win`; produce Windows installers in Windows CI.

## Coding Style & Naming Conventions
This project uses strict TypeScript and ES modules. Follow the existing style: 2-space indentation, semicolon-free statements, single quotes, and trailing commas where TypeScript emits them naturally. Use `PascalCase` for React components, `camelCase` for hooks, store actions, and utility functions, and keep IPC channels grouped by feature under `src/main/ipc/`. Prefer typed imports from `@shared/*` for contracts reused across processes. Tailwind classes should reference the CSS variable-based theme tokens already defined in `tailwind.config.js`.

## Testing Guidelines
Run `npx tsc --noEmit` locally before every push or release; it is the required strict TypeScript check. Run `npm test` when the affected feature has automated coverage, then run the relevant build or Linux packaging validation in proportion to the change. Limit verification to code review and checks that run through the console without a graphical interface. Do not require manual UI verification, screenshots, or screen recordings. If a behavior cannot be verified with these checks, report the limitation without blocking completion or asking the user to perform visual tests. Place new tests beside the feature as `*.test.ts` or `*.test.tsx`.

## Investigación, implementación y delegación a OpenCode
Esta regla solo aplica al coordinador Codex. OpenCode no delega de nuevo. OpenCode ejecuta el paquete directamente.
El coordinador Codex prepara cada tarea. El coordinador supervisa los procesos CLI. El coordinador revisa los resultados.
Ejecuta investigaciones e implementaciones con OpenCode mediante `opencode run`. Usa el modelo exacto `opencode/muse-spark-1.3-contributor-free`. Usa `--agent build`. Usa `--format json`. No uses Luna. No uses `spawn_agent`.
Si falta CLI, credenciales, modelo o servicio, informa el bloqueo. No cambies de modelo automáticamente.
Usa un worktree aislado por cada tarea Git. Entrega un paquete completo en cada tarea. Incluye objetivo y criterios. Incluye archivos propios e interfaces. Incluye restricciones y base/estado Git. Incluye comandos de verificación. Incluye límites de Git/PR.
Solo paraleliza archivos independientes. Ejecuta tareas dependientes en serie. Revisa el diff completo antes de integrar. Revisa el alcance de archivos antes de integrar.
Exige entrega con resumen, archivos cambiados y comprobaciones. Revisa la entrega antes de aceptar. Revisa la salida de verificaciones antes de aceptar.
No permitas push sin autorización explícita posterior. No permitas PR sin autorización explícita posterior.
Mantén correcciones en la misma sesión OpenCode mediante `--session ID`. No uses `--auto`. No uses `--share`.
Mantén verificaciones por consola. Consulta los comandos en `docs/opencode-delegation.md`.

## Commit & Pull Request Guidelines
No top-level Git history is available in this workspace, so use concise Conventional Commit-style messages such as `feat: add workspace switcher` or `fix: persist terminal layout`. PRs should include a short summary, the user-visible impact, console verification commands and results, and any verification limitations.

Release patch notes are generated from commit subjects between tags. Commits that should appear publicly should use clear `feat:`, `fix:`, `perf:`, or `refactor:` subjects. Keep private implementation details, private links, SHAs, and file paths out of commit subjects when they should not appear in public release notes.

## Security & Configuration Tips
Keep Node access in the renderer disabled and route privileged work through preload and IPC only. Do not commit local workspace data, generated bundles, or machine-specific shell settings.

Usa español técnico simplificado estilo ASD-STE100: instrucciones directas, frases cortas, una acción por frase, términos consistentes y lenguaje literal; evita ambigüedad, redundancia y variaciones innecesarias de vocabulario.
