import modKitSource from '../../../../examples/claude-mods/yira-panels-demo/hooks/yira.ts?raw'

// Prompt the user pastes into an agent so it can write or adapt a Claude Code
// mod that publishes panels to Yira. The kit source is embedded so the agent
// copies the same client Yira ships in its example mod.
export const MOD_PANEL_PROMPT = `Write or adapt a Claude Code mod so it shows a panel in Yira, the terminal workspace app this session runs in. Use the plugin-authoring skill for the general mod structure (.claude-plugin/plugin.json, hooks/hooks.json, the hooks module and register).

## How a mod links with Yira

- Yira only reaches mods running in a Claude Code session started from a Yira terminal. Outside Yira the kit returns null; the mod must keep working without panels.
- Yira terminals export YIRA_MOD_BRIDGE_FILE (path to a JSON file with { url, token }) and YIRA_AGENT_TILE_ID (the terminal's tile id).
- The mod calls Yira's loopback HTTP server with the header Authorization: Bearer <token>:
  - POST /panels with { tileId, plugin, id, title, tree } publishes or replaces a panel.
  - POST /panels/close with { tileId, plugin, id } removes it.
  - GET /events?tileId=<tileId>&plugin=<plugin>&wait=<ms, up to 20000> long-polls button presses and returns { events: [{ kind: 'press', id, key }] }.
- Yira writes a new url and token each time it starts. The kit re-reads the file after errors or a 401 and publishes its panels again.
- Panels appear in the Mods tab of Yira's right workspace panel, labeled with the panel title, the mod's plugin name and the terminal.

## How to use the kit

Save the kit below as hooks/yira.ts next to the mod's hooks module. Do not reimplement the protocol.

1. In session.start, call connectYira($, onPress). Keep the result; it is null outside Yira.
2. Call yira.show(id, title, tree) whenever the mod's state changes. Each call replaces the whole panel. A mod can show several panels with different ids.
3. Handle presses in onPress(panelId, key): update the state and call show again.
4. In session.end, call yira.close(id) for each panel and then yira.stop().

\`\`\`ts
import type { Register } from 'claude-code'

import { connectYira, ui, type YiraPanels } from './yira'

let yira: YiraPanels | null = null
let count = 0

function draw() {
  return ui.box({ gap: 2 },
    ui.text({ bold: true }, 'Counter'),
    ui.button('increment', \`+1 (\${count})\`, { variant: 'primary' }),
  )
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    yira = await connectYira($, (panelId, key) => {
      if (panelId === 'counter' && key === 'increment') count += 1
      void yira?.show('counter', 'Counter', draw())
    })
    await yira?.show('counter', 'Counter', draw())
    return next(e)
  })
  on('session.end', async ($, e, next) => {
    await yira?.close('counter')
    yira?.stop()
    return next(e)
  })
}
\`\`\`

## Elements

The tree is plain data. Build it with the kit's ui helpers. Yira drops unknown elements and props.

- Plain strings render as text.
- Box (ui.box): layout container. Props: flexDirection 'row' | 'column' (default column), gap 0-8, padding 0-8, border, wrap. Any children.
- Text (ui.text): props color 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'danger', bold, italic, dim, mono. Children are strings or Text.
- Button (ui.button(key, label, props)): key is required and comes back in onPress. Props: variant 'primary' | 'secondary', disabled.
- Markdown (ui.markdown(text)): GitHub-flavored Markdown without raw HTML. http and https links open in the browser.
- Code (ui.code(source, language)): a code block.
- Divider (ui.divider()): a horizontal rule.

Buttons are the only interaction. There are no inputs, images, raw HTML or scripts.

Limits: 2,000 nodes and depth 24 per tree, 100,000 characters per text, ids and keys up to 128 characters, titles up to 120 characters, 512 KB per request. Yira trims larger trees instead of rejecting them.

## Kit (hooks/yira.ts)

\`\`\`ts
${modKitSource.trimEnd()}
\`\`\`
`
