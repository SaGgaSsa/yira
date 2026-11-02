import type { AgentProvider } from './types'

export const BOT_ICON_IDS = ['history', 'eye', 'activity', 'book', 'bug', 'search', 'shield', 'sparkles', 'wrench', 'message'] as const
export type BotIconId = typeof BOT_ICON_IDS[number]
export const BOT_COLOR_IDS = ['amber', 'violet', 'lime', 'sky', 'rose', 'emerald', 'orange', 'slate'] as const
export type BotColorId = typeof BOT_COLOR_IDS[number]
/** Hex de cada color; el renderer usa el hex como texto y el mismo hex con alfa como fondo. */
export const BOT_COLOR_HEX: Readonly<Record<BotColorId, string>> = {
  amber: '#fbbf24',
  violet: '#a78bfa',
  lime: '#a3e635',
  sky: '#38bdf8',
  rose: '#fb7185',
  emerald: '#34d399',
  orange: '#fb923c',
  slate: '#94a3b8',
}

/** Yira tools a bot can be granted over MCP. */
export const BOT_TOOL_IDS = ['sessions_search', 'session_read', 'session_open', 'session_create', 'bots_call'] as const
export type BotToolId = typeof BOT_TOOL_IDS[number]

/** Main asks the renderer to show a session tile that a bot opened or started. */
export interface BotOpenSessionEvent {
  workspaceId: string
  tileId: string
}

/** Main asks the user to allow one bot session to start another bot. */
export interface BotCallConfirmRequest {
  requestId: string
  workspaceId: string
  callerName: string
  targetName: string
  prompt: string
}

export const BOT_NAME_MAX_LENGTH = 40
export const BOT_DESCRIPTION_MAX_LENGTH = 280
export const BOT_ROLE_MAX_LENGTH = 8000
export const BOT_MODEL_MAX_LENGTH = 64
export const MAX_BOTS = 50

export type BotWorkspaceScope = { mode: 'all' } | { mode: 'selected'; workspaceIds: string[] }

export interface BotDefinition {
  id: string            // formato `bot-<uuid>`
  name: string
  icon: BotIconId
  color: BotColorId
  provider: AgentProvider
  /** Vacío = modelo por defecto del CLI. */
  model: string
  /** Para qué sirve; lo ve el usuario al elegir el bot. */
  description: string
  /** Instrucciones que se agregan al system prompt del agente al iniciar. */
  role: string
  workspaces: BotWorkspaceScope
  /** Yira tools this bot may use. */
  tools: BotToolId[]
  /** Other bot sessions may start this bot through `bots_call`. */
  callable: boolean
  createdAt: string    // ISO
  updatedAt: string     // ISO
}

/** Normalized input: what the store receives after validation. */
export type NormalizedBotInput = Omit<BotDefinition, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

/** Input as the renderer sends it; grants are optional and default to none. */
export type BotDefinitionInput = Omit<NormalizedBotInput, 'tools' | 'callable'>
  & Partial<Pick<NormalizedBotInput, 'tools' | 'callable'>>

const BOT_MODEL_PATTERN = /^[A-Za-z0-9._:\-\[\]]{1,64}$/
const BOT_ID_PATTERN = /^bot-[A-Za-z0-9-]{1,64}$/
const MAX_WORKSPACE_IDS = 200
const MAX_WORKSPACE_ID_LENGTH = 128

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

export function isBotIconId(value: unknown): value is BotIconId {
  return typeof value === 'string' && (BOT_ICON_IDS as readonly string[]).includes(value)
}

export function isBotColorId(value: unknown): value is BotColorId {
  return typeof value === 'string' && (BOT_COLOR_IDS as readonly string[]).includes(value)
}

export function isBotToolId(value: unknown): value is BotToolId {
  return typeof value === 'string' && (BOT_TOOL_IDS as readonly string[]).includes(value)
}

export function isValidBotModel(value: string): boolean {
  return value === '' || BOT_MODEL_PATTERN.test(value)
}

export function isValidBotId(value: unknown): value is string {
  return typeof value === 'string' && BOT_ID_PATTERN.test(value)
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Bot name must be a string')
  const name = value.trim()
  if (name.length === 0) throw new Error('Bot name is required')
  if (name.length > BOT_NAME_MAX_LENGTH) {
    throw new Error(`Bot name must be ${BOT_NAME_MAX_LENGTH} characters or fewer`)
  }
  return name
}

function normalizeIcon(value: unknown): BotIconId {
  if (!isBotIconId(value)) throw new Error('Bot icon is invalid')
  return value
}

function normalizeColor(value: unknown): BotColorId {
  if (!isBotColorId(value)) throw new Error('Bot color is invalid')
  return value
}

function normalizeProvider(value: unknown): AgentProvider {
  if (value !== 'claude' && value !== 'codex') {
    throw new Error('Bot provider must be "claude" or "codex"')
  }
  return value
}

function normalizeModel(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Bot model must be a string')
  const model = value.trim()
  if (!isValidBotModel(model)) throw new Error('Bot model is invalid')
  return model
}

function normalizeDescription(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Bot description must be a string')
  const description = value.trim()
  if (description.length > BOT_DESCRIPTION_MAX_LENGTH) {
    throw new Error(`Bot description must be ${BOT_DESCRIPTION_MAX_LENGTH} characters or fewer`)
  }
  return description
}

function normalizeRole(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Bot role must be a string')
  const role = value.replace(/\r\n?/g, '\n').trim()
  if (role.length > BOT_ROLE_MAX_LENGTH) {
    throw new Error(`Bot role must be ${BOT_ROLE_MAX_LENGTH} characters or fewer`)
  }
  return role
}

function normalizeWorkspaceId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Bot workspace id must be a string')
  const workspaceId = value.trim()
  if (workspaceId.length === 0) throw new Error('Bot workspace id must not be empty')
  if (workspaceId.length > MAX_WORKSPACE_ID_LENGTH) {
    throw new Error(`Bot workspace id must be ${MAX_WORKSPACE_ID_LENGTH} characters or fewer`)
  }
  return workspaceId
}

function normalizeWorkspaces(value: unknown): BotWorkspaceScope {
  if (!isPlainRecord(value)) throw new Error('Bot workspaces must be an object')
  if (value.mode === 'all') return { mode: 'all' }
  if (value.mode !== 'selected') {
    throw new Error('Bot workspaces mode must be "all" or "selected"')
  }
  if (!Array.isArray(value.workspaceIds)) {
    throw new Error('Bot workspace ids must be an array')
  }

  const workspaceIds: string[] = []
  const seen = new Set<string>()
  for (const entry of value.workspaceIds) {
    const workspaceId = normalizeWorkspaceId(entry)
    if (seen.has(workspaceId)) continue
    seen.add(workspaceId)
    workspaceIds.push(workspaceId)
  }
  if (workspaceIds.length > MAX_WORKSPACE_IDS) {
    throw new Error(`Bot workspace ids support at most ${MAX_WORKSPACE_IDS} entries`)
  }
  return { mode: 'selected', workspaceIds }
}

function normalizeTools(value: unknown): BotToolId[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('Bot tools must be an array')
  for (const entry of value) {
    if (!isBotToolId(entry)) throw new Error('Bot tool is unknown')
  }
  return BOT_TOOL_IDS.filter((tool) => value.includes(tool))
}

function normalizeCallable(value: unknown): boolean {
  if (value === undefined) return false
  if (typeof value !== 'boolean') throw new Error('Bot callable must be a boolean')
  return value
}

export function normalizeBotInput(raw: unknown): NormalizedBotInput {
  if (!isPlainRecord(raw)) throw new Error('Bot input must be an object')

  const id = raw.id === undefined ? undefined : raw.id
  if (id !== undefined && !isValidBotId(id)) throw new Error('Bot id is invalid')

  return {
    ...(id !== undefined ? { id } : {}),
    name: normalizeName(raw.name),
    icon: normalizeIcon(raw.icon),
    color: normalizeColor(raw.color),
    provider: normalizeProvider(raw.provider),
    model: normalizeModel(raw.model),
    description: normalizeDescription(raw.description),
    role: normalizeRole(raw.role),
    workspaces: normalizeWorkspaces(raw.workspaces),
    tools: normalizeTools(raw.tools),
    callable: normalizeCallable(raw.callable),
  }
}

export function normalizeStoredBot(raw: unknown): BotDefinition | null {
  if (!isPlainRecord(raw)) return null
  let input: NormalizedBotInput
  try {
    input = normalizeBotInput(raw)
  } catch {
    return null
  }

  const id = input.id
  if (!isValidBotId(id)) return null
  if (typeof raw.createdAt !== 'string' || typeof raw.updatedAt !== 'string') return null

  return {
    ...input,
    id,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

export function isBotAvailableInWorkspace(
  bot: Pick<BotDefinition, 'workspaces'>,
  workspaceId: string,
): boolean {
  return bot.workspaces.mode === 'all' || bot.workspaces.workspaceIds.includes(workspaceId)
}

export function botHasTool(bot: Pick<BotDefinition, 'tools'>, tool: BotToolId): boolean {
  return bot.tools.includes(tool)
}
