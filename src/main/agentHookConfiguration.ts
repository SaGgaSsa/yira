/**
 * Pure configuration helpers for the semantic-agent hooks.
 *
 * The helpers in this module intentionally do not read or write files. Callers
 * can use the returned text with an adapter that performs its own
 * read-before-write and external-change check.
 */

export type AgentHookProvider = 'codex' | 'claude'
export type AgentHookOperation = 'install' | 'uninstall'
export type AgentHookMutationStatus =
  | 'installed'
  | 'already-installed'
  | 'uninstalled'
  | 'already-uninstalled'
  | 'malformed'
  | 'unsupported'
  | 'conflict'
  | 'invalid'

export interface AgentHookMutationResult {
  /** True when the configuration was valid and the requested operation completed. */
  readonly ok: boolean
  /** Alias for consumers that use success-oriented result handling. */
  readonly success: boolean
  readonly provider: AgentHookProvider
  readonly operation: AgentHookOperation
  readonly status: AgentHookMutationStatus
  readonly changed: boolean
  /** The original text on a failure, or the serialized configuration on success. */
  readonly text: string
  /** Safe, actionable text suitable for displaying in settings UI. */
  readonly message: string
}

export interface CodexHookSpec {
  readonly event: 'Stop' | 'PermissionRequest'
  readonly normalizedEvent: 'completed' | 'permission'
}

export interface ClaudeHookSpec {
  /** Claude's documented regular-expression matcher for Notification hooks. */
  readonly matcher: string
  readonly normalizedEvent: 'completed' | 'intervention'
}

/** Source events and normalized events installed for Codex. */
export const CODEX_HOOK_SPECS: readonly CodexHookSpec[] = [
  { event: 'Stop', normalizedEvent: 'completed' },
  { event: 'PermissionRequest', normalizedEvent: 'permission' },
]

/** Source matchers and normalized events installed for Claude Notification hooks. */
export const CLAUDE_HOOK_SPECS: readonly ClaudeHookSpec[] = [
  { matcher: 'idle_prompt|agent_completed', normalizedEvent: 'completed' },
  { matcher: 'permission_prompt|elicitation_dialog|agent_needs_input', normalizedEvent: 'intervention' },
]

/**
 * Stable command markers are part of the ownership contract for uninstall.
 *
 * A managed command is exactly the caller's resolved client command followed
 * by these two fixed arguments:
 *
 *   --yira-managed-agent-hook=<provider> --yira-normalized-event=<event>
 *
 * The marker lives in the command because Codex and Claude preserve only their
 * documented hook fields. An entry is removed only when its complete shape and
 * command match this convention; a marker with any other command is reported as
 * a conflict and left untouched.
 */
export const YIRA_MANAGED_HOOK_MARKER = '--yira-managed-agent-hook'
export const YIRA_MANAGED_EVENT_MARKER = '--yira-normalized-event'

type JsonObject = Record<string, unknown>

interface ParsedConfiguration {
  readonly ok: true
  readonly value: JsonObject
}

interface ParseFailure {
  readonly ok: false
  readonly status: 'malformed' | 'unsupported'
  readonly message: string
}

export type HookConfigurationParseResult = ParsedConfiguration | ParseFailure

/** Parse a provider's JSON configuration without exposing parser details. */
export function parseHookConfiguration(
  text: string,
  provider: AgentHookProvider,
): HookConfigurationParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      ok: false,
      status: 'malformed',
      message: `${providerLabel(provider)} configuration is malformed JSON; no changes were made.`,
    }
  }

  if (!isJsonObject(parsed)) {
    return {
      ok: false,
      status: 'unsupported',
      message: `${providerLabel(provider)} configuration must be a JSON object; no changes were made.`,
    }
  }

  return { ok: true, value: parsed }
}

/** Return the exact managed command that a hook configuration should contain. */
export function buildManagedAgentHookCommand(
  clientCommand: string,
  provider: AgentHookProvider,
  normalizedEvent: string,
): string {
  const command = clientCommand.trim()
  return `${command} ${YIRA_MANAGED_HOOK_MARKER}=${provider} ${YIRA_MANAGED_EVENT_MARKER}=${normalizedEvent}`
}

/** Install Yira-managed Stop and PermissionRequest groups in Codex hooks.json text. */
export function installCodexHookConfiguration(text: string, clientCommand: string): AgentHookMutationResult {
  return mutateConfiguration('codex', 'install', text, clientCommand)
}

/** Remove only untouched Yira-managed Codex groups from hooks.json text. */
export function uninstallCodexHookConfiguration(text: string, clientCommand: string): AgentHookMutationResult {
  return mutateConfiguration('codex', 'uninstall', text, clientCommand)
}

/** Install Yira-managed Notification matcher groups in Claude settings.json text. */
export function installClaudeHookConfiguration(text: string, clientCommand: string): AgentHookMutationResult {
  return mutateConfiguration('claude', 'install', text, clientCommand)
}

/** Remove only untouched Yira-managed Claude Notification groups from settings.json text. */
export function uninstallClaudeHookConfiguration(text: string, clientCommand: string): AgentHookMutationResult {
  return mutateConfiguration('claude', 'uninstall', text, clientCommand)
}

// Short aliases keep the pure API convenient for settings/IPC callers.
export const installCodexHooks = installCodexHookConfiguration
export const uninstallCodexHooks = uninstallCodexHookConfiguration
export const installClaudeHooks = installClaudeHookConfiguration
export const uninstallClaudeHooks = uninstallClaudeHookConfiguration

interface EventPlan {
  readonly key: string
  readonly spec: CodexHookSpec | ClaudeHookSpec
  readonly existing: JsonValue[] | undefined
  readonly managedIndices: readonly number[]
  readonly needsAddition: boolean
}

type JsonValue = unknown

function mutateConfiguration(
  provider: AgentHookProvider,
  operation: AgentHookOperation,
  text: string,
  clientCommand: string,
): AgentHookMutationResult {
  const baseCommand = clientCommand.trim()
  if (!baseCommand || baseCommand.includes(YIRA_MANAGED_HOOK_MARKER) || baseCommand.includes(YIRA_MANAGED_EVENT_MARKER)) {
    return failureResult(provider, operation, text, 'invalid', 'A resolved client command is required; no changes were made.')
  }

  const parsed = parseHookConfiguration(text, provider)
  if (!parsed.ok) return failureResult(provider, operation, text, parsed.status, parsed.message)

  const root = parsed.value
  const existingHooks = root.hooks
  if (existingHooks !== undefined && !isJsonObject(existingHooks)) {
    return failureResult(
      provider,
      operation,
      text,
      'unsupported',
      `${providerLabel(provider)} hooks must be a JSON object; no changes were made.`,
    )
  }

  const specs = provider === 'codex' ? CODEX_HOOK_SPECS : CLAUDE_HOOK_SPECS
  const plans: EventPlan[] = []
  let conflict = false
  let unsupportedMessage: string | null = null

  for (const spec of specs) {
    // Codex keys its groups by source event. Claude follows the documented
    // settings.json shape: all of these matchers live under Notification.
    const key = provider === 'codex' ? (spec as CodexHookSpec).event : 'Notification'
    const existing = existingHooks?.[key]
    if (existing === undefined) {
      plans.push({ key, spec, existing: undefined, managedIndices: [], needsAddition: operation === 'install' })
      continue
    }

    if (!Array.isArray(existing)) {
      unsupportedMessage = `${providerLabel(provider)} ${key} hooks must be an array of hook groups; no changes were made.`
      break
    }

    const managedIndices: number[] = []
    for (let index = 0; index < existing.length; index += 1) {
      const entry = existing[index]
      const entryValidation = inspectHookGroup(provider, entry, spec, baseCommand)
      if (entryValidation === 'unsupported') {
        unsupportedMessage = `${providerLabel(provider)} ${key} contains an incompatible inline hook structure; no changes were made.`
        break
      }
      if (entryValidation === 'conflict') conflict = true
      if (entryValidation === 'managed') managedIndices.push(index)
    }
    if (unsupportedMessage) break

    plans.push({
      key,
      spec,
      existing: existing as JsonValue[],
      managedIndices,
      needsAddition: operation === 'install' && managedIndices.length === 0,
    })
  }

  if (unsupportedMessage) return failureResult(provider, operation, text, 'unsupported', unsupportedMessage)
  if (conflict) {
    return failureResult(
      provider,
      operation,
      text,
      'conflict',
      `A Yira-managed ${providerLabel(provider)} hook was changed externally; review it before retrying.`,
    )
  }

  const shouldChange = plans.some((plan) => operation === 'install' ? plan.needsAddition : plan.managedIndices.length > 0)
  if (!shouldChange) {
    return successResult(
      provider,
      operation,
      text,
      operation === 'install' ? 'already-installed' : 'already-uninstalled',
      false,
      operation === 'install'
        ? `${providerLabel(provider)} hooks are already installed.`
        : `No Yira-managed ${providerLabel(provider)} hooks were found.`,
    )
  }

  const hooks = existingHooks ?? {}
  if (operation === 'install') {
    for (const plan of plans) {
      if (!plan.needsAddition) continue
      const managedEntry = makeManagedEntry(provider, plan.spec, baseCommand)
      if (plan.existing) plan.existing.push(managedEntry)
      else if (Array.isArray(hooks[plan.key])) (hooks[plan.key] as JsonValue[]).push(managedEntry)
      else hooks[plan.key] = [managedEntry]
    }
  } else {
    // Claude has two managed specs in one Notification array. Combine their
    // indices before assigning the array so the second spec cannot restore an
    // entry removed while processing the first one.
    const removals = new Map<string, { source: JsonValue[]; indices: Set<number> }>()
    for (const plan of plans) {
      if (!plan.existing || plan.managedIndices.length === 0) continue
      const removal = removals.get(plan.key) ?? { source: plan.existing, indices: new Set<number>() }
      for (const index of plan.managedIndices) removal.indices.add(index)
      removals.set(plan.key, removal)
    }
    for (const [key, removal] of removals) {
      const remaining = removal.source.filter((_entry, index) => !removal.indices.has(index))
      if (remaining.length === 0) delete hooks[key]
      else hooks[key] = remaining
    }
  }

  if (Object.keys(hooks).length === 0) delete root.hooks
  else root.hooks = hooks

  const serialized = serializeConfiguration(root, text)
  return successResult(
    provider,
    operation,
    serialized,
    operation === 'install' ? 'installed' : 'uninstalled',
    true,
    operation === 'install'
      ? `Installed Yira-managed ${providerLabel(provider)} hooks.`
      : `Removed Yira-managed ${providerLabel(provider)} hooks.`,
  )
}

type HookGroupInspection = 'unrelated' | 'managed' | 'conflict' | 'unsupported'

function inspectHookGroup(
  provider: AgentHookProvider,
  entry: unknown,
  spec: CodexHookSpec | ClaudeHookSpec,
  clientCommand: string,
): HookGroupInspection {
  if (!isJsonObject(entry)) return 'unsupported'

  // A direct {type, command} entry is an inline structure. Never rewrite it
  // into the nested group form expected by the official hook configuration.
  if ('type' in entry || 'command' in entry) return 'unsupported'

  const nestedHooks = entry.hooks
  if (!Array.isArray(nestedHooks)) return 'unsupported'
  if (provider === 'claude' && 'matcher' in entry && typeof entry.matcher !== 'string') return 'unsupported'

  let markerFound = false
  let matchingMarkerFound = false
  let malformedCurrentMarker = false
  for (const hook of nestedHooks) {
    if (!isJsonObject(hook) || typeof hook.type !== 'string') return 'unsupported'
    if (hook.type === 'command' && typeof hook.command !== 'string') return 'unsupported'
    if (typeof hook.command === 'string' && hasManagedMarker(hook.command)) {
      markerFound = true
      const identity = readManagedIdentity(hook.command)
      if (identity?.provider === provider) {
        if (identity.normalizedEvent === spec.normalizedEvent) matchingMarkerFound = true
        else if (!isKnownNormalizedEvent(provider, identity.normalizedEvent)) malformedCurrentMarker = true
      } else if (readManagedProvider(hook.command) === provider) {
        malformedCurrentMarker = true
      }
    }
  }

  if (!markerFound) return 'unrelated'

  if (malformedCurrentMarker) return 'conflict'

  // A Claude Notification array contains both normalized-event groups. A
  // managed group for the other event is unrelated to this spec, not a
  // conflict. Matching markers with a changed command remain conflicts.
  if (!matchingMarkerFound) return 'unrelated'

  const expectedCommand = buildManagedAgentHookCommand(clientCommand, provider, spec.normalizedEvent)
  if (!isExactManagedEntry(provider, entry, spec, expectedCommand)) return 'conflict'
  return 'managed'
}

function isExactManagedEntry(
  provider: AgentHookProvider,
  entry: JsonObject,
  spec: CodexHookSpec | ClaudeHookSpec,
  expectedCommand: string,
): boolean {
  const expectedKeys = provider === 'codex' ? ['hooks'] : ['matcher', 'hooks']
  if (!sameKeys(entry, expectedKeys)) return false
  if (provider === 'claude' && entry.matcher !== (spec as ClaudeHookSpec).matcher) return false

  const nestedHooks = entry.hooks
  if (!Array.isArray(nestedHooks) || nestedHooks.length !== 1) return false
  const hook = nestedHooks[0]
  if (!isJsonObject(hook) || !sameKeys(hook, ['type', 'command'])) return false
  return hook.type === 'command' && hook.command === expectedCommand
}

function makeManagedEntry(
  provider: AgentHookProvider,
  spec: CodexHookSpec | ClaudeHookSpec,
  clientCommand: string,
): JsonObject {
  const hook = {
    type: 'command',
    command: buildManagedAgentHookCommand(clientCommand, provider, spec.normalizedEvent),
  }
  if (provider === 'codex') return { hooks: [hook] }
  return { matcher: (spec as ClaudeHookSpec).matcher, hooks: [hook] }
}

function hasManagedMarker(command: string): boolean {
  const tokens = command.split(/\s+/)
  return tokens.some((token) => token.startsWith(`${YIRA_MANAGED_HOOK_MARKER}=`))
}

function readManagedIdentity(command: string): { provider: string; normalizedEvent: string } | null {
  const tokens = command.split(/\s+/)
  const providerToken = tokens.find((token) => token.startsWith(`${YIRA_MANAGED_HOOK_MARKER}=`))
  const eventToken = tokens.find((token) => token.startsWith(`${YIRA_MANAGED_EVENT_MARKER}=`))
  if (!providerToken || !eventToken) return null
  const provider = providerToken.slice(`${YIRA_MANAGED_HOOK_MARKER}=`.length)
  const normalizedEvent = eventToken.slice(`${YIRA_MANAGED_EVENT_MARKER}=`.length)
  if (!provider || !normalizedEvent) return null
  return { provider, normalizedEvent }
}

function readManagedProvider(command: string): string | null {
  const token = command.split(/\s+/).find((item) => item.startsWith(`${YIRA_MANAGED_HOOK_MARKER}=`))
  if (!token) return null
  const provider = token.slice(`${YIRA_MANAGED_HOOK_MARKER}=`.length)
  return provider || null
}

function isKnownNormalizedEvent(provider: AgentHookProvider, normalizedEvent: string): boolean {
  const specs = provider === 'codex' ? CODEX_HOOK_SPECS : CLAUDE_HOOK_SPECS
  return specs.some((spec) => spec.normalizedEvent === normalizedEvent)
}

function sameKeys(value: JsonObject, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index])
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function serializeConfiguration(value: JsonObject, originalText: string): string {
  const hasNewline = originalText.includes('\n') || originalText.includes('\r')
  const indent = hasNewline ? detectIndent(originalText) : 0
  let serialized = JSON.stringify(value, null, indent)
  const newline = originalText.includes('\r\n') ? '\r\n' : '\n'
  if (hasNewline && newline !== '\n') serialized = serialized.replaceAll('\n', newline)
  if (originalText.endsWith('\n') || originalText.endsWith('\r')) serialized += newline
  return serialized
}

function detectIndent(text: string): string | number {
  const match = text.match(/(?:^|\r?\n)([ \t]+)"/)
  return match?.[1] ?? 2
}

function providerLabel(provider: AgentHookProvider): string {
  return provider === 'codex' ? 'Codex' : 'Claude'
}

function failureResult(
  provider: AgentHookProvider,
  operation: AgentHookOperation,
  text: string,
  status: Extract<AgentHookMutationStatus, 'malformed' | 'unsupported' | 'conflict' | 'invalid'>,
  message: string,
): AgentHookMutationResult {
  return { ok: false, success: false, provider, operation, status, changed: false, text, message }
}

function successResult(
  provider: AgentHookProvider,
  operation: AgentHookOperation,
  text: string,
  status: Extract<AgentHookMutationStatus, 'installed' | 'already-installed' | 'uninstalled' | 'already-uninstalled'>,
  changed: boolean,
  message: string,
): AgentHookMutationResult {
  return { ok: true, success: true, provider, operation, status, changed, text, message }
}
