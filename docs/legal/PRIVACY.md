# Yira Privacy Policy

**Effective date: 2026-09-16**

Yira does not automatically send personal information or usage analytics to SaGgaSsa. Yira stores workspace data locally, and that data can contain personal information. Yira is proprietary desktop software from SaGgaSsa.

## Local data

Yira stores data on your computer. The default data directory is `~/.yira`; `YIRA_HOME` can change this location. Data can include workspace settings, canvas or grid layouts, tile URLs, notes, board tasks, window state, and unsaved file drafts. A file tile reads and writes the file root that you select. Other features can access their own local configuration and provider files. Yira does not delete files in the selected root when you remove a file tile.

When enabled, shell history is stored in a workspace `.yira/terminal-history` directory. This setting is enabled by default. Terminal processes, output, and scrollback are held by a local daemon while a session is alive. The daemon can keep a session running after the Yira window closes. Removing a terminal tile or workspace destroys its Yira terminal session. Removing a workspace deletes its internal workspace directory, but not the separate file root.

When you use agent features, Yira can read local Claude or Codex transcripts to show bounded metadata and previews. Active session metadata and alert state stay in memory. An optional hook sends a minimal status event to the local Yira process. Configuring a hook changes the provider's local configuration file. Yira does not upload agent transcripts through its own code.

The embedded browser uses Electron's default browser session. Sites can store cookies, cache, local storage, and other browser data under that session. Yira saves the current browser URL in workspace state. Opening or restoring a saved browser tile loads its saved page and can contact that site automatically. Markdown can load an HTTP(S) image when the rendered content references one, including when the document is opened again.

Update diagnostics are local log records. They are enabled by default for new or not-yet-migrated settings and can be disabled in Settings. Yira keeps updater logs locally.

## Network connections

Installed, packaged builds check for updates after startup. The updater uses GitHub Releases for `SaGgaSsa/yira-releases`, downloads available update assets automatically, and can install them when Yira quits. Yira does not send update diagnostics to SaGgaSsa. GitHub receives the requests needed to provide release metadata and files and may process IP address, device information, and request time under its own policies. See [GitHub's General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

If a workspace is configured for Codex, Yira starts the local Codex app server and asks it for provider rate-limit data about once per minute. The provider controls any network activity and data processing by that program. Claude usage data is read from local provider state when available.

Other connections occur when you request them or use content that requests them. These include the embedded browser, external links, HTTP(S) images referenced by Markdown, Git pull or push, remote SSH terminals, Wake-on-LAN, shell commands, agent providers, and MCP tools. Those destinations and programs can receive the data required for the operation and have their own privacy terms.

## Control and contact

You can remove some local Yira data with the application's deletion actions or with your operating system's file tools. Deleting a workspace does not remove the selected external root, provider transcripts or settings, or the Electron browser profile. Uninstalling Yira does not by itself guarantee removal of those files. Yira has no Yira account and no Yira-hosted workspace retention service. Third parties control their own retention. Before posting support details, review the public repository's issue visibility. Contact SaGgaSsa through [public issues in the release repository](https://github.com/SaGgaSsa/yira-releases/issues); do not post secrets or private personal information there.
