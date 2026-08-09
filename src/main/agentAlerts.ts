/** Providers that can emit semantic lifecycle hooks to a Yira terminal. */
export type AgentProvider = 'codex' | 'claude'

/** Semantic hook kinds. PTY output is intentionally not part of this model. */
export type AgentAlertKind = 'completed' | 'permission' | 'input'

/** Attention priority derived from an alert kind. */
export type AgentAlertPriority = 'normal' | 'intervention'

/** The only fields retained from an incoming agent hook envelope. */
export interface AgentAlert {
  provider: AgentProvider
  event: AgentAlertKind
  tileId: string
}

/** Alias used by callers that want to make the normalization boundary explicit. */
export type NormalizedAgentAlert = AgentAlert

/** State retained for one terminal attention episode. */
export interface AgentAlertState extends AgentAlert {
  priority: AgentAlertPriority
}

/** Untrusted hook input. Extra properties are ignored by {@link normalizeAgentAlert}. */
export interface AgentAlertHookEnvelope {
  provider?: unknown
  event?: unknown
  tileId?: unknown
  [key: string]: unknown
}

export type AgentAlertStateChange = (tileId: string, state: AgentAlertState | null) => void

export interface SemanticAgentAlertStateOptions {
  enabled?: boolean
  onChange?: AgentAlertStateChange
}

const PROVIDERS: readonly AgentProvider[] = ['codex', 'claude']
const KINDS: readonly AgentAlertKind[] = ['completed', 'permission', 'input']
const MAX_TILE_ID_LENGTH = 256

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeEnum<T extends string>(value: unknown, values: readonly T[]): T | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return values.includes(normalized as T) ? normalized as T : null
}

/**
 * Parse and normalize the minimal `{ provider, event, tileId }` hook envelope.
 *
 * The returned object is freshly allocated and contains no command arguments,
 * transcript text, or other hook payload, even when those fields are present in
 * the input.
 */
export function normalizeAgentAlert(input: unknown): NormalizedAgentAlert | null {
  if (!isRecord(input)) return null

  const provider = normalizeEnum(input.provider, PROVIDERS)
  const event = normalizeEnum(input.event, KINDS)
  if (!provider || !event || typeof input.tileId !== 'string') return null

  const tileId = input.tileId.trim()
  if (!tileId || tileId.length > MAX_TILE_ID_LENGTH) return null

  return { provider, event, tileId }
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
 * It accepts only normalized semantic hook fields, stores one state per tile,
 * coalesces duplicate provider/kind reports, and never consumes terminal output.
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
   * coalesced with the current provider/kind episode.
   */
  report(input: unknown): boolean {
    if (!this.enabled) return false

    const alert = normalizeAgentAlert(input)
    if (!alert) return false

    const current = this.states.get(alert.tileId)
    if (current?.priority === 'intervention' && alert.event === 'completed') {
      return false
    }
    if (current && current.provider === alert.provider && current.event === alert.event) {
      return false
    }

    const nextPriority = current?.priority === 'intervention'
      ? 'intervention'
      : priorityFor(alert.event)
    const next: AgentAlertState = {
      ...alert,
      priority: nextPriority,
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
