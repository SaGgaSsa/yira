# Yira

Yira organizes a user's working environment as named workspaces with visual tiles and optional visual grouping.

## Language

**Workspace**:
The primary unit of work that names and preserves a user's working environment.
_Avoid_: Project, default workspace

**Workspace Configuration**:
The workspace-owned setup that defines one root folder and an initial command used to start work.
_Avoid_: Group configuration

**Workspace Root Folder**:
The user-selected folder that represents where work happens for a workspace.
_Avoid_: Workspace storage path, workspace path

**First Workspace Setup**:
The first-run flow where the user names and configures the initial workspace.
_Avoid_: Default workspace, auto-created workspace

**Workspace Deletion**:
The destructive action that removes a workspace from the user's workspace list.
_Avoid_: Reset, archive

**Group**:
An optional visual grouping of tiles inside a workspace.
_Avoid_: Workspace, project

**Groups Capability**:
The optional app capability that makes groups visible and usable.
_Avoid_: Default grouping

**Keyboard Shortcut**:
A documented key combination that triggers a Yira action.
_Avoid_: Hotkey, keybinding

**Focus View**:
The single-panel tile view currently labeled `Focus`.
_Avoid_: Fullview, single view

**Split View**:
The two-panel tile view.
_Avoid_: Splitview, split mode

**Tile**:
A workspace item that represents one tool or piece of working state.
_Avoid_: Window, panel, widget

**Files Tile**:
A tile that browses the workspace root folder.
_Avoid_: File explorer without workspace

**Terminal Tile**:
A tile that provides a shell for the workspace.
_Avoid_: File explorer, command runner

**Tile Creation Availability**:
The app-wide preference that controls which configurable tile types appear in normal creation surfaces.
_Avoid_: Tile visibility, tile deletion, board migration

**Workspace Initial Command**:
The workspace-level command that runs before a terminal tile's own startup command.
_Avoid_: Group startup command, legacy group command

**Terminal Startup Command**:
The terminal tile-level command that runs after the workspace initial command.
_Avoid_: Workspace initial command

## Relationships

- A **Workspace** has one **Workspace Configuration**
- A **Workspace Configuration** has at most one root folder
- A **Workspace Root Folder** is distinct from the workspace storage location
- A **First Workspace Setup** creates the first **Workspace**
- Opening a folder creates a **Workspace** named after that folder with that folder as its **Workspace Root Folder**
- A **Workspace** contains zero or more **Tiles**
- A newly created **Workspace** can contain zero **Tiles**
- Deleting the last **Workspace** returns the app to **First Workspace Setup**
- **Workspace Deletion** requires confirming the exact **Workspace** name
- A **Files Tile** requires its **Workspace** to have a root folder
- A **Terminal Tile** can exist without a root folder
- A **Terminal Tile** runs the **Workspace Initial Command** before its **Terminal Startup Command**
- **Tile Creation Availability** affects only normal tile creation
- **Tile Creation Availability** is an app-wide preference
- **Tile Creation Availability** can hide Note, Browser, Timer, and Files creation
- A **Terminal Tile** is always available for normal creation
- Board creation is locked in normal creation surfaces while existing Board tiles remain usable
- Disabling tile creation preserves existing **Tiles**
- A **Group** contains two or more **Tiles**
- A **Tile** belongs to at most one **Group**
- A **Group** belongs to exactly one **Workspace**
- **Groups Capability** is disabled by default
- **Groups Capability** is an app-wide preference
- A **Group** is shown only when **Groups Capability** is enabled
- A **Group** affects tile behavior only when **Groups Capability** is enabled
- Disabling **Groups Capability** preserves existing **Groups**

## Example Dialogue

> **Dev:** "Should the terminal startup command and root folder live in the Group?"
> **Domain expert:** "No, they belong to the Workspace Configuration; a Group is only optional visual organization."

> **Dev:** "Can a Files Tile open without a root folder?"
> **Domain expert:** "No, Files is blocked until the Workspace Configuration has a root folder."

> **Dev:** "Is the Workspace path the same as the root folder?"
> **Domain expert:** "No, the root folder is the user-selected working folder; storage location is separate."

> **Dev:** "When opening a folder, should the user name the Workspace first?"
> **Domain expert:** "No, use the folder name as the initial Workspace name."

> **Dev:** "Can a Terminal Tile open without a root folder?"
> **Domain expert:** "Yes, the Terminal can still use the shell default when the Workspace has no root folder."

> **Dev:** "If Timer creation is disabled, should existing Timer Tiles disappear?"
> **Domain expert:** "No, Tile Creation Availability controls creation only; existing Tiles remain visible and usable."

> **Dev:** "Can users create Board Tiles from the normal UI?"
> **Domain expert:** "No, Board creation is locked for an upcoming redesign, but existing Board Tiles still work."

> **Dev:** "If both Workspace and Terminal define commands, which runs first?"
> **Domain expert:** "The Workspace Initial Command runs first, then the Terminal Startup Command."

> **Dev:** "Should we create a Default workspace automatically?"
> **Domain expert:** "No, the first workspace should come from First Workspace Setup."

> **Dev:** "Should First Workspace Setup create starter Tiles?"
> **Domain expert:** "No, it creates the Workspace only."

> **Dev:** "If the last Workspace is deleted, do we recreate Default?"
> **Domain expert:** "No, deleting the last Workspace returns the app to First Workspace Setup."

> **Dev:** "Should deleting a Workspace require typing 'delete'?"
> **Domain expert:** "No, the user should type the exact Workspace name."

> **Dev:** "If a Workspace already has Groups, should they always be visible?"
> **Domain expert:** "No, Groups are shown only when Groups Capability is enabled."

> **Dev:** "If Groups are disabled, do locked Groups still constrain Tiles?"
> **Domain expert:** "No, disabled Groups are neither visible nor behavioral."

> **Dev:** "Does disabling Groups delete existing Groups?"
> **Domain expert:** "No, it preserves them for possible reactivation."

## Flagged Ambiguities

- "group configuration" was used for folders and startup command; resolved: this is **Workspace Configuration**.
- "folders" was used broadly; resolved: a **Workspace Configuration** has one root folder, not a list of folders.
- "workspace path" can mean storage or work location; resolved: **Workspace Root Folder** is the user-selected work location and is separate from storage.
- "default workspace" suggested an automatically created workspace; resolved: the first workspace comes from **First Workspace Setup**.
- "initial command" and "startup command" were both used for terminal launch behavior; resolved: workspace-level command runs first, tile-level command runs second.
- "group startup command" is not part of the domain model; resolved: command behavior belongs only to **Workspace Initial Command** and **Terminal Startup Command**.
- "groups" are not part of the default workspace experience; resolved: **Groups Capability** is disabled by default and controls their visibility.
- "show tile type" can mean creation or existing visibility; resolved: **Tile Creation Availability** controls only normal creation surfaces.
