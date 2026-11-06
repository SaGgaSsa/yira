/** Providers that can emit semantic lifecycle alerts to a Yira terminal. */
export type AgentProvider = 'codex' | 'claude'

/** Semantic alert kinds. PTY output is intentionally not part of this model. */
export type AgentAlertKind = 'completed' | 'permission' | 'input'

/** Attention priority derived from an alert kind. */
export type AgentAlertPriority = 'normal' | 'intervention'

/** The only fields retained from an incoming agent alert. */
export interface AgentAlert {
  provider: AgentProvider
  event: AgentAlertKind
  tileId: string
  detail?: string
}

/** State retained for one terminal attention episode. */
export interface AgentAlertState extends Omit<AgentAlert, 'event'> {
  event: AgentAlertKind
  priority: AgentAlertPriority
}

export type AgentAlertStateChange = (tileId: string, state: AgentAlertState | null) => void

export interface SemanticAgentAlertStateOptions {
  enabled?: boolean
  onChange?: AgentAlertStateChange
}

const PROVIDERS: readonly AgentProvider[] = ['codex', 'claude']
const KINDS: readonly AgentAlertKind[] = ['completed', 'permission', 'input']
const MAX_TILE_ID_LENGTH = 256
const MAX_DETAIL_LENGTH = 300

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeEnum<T extends string>(value: unknown, values: readonly T[]): T | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return values.includes(normalized as T) ? normalized as T : null
}

/**
 * Parse and normalize the minimal `{ provider, event, tileId, detail? }` alert.
 *
 * The returned object is freshly allocated and contains no command arguments,
 * transcript text, or other payload, even when those fields are present in the
 * input.
 */
export function normalizeAgentAlert(input: unknown): AgentAlert | null {
  if (!isRecord(input)) return null

  const provider = normalizeEnum(input.provider, PROVIDERS)
  const event = normalizeEnum(input.event, KINDS)
  if (!provider || !event || typeof input.tileId !== 'string') return null

  const tileId = input.tileId.trim()
  if (!tileId || tileId.length > MAX_TILE_ID_LENGTH) return null

  let detail: string | undefined
  if (typeof input.detail === 'string') {
    const normalized = input.detail.trim().slice(0, MAX_DETAIL_LENGTH)
    if (normalized) detail = normalized
  }

  return { provider, event, tileId, ...(detail ? { detail } : {}) }
}

function priorityFor(event: AgentAlertKind): AgentAlertPriority {
  return event === 'completed' ? 'normal' : 'intervention'
}

function cloneState(state: AgentAlertState): AgentAlertState {
  return { ...state }
}

/**
 * Small semantic state manager for agent attention episodes.
 *
 * It accepts only normalized semantic alert fields, stores one state per tile,
 * coalesces duplicate provider/kind/detail reports, and never consumes terminal
 * output.
 */
export class SemanticAgentAlertState {
  private readonly states = new Map<string, AgentAlertState>()

  private enabled: boolean

  private readonly onChange?: AgentAlertStateChange

  constructor(options: SemanticAgentAlertStateOptions = {}) {
    this.enabled = options.enabled ?? true
    this.onChange = options.onChange
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return
    this.enabled = enabled
    if (!enabled) this.clearAll()
  }

  /**
   * Record one semantic alert. Returns false when disabled, invalid, or
   * coalesced with the current provider/kind/detail episode.
   */
  report(input: unknown): boolean {
    if (!this.enabled) return false

    const alert = normalizeAgentAlert(input)
    if (!alert) return false

    const current = this.states.get(alert.tileId)
    if (current
      && current.provider === alert.provider
      && current.event === alert.event
      && current.detail === alert.detail) {
      return false
    }

    const next: AgentAlertState = {
      ...alert,
      priority: priorityFor(alert.event),
    }
    this.states.set(alert.tileId, next)
    this.onChange?.(alert.tileId, cloneState(next))
    return true
  }

  get(tileId: string): AgentAlertState | null {
    const state = this.states.get(tileId)
    return state ? cloneState(state) : null
  }

  has(tileId: string): boolean {
    return this.states.has(tileId)
  }

  snapshot(): ReadonlyMap<string, AgentAlertState> {
    const copy = new Map<string, AgentAlertState>()
    for (const [tileId, state] of this.states) copy.set(tileId, cloneState(state))
    return copy
  }

  clear(tileId: string): boolean {
    if (!this.states.delete(tileId)) return false
    this.onChange?.(tileId, null)
    return true
  }

  clearOnFocus(tileId: string): boolean {
    return this.clear(tileId)
  }

  clearOnInput(tileId: string): boolean {
    return this.clear(tileId)
  }

  clearOnDestroy(tileId: string): boolean {
    return this.clear(tileId)
  }

  clearAll(): void {
    for (const tileId of this.states.keys()) this.clear(tileId)
  }
}
