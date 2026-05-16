# Workspace Configuration Replaces Group Configuration

Status: accepted

Yira's primary working unit is the workspace, so folders and initial terminal commands belong to workspace configuration rather than to groups. Groups remain an optional app-wide capability for visual organization only, disabled by default; when disabled, existing group data is preserved but neither shown nor applied behaviorally.

The app must not create a visible Default workspace automatically. The first workspace is created through first workspace setup, and deleting the last workspace returns the app to that setup flow. Destructive workspace deletion requires confirming the exact workspace name.

## Consequences

- A workspace has one optional root folder, separate from its storage location.
- Files tiles require a workspace root folder; terminal tiles do not.
- Terminal launch order is workspace initial command first, then terminal startup command.
- Opening a folder creates a workspace named after that folder and uses it as the workspace root folder.
