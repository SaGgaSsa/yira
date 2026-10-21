// Panels that Claude Code mods running inside a Yira terminal publish to the
// workspace panel. The mod reaches the main process through a loopback HTTP
// bridge whose address it reads from the file named by MOD_PANEL_BRIDGE_FILE_ENV.

export const MOD_PANEL_BRIDGE_FILE_ENV = 'YIRA_MOD_BRIDGE_FILE'

export const MOD_PANEL_MAX_BODY_BYTES = 512 * 1024
export const MOD_PANEL_MAX_NODES = 2_000
export const MOD_PANEL_MAX_DEPTH = 24
export const MOD_PANEL_MAX_TEXT_LENGTH = 100_000
export const MOD_PANEL_MAX_ID_LENGTH = 128

/** Contents of the discovery file the main process writes at startup. */
export interface ModPanelBridgeDiscovery {
  url: string
  token: string
  pid: number
}

export type ModPanelColor = 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'danger'

export type ModPanelNode = string | ModPanelElement

export type ModPanelElement =
  | { type: 'Box'; props?: ModPanelBoxProps; children?: ModPanelNode[] }
  | { type: 'Text'; props?: ModPanelTextProps; children?: ModPanelNode[] }
  | { type: 'Button'; props: ModPanelButtonProps; children?: ModPanelNode[] }
  | { type: 'Markdown'; props: { text: string } }
  | { type: 'Code'; props: { source: string; language?: string } }
  | { type: 'Divider' }

export interface ModPanelBoxProps {
  flexDirection?: 'row' | 'column'
  gap?: number
  padding?: number
  border?: boolean
  wrap?: boolean
}

export interface ModPanelTextProps {
  color?: ModPanelColor
  bold?: boolean
  italic?: boolean
  dim?: boolean
  mono?: boolean
}

export interface ModPanelButtonProps {
  key: string
  label?: string
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}

/** Identifies one panel: the agent terminal tile, the mod (plugin name) and the mod's own panel id. */
export interface ModPanelAddress {
  tileId: string
  plugin: string
  id: string
}

export interface ModPanel extends ModPanelAddress {
  title: string
  tree: ModPanelNode
  updatedAt: number
}

export type ModPanelChange =
  | { type: 'upsert'; panel: ModPanel }
  | { type: 'close'; address: ModPanelAddress }

/** A press the renderer sends back to the mod that drew the button. */
export interface ModPanelPress extends ModPanelAddress {
  key: string
}

/** What the mod receives from GET /events: presses on its panels for its tile. */
export interface ModPanelEvent {
  kind: 'press'
  id: string
  key: string
}

const MOD_PANEL_ELEMENT_TYPES = ['Box', 'Text', 'Button', 'Markdown', 'Code', 'Divider'] as const
const MOD_PANEL_COLORS: readonly ModPanelColor[] = ['default', 'muted', 'accent', 'success', 'warning', 'danger']
const MOD_PANEL_MAX_SPACING = 8
const MOD_PANEL_MAX_LANGUAGE_LENGTH = 64

type ModPanelElementType = (typeof MOD_PANEL_ELEMENT_TYPES)[number]

interface SanitizeState {
  remaining: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isModPanelElementType(value: unknown): value is ModPanelElementType {
  return typeof value === 'string' && (MOD_PANEL_ELEMENT_TYPES as readonly string[]).includes(value)
}

function isModPanelColor(value: unknown): value is ModPanelColor {
  return typeof value === 'string' && (MOD_PANEL_COLORS as readonly string[]).includes(value)
}

function clipText(value: string): string {
  return value.length > MOD_PANEL_MAX_TEXT_LENGTH ? value.slice(0, MOD_PANEL_MAX_TEXT_LENGTH) : value
}

function clipId(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MOD_PANEL_MAX_ID_LENGTH) return null
  return trimmed
}

function clampSpacing(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(MOD_PANEL_MAX_SPACING, Math.max(0, Math.round(value)))
}

function sanitizeBoxProps(value: unknown): ModPanelBoxProps | undefined {
  if (!isRecord(value)) return undefined
  const props: ModPanelBoxProps = {}
  if (value.flexDirection === 'row' || value.flexDirection === 'column') props.flexDirection = value.flexDirection
  const gap = clampSpacing(value.gap)
  if (gap !== undefined) props.gap = gap
  const padding = clampSpacing(value.padding)
  if (padding !== undefined) props.padding = padding
  if (typeof value.border === 'boolean') props.border = value.border
  if (typeof value.wrap === 'boolean') props.wrap = value.wrap
  return Object.keys(props).length > 0 ? props : undefined
}

function sanitizeTextProps(value: unknown): ModPanelTextProps | undefined {
  if (!isRecord(value)) return undefined
  const props: ModPanelTextProps = {}
  if (isModPanelColor(value.color)) props.color = value.color
  if (typeof value.bold === 'boolean') props.bold = value.bold
  if (typeof value.italic === 'boolean') props.italic = value.italic
  if (typeof value.dim === 'boolean') props.dim = value.dim
  if (typeof value.mono === 'boolean') props.mono = value.mono
  return Object.keys(props).length > 0 ? props : undefined
}

function sanitizeButtonProps(value: unknown): ModPanelButtonProps | null {
  if (!isRecord(value) || typeof value.key !== 'string') return null
  const key = clipId(value.key)
  if (!key) return null
  const props: ModPanelButtonProps = { key }
  if (typeof value.label === 'string') props.label = clipText(value.label)
  if (value.variant === 'primary' || value.variant === 'secondary') props.variant = value.variant
  if (typeof value.disabled === 'boolean') props.disabled = value.disabled
  return props
}

function sanitizeMarkdownProps(value: unknown): { text: string } | null {
  if (!isRecord(value) || typeof value.text !== 'string') return null
  return { text: clipText(value.text) }
}

function sanitizeCodeProps(value: unknown): { source: string; language?: string } | null {
  if (!isRecord(value) || typeof value.source !== 'string') return null
  const props: { source: string; language?: string } = { source: clipText(value.source) }
  if (typeof value.language === 'string') {
    props.language = value.language.slice(0, MOD_PANEL_MAX_LANGUAGE_LENGTH)
  }
  return props
}

function takeNode(state: SanitizeState): boolean {
  if (state.remaining <= 0) return false
  state.remaining -= 1
  return true
}

function isTextChild(value: unknown): boolean {
  return typeof value === 'string'
    || typeof value === 'number'
    || (isRecord(value) && value.type === 'Text')
}

function sanitizeChildren(
  value: unknown,
  depth: number,
  state: SanitizeState,
  textOnly: boolean,
): ModPanelNode[] {
  if (!Array.isArray(value)) return []
  const children: ModPanelNode[] = []
  for (const item of value) {
    if (Array.isArray(item)) {
      children.push(...sanitizeChildren(item, depth, state, textOnly))
      continue
    }
    if (textOnly && !isTextChild(item)) continue
    const child = sanitizeNode(item, depth, state)
    if (child !== null) children.push(child)
  }
  return children
}

function sanitizeNode(value: unknown, depth: number, state: SanitizeState): ModPanelNode | null {
  if (typeof value === 'string' || typeof value === 'number') {
    return takeNode(state) ? clipText(String(value)) : null
  }
  if (!isRecord(value) || !isModPanelElementType(value.type)) return null
  if (depth > MOD_PANEL_MAX_DEPTH) return null
  if (!takeNode(state)) return null

  switch (value.type) {
    case 'Box': {
      const props = sanitizeBoxProps(value.props)
      const children = sanitizeChildren(value.children, depth + 1, state, false)
      return {
        type: 'Box',
        ...(props ? { props } : {}),
        ...(children.length > 0 ? { children } : {}),
      }
    }
    case 'Text': {
      const props = sanitizeTextProps(value.props)
      const children = sanitizeChildren(value.children, depth + 1, state, true)
      return {
        type: 'Text',
        ...(props ? { props } : {}),
        ...(children.length > 0 ? { children } : {}),
      }
    }
    case 'Button': {
      const props = sanitizeButtonProps(value.props)
      if (!props) return null
      const children = sanitizeChildren(value.children, depth + 1, state, true)
      return {
        type: 'Button',
        props,
        ...(children.length > 0 ? { children } : {}),
      }
    }
    case 'Markdown': {
      const props = sanitizeMarkdownProps(value.props)
      return props ? { type: 'Markdown', props } : null
    }
    case 'Code': {
      const props = sanitizeCodeProps(value.props)
      return props ? { type: 'Code', props } : null
    }
    case 'Divider':
      return { type: 'Divider' }
  }
}

/**
 * Rebuilds a panel tree with literal objects, keeping only values the panel
 * renderer understands. Oversized or over-nested trees are trimmed, never
 * rejected as a whole.
 */
export function sanitizeModPanelTree(value: unknown): ModPanelNode | null {
  if (Array.isArray(value)) return null
  return sanitizeNode(value, 1, { remaining: MOD_PANEL_MAX_NODES })
}

export function normalizeModPanelAddress(value: unknown): ModPanelAddress | null {
  if (!isRecord(value)) return null
  if (typeof value.tileId !== 'string' || typeof value.plugin !== 'string' || typeof value.id !== 'string') {
    return null
  }
  const tileId = clipId(value.tileId)
  const plugin = clipId(value.plugin)
  const id = clipId(value.id)
  if (!tileId || !plugin || !id) return null
  return { tileId, plugin, id }
}

export function modPanelKey(address: ModPanelAddress): string {
  return `${address.tileId}\n${address.plugin}\n${address.id}`
}
