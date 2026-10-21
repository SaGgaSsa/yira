// Yira mod kit: publish a panel to Yira's workspace panel (Mods tab) from a
// Claude Code mod running inside a Yira terminal. Copy this file next to the
// mod's hooks module. Outside Yira, connectYira resolves null.

import type { EngineInterface } from 'claude-code'

export type YiraColor = 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'danger'

export type YiraNode =
  | string
  | { type: 'Box'; props?: YiraBoxProps; children?: YiraNode[] }
  | { type: 'Text'; props?: YiraTextProps; children?: YiraNode[] }
  | { type: 'Button'; props: YiraButtonProps; children?: YiraNode[] }
  | { type: 'Markdown'; props: { text: string } }
  | { type: 'Code'; props: { source: string; language?: string } }
  | { type: 'Divider' }

export interface YiraBoxProps {
  flexDirection?: 'row' | 'column'
  gap?: number
  padding?: number
  border?: boolean
  wrap?: boolean
}

export interface YiraTextProps {
  color?: YiraColor
  bold?: boolean
  italic?: boolean
  dim?: boolean
  mono?: boolean
}

export interface YiraButtonProps {
  key: string
  label?: string
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}

export const ui = {
  box: (props: YiraBoxProps, ...children: YiraNode[]): YiraNode => ({ type: 'Box', props, children }),
  text: (props: YiraTextProps, ...children: YiraNode[]): YiraNode => ({ type: 'Text', props, children }),
  button: (key: string, label: string, props: Omit<YiraButtonProps, 'key' | 'label'> = {}): YiraNode => (
    { type: 'Button', props: { key, label, ...props } }
  ),
  markdown: (text: string): YiraNode => ({ type: 'Markdown', props: { text } }),
  code: (source: string, language?: string): YiraNode => ({ type: 'Code', props: { source, language } }),
  divider: (): YiraNode => ({ type: 'Divider' }),
}

export interface YiraPanels {
  /** Publishes or replaces a panel; resolves false when Yira did not take it. */
  show: (id: string, title: string, tree: YiraNode) => Promise<boolean>
  close: (id: string) => Promise<void>
  /** Stops listening for presses. */
  stop: () => void
}

export type YiraPressHandler = (panelId: string, key: string) => void

interface Discovery {
  url: string
  token: string
}

const POLL_WAIT_MS = 15_000
const RETRY_DELAY_MS = 3_000

export async function connectYira($: EngineInterface, onPress: YiraPressHandler): Promise<YiraPanels | null> {
  const discoveryFile = await $.env.get('YIRA_MOD_BRIDGE_FILE')
  const tileId = await $.env.get('YIRA_AGENT_TILE_ID')
  if (!discoveryFile || !tileId) return null

  const plugin = $.plugin.name
  const shown = new Map<string, { title: string; tree: YiraNode }>()
  let discovery: Discovery | null = null
  let stopped = false

  async function readDiscovery(): Promise<Discovery | null> {
    try {
      const parsed = JSON.parse(await $.fs.read(discoveryFile!)) as Partial<Discovery>
      if (typeof parsed.url !== 'string' || typeof parsed.token !== 'string') return null
      return { url: parsed.url, token: parsed.token }
    } catch {
      return null
    }
  }

  // Yira writes a new address and token each time it starts. When they change,
  // the panels this mod showed are published again.
  async function refreshDiscovery(): Promise<boolean> {
    const next = await readDiscovery()
    const changed = next !== null && (next.url !== discovery?.url || next.token !== discovery?.token)
    discovery = next
    if (changed) {
      for (const [id, panel] of shown) await send('/panels', { tileId, plugin, id, ...panel }, false)
    }
    return changed
  }

  async function send(path: string, body: unknown, retry = true): Promise<boolean> {
    if (!discovery) await refreshDiscovery()
    if (!discovery) return false
    try {
      const response = await $.http.fetch(`${discovery.url}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${discovery.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (response.status !== 401) return response.ok
    } catch {
      // Yira is closed or restarted on another port.
    }
    if (retry && await refreshDiscovery()) return send(path, body, false)
    return false
  }

  async function poll(): Promise<number> {
    if (!discovery) await refreshDiscovery()
    if (!discovery) return RETRY_DELAY_MS
    const query = `tileId=${encodeURIComponent(tileId!)}&plugin=${encodeURIComponent(plugin)}&wait=${POLL_WAIT_MS}`
    try {
      const response = await $.http.fetch(`${discovery.url}/events?${query}`, {
        headers: { authorization: `Bearer ${discovery.token}` },
      })
      if (!response.ok) {
        await refreshDiscovery()
        return RETRY_DELAY_MS
      }
      const { events } = JSON.parse(response.text) as { events?: Array<{ kind: string; id: string; key: string }> }
      for (const event of events ?? []) {
        if (event.kind === 'press') onPress(event.id, event.key)
      }
      return 0
    } catch {
      await refreshDiscovery()
      return RETRY_DELAY_MS
    }
  }

  // A chain of one-shot timers: the engine cancels it when the module reloads.
  function schedule(delay: number): void {
    if (stopped) return
    $.clock.after(Math.max(delay, 10), () => {
      void poll().then(schedule, () => schedule(RETRY_DELAY_MS))
    })
  }

  await refreshDiscovery()
  schedule(0)

  return {
    show: async (id, title, tree) => {
      shown.set(id, { title, tree })
      return send('/panels', { tileId, plugin, id, title, tree })
    },
    close: async (id) => {
      shown.delete(id)
      await send('/panels/close', { tileId, plugin, id })
    },
    stop: () => {
      stopped = true
    },
  }
}
