# Workspace Terminal History Implementation Plan

> **For agentic workers:** Implement this plan task by task under the repository's **Plan Implementation and Luna Delegation** rules in `AGENTS.md`.

**Goal:** Add workspace-scoped terminal command history for compatible shells.

**Architecture:** Store the setting in `Workspace Configuration`, default it on, and apply it when creating new terminal sessions. Use native shell history mechanisms and keep history files in Yira's internal workspace storage.

**Tech Stack:** Electron main IPC, preload bridge, React renderer, TypeScript, node-pty, Bash/Zsh/PowerShell shell configuration.

---

## Summary

Add `Workspace Terminal History` as a visible workspace setting in First Workspace Setup, Create workspace, and Edit workspace.

When enabled, new Terminal Tiles in compatible shells use a history file scoped to the active Workspace. Existing terminal sessions are not restarted or modified; the setting applies to new or refreshed terminal sessions.

## Decisions

- Default: enabled for new and existing workspaces.
- Storage: `~/.yira/workspaces/<workspaceId>/.yira/terminal-history/`.
- Supported in v1: Bash, Zsh, PowerShell.
- Not supported in v1: Fish, WSL, CMD.
- Unsupported shells should behave normally with no warning/noise.
- History setup must run before `Workspace Initial Command` and `Terminal Startup Command`.
- `CONTEXT.md` should define `Workspace Terminal History`; no ADR is needed.

## Implementation Tasks

### Task 1: Extend Workspace Configuration

Files:
- Modify `src/shared/types.ts`
- Modify `src/main/ipc/workspace.ts`

Steps:
- Add `terminalHistoryEnabled?: boolean` to `WorkspaceConfig`.
- Normalize missing values to `true`.
- Preserve explicit `false`.
- Include the value in create, update, open-folder, and migration paths.

### Task 2: Add Workspace Dialog Toggle

Files:
- Modify `src/renderer/src/components/WorkspaceDialog.tsx`
- Modify `src/renderer/src/App.tsx`

Steps:
- Add `terminalHistoryEnabled: boolean` to `WorkspaceDialogValue`.
- Show a toggle labeled `Workspace terminal history`.
- Include the toggle in First Workspace Setup, Create workspace, and Edit workspace.
- Pass the value through workspace create/update calls.

### Task 3: Pass Workspace Context to Terminal Creation

Files:
- Modify `src/shared/types.ts`
- Modify `src/renderer/src/components/TerminalTile.tsx`
- Modify `src/preload/index.ts`
- Modify `src/renderer/src/electron.d.ts`

Steps:
- Extend `TerminalCreateOptions` with `workspaceId?: string` and `terminalHistoryEnabled?: boolean`.
- Pass the active workspace id and config value from `TerminalTile`.
- Keep current reattach behavior unchanged.

### Task 4: Apply Native Shell History Setup

Files:
- Modify `src/main/ipc/terminal.ts`
- Add focused helper if needed, for example `src/main/terminal-history.ts`

Steps:
- Create the workspace history directory before spawning or before injecting shell setup.
- Bash/Zsh: set `HISTFILE` to the workspace history file path.
- Zsh: ensure reasonable history save behavior when needed.
- PowerShell: prepend a PSReadLine `Set-PSReadLineOption -HistorySavePath ...` setup command.
- Fish, WSL, CMD: no changes.
- Ensure shell history setup happens before initial commands.

### Task 5: Update Domain Glossary

Files:
- Modify `CONTEXT.md`

Add:
- `Workspace Terminal History`: workspace configuration option that keeps command history separate per Workspace for compatible Terminal Tiles.

Relationships:
- Belongs to `Workspace Configuration`.
- Applies to new compatible `Terminal Tile` sessions.
- Is distinct from terminal buffer, terminal session persistence, and Terminal Attention.

## Test Plan

- Add tests for workspace config normalization:
  - missing `terminalHistoryEnabled` becomes `true`;
  - explicit `false` remains `false`;
  - create/update/open-folder preserve the setting correctly.

- Add tests for terminal history setup:
  - Bash receives workspace-scoped `HISTFILE`;
  - Zsh receives workspace-scoped `HISTFILE`;
  - PowerShell receives PSReadLine history path setup;
  - Fish, WSL, and CMD are unchanged.

- Run:
  - `npx tsc --noEmit`

- Manual verification in `npm run dev`:
  - Create workspace with history enabled.
  - Open Bash/Zsh terminal, run commands, refresh terminal, confirm workspace history is reused.
  - Switch workspace, open terminal, confirm history is separate.
  - Disable setting, refresh terminal, confirm normal shell history behavior returns for new sessions.
