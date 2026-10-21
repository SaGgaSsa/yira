# Yira panels demo mod

A Claude Code mod that publishes an interactive panel to the **Mods** tab of Yira's workspace panel.

`hooks/yira.ts` is the mod kit. Copy it next to your own mod's hooks module and call `connectYira($, onPress)` from `session.start`. It resolves `null` outside a Yira terminal.

```ts
const yira = await connectYira($, (panelId, key) => { /* a button was pressed */ })
await yira?.show('status', 'Status', ui.box({ gap: 2 }, ui.text({ bold: true }, 'Hello'), ui.button('refresh', 'Refresh')))
```

## How it works

- Yira's main process runs a loopback HTTP server and writes its address and token to the file named by `YIRA_MOD_BRIDGE_FILE`. Terminals inherit that variable and `YIRA_AGENT_TILE_ID`.
- `show` posts the panel tree to `POST /panels`; `close` posts to `POST /panels/close`.
- Presses come back through a long-poll on `GET /events`, and the kit calls `onPress`.
- When Yira restarts, the kit reads the file again and publishes its panels once more.

Elements: `Box`, `Text`, `Button`, `Markdown`, `Code`, `Divider` (see `src/shared/modPanels.ts`).

## Try it

From a terminal inside Yira:

```sh
claude --plugin-dir <path-to-this-folder>
```

Open the **Mods** tab in the right panel. `/yira-demo` publishes the panel again.
