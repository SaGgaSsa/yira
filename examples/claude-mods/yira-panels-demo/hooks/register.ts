import type { Register } from 'claude-code'

import { connectYira, ui, type YiraPanels } from './yira'

const PANEL = 'demo'
const MAX_TOOLS = 8

let yira: YiraPanels | null = null
let count = 0
let recentTools: string[] = []

function drawPanel() {
  return ui.box(
    { gap: 3 },
    ui.text({ bold: true }, 'Yira panels demo'),
    ui.markdown('This panel is drawn by a **Claude Code mod** and rendered by Yira. Press a button: the mod handles it and redraws.'),
    ui.box(
      { flexDirection: 'row', gap: 2 },
      ui.button('increment', `+1 (${count})`, { variant: 'primary' }),
      ui.button('reset', 'Reset', { disabled: count === 0 }),
    ),
    ui.divider(),
    ui.text({ color: 'muted' }, 'Last tool calls'),
    ...(recentTools.length === 0
      ? [ui.text({ dim: true }, 'None yet.')]
      : recentTools.map((tool) => ui.text({ mono: true }, tool))),
  )
}

async function publish(): Promise<boolean> {
  return yira?.show(PANEL, 'Demo', drawPanel()) ?? false
}

function handlePress(panelId: string, key: string): void {
  if (panelId !== PANEL) return
  if (key === 'increment') count += 1
  if (key === 'reset') count = 0
  void publish()
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'yira-demo', description: 'Publish the demo panel to Yira' })
    yira = await connectYira($, handlePress)
    await publish()

    return next(e)
  })

  on('command.run', { command: 'yira-demo' }, async () => {
    if (!yira) return { text: 'Not running inside a Yira terminal.' }
    const isShown = await publish()

    return { text: isShown ? 'Demo panel published: open the Mods tab in Yira.' : 'Yira did not accept the panel.' }
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    recentTools = [e.tool, ...recentTools].slice(0, MAX_TOOLS)
    void publish()

    return result
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    await yira?.close(PANEL)
    yira?.stop()

    return next(e)
  })
}
