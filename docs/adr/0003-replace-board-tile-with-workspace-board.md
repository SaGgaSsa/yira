# Replace Board Tile With Workspace Board Controlled By MCP

Status: accepted

The legacy `kanban` Tile is removed. Board is now an optional workspace-level surface: each Workspace can enable one Board, and enabled Boards appear as Board View beside the Workspace's existing Canvas/Grid and Focus surfaces. Board data is stored separately from Canvas/Grid state at `workspaces/<workspaceId>/.yira/board/board.json`.

Users remain the source of Task creation. The UI can create Tasks with title and task body, edit title/task/notes, delete only Backlog Tasks with confirmation, and approve or reject Review Tasks. Rejecting a Review Task requires a note.

MCP access is scoped to a single workspace id and uses the same shared Board core as Electron IPC. The first MCP delivery is an npm stdio server, `yira-board-mcp`, configured as:

```bash
npx -y yira-board-mcp --yira-home <path> --workspace-id <id>
```

The MCP can read/list Tasks, enrich metadata, propose a Work Session, start a Work Session, add a note, move a Task to Review, and read History. It cannot create or delete Tasks in the MVP.

## Consequences

- Legacy Board Tile state is intentionally not migrated.
- Legacy `kanban` tiles are dropped when Canvas/Grid state is normalized.
- Done shows only Tasks completed in the last 7 days.
- Full completed Task history lives in the History table.
- Board transition rules live in shared code so IPC and MCP behavior stay aligned.
