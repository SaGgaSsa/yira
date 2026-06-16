# Non-Interchangeable Workspace Types

Status: accepted

Yira workspaces are created as either Canvas workspaces or Grid workspaces. The workspace type is stored in workspace configuration and is read-only after creation. Missing or legacy type values normalize to Canvas so existing users keep the current behavior.

Canvas workspaces keep the existing Canvas, Focus View, and Split View surfaces. Grid workspaces expose Grid View and Focus View only. Grid View stores its own split-tree JSON and does not derive layout from Canvas tile positions.

Opening a folder is no longer a workspace creation shortcut. It activates an existing workspace with the selected root folder, or reports that no matching workspace exists.

## Consequences

- Workspace setup must ask for the workspace type before normal workspace configuration.
- Workspace management can edit, reorder, and remove workspaces, but it does not create new workspaces or change type.
- Grid JSON and Canvas JSON are separate persistence contracts.
- Grid workspaces reject the 25th tile with a modal OK dialog.
