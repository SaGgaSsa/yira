import {
  isBotAvailableInWorkspace,
  type BotCallConfirmRequest,
  type BotDefinition,
  type BotOpenSessionEvent,
} from '@shared/bots'
import type { AgentActiveSession, AgentProvider } from '@shared/types'

import { searchSessionContent } from '../agents/contentSearch'
import { readAgentSessionHistory } from '../agents/history'
import { readAgentSessionTranscript } from '../agents/transcript'
import type { BotToolContext, BotToolProvider, McpToolDefinition } from './botBridge'

export interface BotToolWorkspace {
  id: string
  name: string
  rootFolderPath: string
}

export interface BotToolDependencies {
  getWorkspaces: () => Promise<BotToolWorkspace[]>
  getBots: () => Promise<BotDefinition[]>
  getLauncher: () => ((input: unknown) => Promise<{ workspaceId: string; tileId: string; provider: AgentProvider }>) | null
  getActiveSessions: () => AgentActiveSession[]
  openSession: (event: BotOpenSessionEvent) => void
  confirmBotCall: (input: Omit<BotCallConfirmRequest, 'requestId'>) => Promise<boolean>
  searchContent?: typeof searchSessionContent
  readTranscript?: typeof readAgentSessionTranscript
  readHistory?: typeof readAgentSessionHistory
}

type Args = Record<string, unknown>

const MAX_QUERY_LENGTH = 200
const MAX_SESSION_ID_LENGTH = 200
const MAX_PROMPT_LENGTH = 20_000
const MAX_SEARCH_LIMIT = 20
const DEFAULT_READ_LIMIT = 40
const MAX_READ_LIMIT = 80
const MAX_ENTRY_TEXT_LENGTH = 2_000
const HISTORY_LOOKUP_LIMIT = 5

const PROVIDER_PROPERTY = { type: 'string', enum: ['claude', 'codex'] }

const LAUNCHER_MISSING_MESSAGE = 'Yira is still starting; try again.'
const SESSION_NOT_FOUND_MESSAGE = 'Session not found in the workspaces this bot can access.'

function objectSchema(properties: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false }
}

// Argument validation

function readText(args: Args, key: string, maxLength: number): string {
  const value = args[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`"${key}" is required and must be a non-empty string.`)
  }
  const text = value.trim()
  if (text.length > maxLength) throw new Error(`"${key}" must be ${maxLength} characters or fewer.`)
  return text
}

function readProvider(args: Args, key: string): AgentProvider {
  const value = args[key]
  if (value !== 'claude' && value !== 'codex') throw new Error(`"${key}" must be "claude" or "codex".`)
  return value
}

function readOptionalProvider(args: Args, key: string): AgentProvider | undefined {
  return args[key] === undefined ? undefined : readProvider(args, key)
}

function readOptionalInteger(args: Args, key: string, min: number, max: number): number | undefined {
  const value = args[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`"${key}" must be a whole number from ${min} to ${max}.`)
  }
  return value
}

// Workspace scope

/** Workspaces the calling bot may touch: enabled for the bot and with a root folder. */
async function readAllowedWorkspaces(
  deps: BotToolDependencies,
  context: BotToolContext,
): Promise<BotToolWorkspace[]> {
  const workspaces = await deps.getWorkspaces()
  return workspaces.filter((workspace) => isBotAvailableInWorkspace(context.bot, workspace.id))
}

/** The session's own workspace comes first so lookups prefer it. */
function ownWorkspaceFirst(workspaces: BotToolWorkspace[], ownId: string): BotToolWorkspace[] {
  return [
    ...workspaces.filter((workspace) => workspace.id === ownId),
    ...workspaces.filter((workspace) => workspace.id !== ownId),
  ]
}

function requireOwnWorkspaceAccess(context: BotToolContext): void {
  if (!isBotAvailableInWorkspace(context.bot, context.scope.workspaceId)) {
    throw new Error('This bot is not enabled for the current workspace.')
  }
}

function requireLauncher(deps: BotToolDependencies): NonNullable<ReturnType<BotToolDependencies['getLauncher']>> {
  const launcher = deps.getLauncher()
  if (!launcher) throw new Error(LAUNCHER_MISSING_MESSAGE)
  return launcher
}

function findActiveSessionId(deps: BotToolDependencies, tileId: string): string | undefined {
  return deps.getActiveSessions().find((session) => session.tileId === tileId)?.sessionId
}

// sessions_search

function formatDay(isoDate: string): string {
  const time = Date.parse(isoDate)
  return Number.isNaN(time) ? 'unknown date' : new Date(time).toISOString().slice(0, 10)
}

function formatMatch(
  index: number,
  match: Awaited<ReturnType<typeof searchSessionContent>>[number],
  workspaceName: string,
): string {
  const title = match.title ?? 'untitled'
  const header = `${index}. ${match.provider} ${match.identifier} · ${workspaceName} · ${formatDay(match.lastActivityAt)} · "${title}" (${match.matchCount} matches)`
  return [header, ...match.snippets.map((snippet) => `   ${snippet}`)].join('\n')
}

function createSearchProvider(deps: BotToolDependencies): BotToolProvider {
  const searchContent = deps.searchContent ?? searchSessionContent

  const definition: McpToolDefinition = {
    name: 'sessions_search',
    description: 'Search the text of past and running agent sessions in Yira. Use it to find earlier work, decisions or errors. By default it searches only this workspace; pass scope "all" to search every workspace this bot can access. Returns matching sessions with short snippets; read one fully with session_read.',
    inputSchema: objectSchema({
      query: { type: 'string', description: 'Words to look for (2 to 200 characters).' },
      scope: { type: 'string', enum: ['workspace', 'all'], description: 'workspace (default) searches this workspace only; all searches every accessible workspace.' },
      provider: { ...PROVIDER_PROPERTY, description: 'Only search sessions of this agent.' },
      limit: { type: 'integer', minimum: 1, maximum: MAX_SEARCH_LIMIT, description: 'Maximum sessions to return.' },
    }, ['query']),
  }

  return {
    grant: 'sessions_search',
    definitions: [definition],
    async call(_name, args, context) {
      const query = readText(args, 'query', MAX_QUERY_LENGTH)
      const scope = args.scope ?? 'workspace'
      if (scope !== 'workspace' && scope !== 'all') throw new Error('"scope" must be "workspace" or "all".')
      const provider = readOptionalProvider(args, 'provider')
      const limit = readOptionalInteger(args, 'limit', 1, MAX_SEARCH_LIMIT)

      const allowed = await readAllowedWorkspaces(deps, context)
      const searched = scope === 'all'
        ? allowed
        : allowed.filter((workspace) => workspace.id === context.scope.workspaceId)
      if (searched.length === 0) throw new Error('No workspace with a root folder is available to this bot.')

      const matches = await searchContent({
        query,
        workspaceRoots: searched.map((workspace) => workspace.rootFolderPath),
        ...(provider ? { provider } : {}),
        ...(limit ? { limit } : {}),
      })
      if (matches.length === 0) return `No sessions matched "${query}".`

      const nameByRoot = new Map(searched.map((workspace) => [workspace.rootFolderPath, workspace.name]))
      const blocks = matches.map((match, position) =>
        formatMatch(position + 1, match, nameByRoot.get(match.workspaceRoot) ?? match.workspaceRoot))
      return [...blocks, 'Read one with session_read(provider, sessionId).'].join('\n')
    },
  }
}

// session_read

function formatEntry(index: number, kind: string, text: string): string {
  const shown = text.length > MAX_ENTRY_TEXT_LENGTH ? `${text.slice(0, MAX_ENTRY_TEXT_LENGTH)}…` : text
  return `[${index}] ${kind}: ${shown}`
}

function createReadProvider(deps: BotToolDependencies): BotToolProvider {
  const readTranscript = deps.readTranscript ?? readAgentSessionTranscript

  const definition: McpToolDefinition = {
    name: 'session_read',
    description: 'Read the conversation of one agent session, newest entries first page. Use it after sessions_search to see what was said and decided. If older entries exist, call again with "before" set to the number shown at the end.',
    inputSchema: objectSchema({
      provider: { ...PROVIDER_PROPERTY, description: 'Agent that ran the session.' },
      sessionId: { type: 'string', description: 'Session id from sessions_search.' },
      before: { type: 'integer', minimum: 0, description: 'Read the entries before this entry number.' },
      limit: { type: 'integer', minimum: 1, maximum: MAX_READ_LIMIT, description: `Entries to read (default ${DEFAULT_READ_LIMIT}).` },
    }, ['provider', 'sessionId']),
  }

  return {
    grant: 'session_read',
    definitions: [definition],
    async call(_name, args, context) {
      const provider = readProvider(args, 'provider')
      const sessionId = readText(args, 'sessionId', MAX_SESSION_ID_LENGTH)
      const before = readOptionalInteger(args, 'before', 0, Number.MAX_SAFE_INTEGER)
      const limit = readOptionalInteger(args, 'limit', 1, MAX_READ_LIMIT) ?? DEFAULT_READ_LIMIT

      const allowed = ownWorkspaceFirst(await readAllowedWorkspaces(deps, context), context.scope.workspaceId)
      for (const workspace of allowed) {
        const transcript = await readTranscript(
          { provider, identifier: sessionId, ...(before !== undefined ? { before } : {}), limit },
          { workspaceRoot: workspace.rootFolderPath },
        )
        if (!transcript.found) continue

        const { entries, start, total } = transcript
        const first = entries.length === 0 ? 0 : start + 1
        const lines = [
          `Session ${sessionId} (${provider}), entries ${first}-${start + entries.length} of ${total}:`,
          ...entries.map((entry, offset) => formatEntry(start + offset, entry.kind, entry.text)),
        ]
        if (start > 0) lines.push(`Older entries: session_read with before=${start}.`)
        return lines.join('\n')
      }
      throw new Error(SESSION_NOT_FOUND_MESSAGE)
    },
  }
}

// session_open

async function findStoppedSession(
  deps: BotToolDependencies,
  workspaces: BotToolWorkspace[],
  provider: AgentProvider,
  sessionId: string,
): Promise<{ workspace: BotToolWorkspace; cwd?: string } | null> {
  const readHistory = deps.readHistory ?? readAgentSessionHistory
  for (const workspace of workspaces) {
    const history = await readHistory({
      workspaceRoot: workspace.rootFolderPath,
      provider,
      search: sessionId,
      limit: HISTORY_LOOKUP_LIMIT,
    })
    const item = history.items.find((candidate) => candidate.identifier === sessionId)
    if (item) return { workspace, cwd: item.cwd }
  }
  return null
}

function createOpenProvider(deps: BotToolDependencies): BotToolProvider {
  const definition: McpToolDefinition = {
    name: 'session_open',
    description: 'Show an agent session to the user in Yira. A running session is brought into view; a finished one is resumed in a new tile. Use it when the user asks to see or continue a session you found.',
    inputSchema: objectSchema({
      provider: { ...PROVIDER_PROPERTY, description: 'Agent that ran the session.' },
      sessionId: { type: 'string', description: 'Session id from sessions_search.' },
    }, ['provider', 'sessionId']),
  }

  return {
    grant: 'session_open',
    definitions: [definition],
    async call(_name, args, context) {
      const provider = readProvider(args, 'provider')
      const sessionId = readText(args, 'sessionId', MAX_SESSION_ID_LENGTH)

      const allowed = ownWorkspaceFirst(await readAllowedWorkspaces(deps, context), context.scope.workspaceId)
      const allowedIds = new Set(allowed.map((workspace) => workspace.id))

      const running = deps.getActiveSessions().find((session) =>
        session.sessionId === sessionId && session.provider === provider && allowedIds.has(session.workspaceId))
      if (running) {
        deps.openSession({ workspaceId: running.workspaceId, tileId: running.tileId })
        return 'Showing the running session in Yira.'
      }

      const stopped = await findStoppedSession(deps, allowed, provider, sessionId)
      if (!stopped) throw new Error(SESSION_NOT_FOUND_MESSAGE)

      const launcher = requireLauncher(deps)
      const launched = await launcher({
        workspaceId: stopped.workspace.id,
        provider,
        resumeSessionId: sessionId,
        ...(stopped.cwd ? { resumeCwd: stopped.cwd } : {}),
      })
      deps.openSession({ workspaceId: launched.workspaceId, tileId: launched.tileId })
      return `Reopened session ${sessionId} in a new tile of ${stopped.workspace.name}.`
    },
  }
}

// session_create

function createCreateProvider(deps: BotToolDependencies): BotToolProvider {
  const definition: McpToolDefinition = {
    name: 'session_create',
    description: 'Start a new regular agent session in this workspace with a first message and show it to the user. Use it for a handoff: write what was done, the decisions taken and the open questions, so the new session can continue without this conversation.',
    inputSchema: objectSchema({
      prompt: { type: 'string', description: `First message for the new session (up to ${MAX_PROMPT_LENGTH} characters).` },
      provider: { ...PROVIDER_PROPERTY, description: 'Agent to run; defaults to the workspace agent.' },
    }, ['prompt']),
  }

  return {
    grant: 'session_create',
    definitions: [definition],
    async call(_name, args, context) {
      const prompt = readText(args, 'prompt', MAX_PROMPT_LENGTH)
      const provider = readOptionalProvider(args, 'provider')
      requireOwnWorkspaceAccess(context)

      const launcher = requireLauncher(deps)
      const launched = await launcher({
        workspaceId: context.scope.workspaceId,
        prompt,
        ...(provider ? { provider } : {}),
      })
      deps.openSession({ workspaceId: launched.workspaceId, tileId: launched.tileId })
      return `Started a new session in tile ${launched.tileId}.`
    },
  }
}

// bots_list and bot_send

function isCallableHere(bot: BotDefinition, caller: BotDefinition, workspaceId: string): boolean {
  return bot.callable && bot.id !== caller.id && isBotAvailableInWorkspace(bot, workspaceId)
}

function describeBot(bot: BotDefinition): string {
  return `- ${bot.name} (id ${bot.id}, ${bot.provider}): ${bot.description}`
}

function createBotsCallProvider(deps: BotToolDependencies): BotToolProvider {
  const definitions: McpToolDefinition[] = [
    {
      name: 'bots_list',
      description: 'List the other bots you can start in this workspace, with their ids and what they are for. Use it before bot_send.',
      inputSchema: objectSchema({}, []),
    },
    {
      name: 'bot_send',
      description: 'Start another bot in this workspace with a first message. The user is asked to allow it first. The bot runs in its own session; when it finishes, read its answer with session_read.',
      inputSchema: objectSchema({
        botId: { type: 'string', description: 'Id of the bot, from bots_list.' },
        prompt: { type: 'string', description: `Task for the bot, with all the context it needs (up to ${MAX_PROMPT_LENGTH} characters).` },
      }, ['botId', 'prompt']),
    },
  ]

  async function listCallableBots(context: BotToolContext): Promise<string> {
    requireOwnWorkspaceAccess(context)
    const bots = await deps.getBots()
    const callable = bots.filter((bot) => isCallableHere(bot, context.bot, context.scope.workspaceId))
    if (callable.length === 0) return 'No other bots can be called in this workspace.'
    return callable.map(describeBot).join('\n')
  }

  async function sendToBot(args: Args, context: BotToolContext): Promise<string> {
    const botId = readText(args, 'botId', MAX_SESSION_ID_LENGTH)
    const prompt = readText(args, 'prompt', MAX_PROMPT_LENGTH)
    requireOwnWorkspaceAccess(context)

    const target = (await deps.getBots()).find((bot) => bot.id === botId)
    if (!target) throw new Error(`No bot has the id "${botId}". Use bots_list to see the available bots.`)
    if (target.id === context.bot.id) throw new Error('A bot cannot start itself.')
    if (!target.callable) throw new Error(`${target.name} cannot be called by other bots.`)
    if (!isBotAvailableInWorkspace(target, context.scope.workspaceId)) {
      throw new Error(`${target.name} is not available in this workspace.`)
    }

    const allowed = await deps.confirmBotCall({
      workspaceId: context.scope.workspaceId,
      callerName: context.bot.name,
      targetName: target.name,
      prompt,
    })
    if (!allowed) return `The user declined starting ${target.name}.`

    const launched = await requireLauncher(deps)({
      workspaceId: context.scope.workspaceId,
      botId: target.id,
      prompt,
    })
    const sessionId = findActiveSessionId(deps, launched.tileId)
    if (!sessionId) {
      return `Started ${target.name} in tile ${launched.tileId}. The user can open it from the sidebar.`
    }
    return `Started ${target.name} in tile ${launched.tileId}. When it finishes, read its answer with session_read(provider: "${launched.provider}", sessionId: "${sessionId}").`
  }

  return {
    grant: 'bots_call',
    definitions,
    async call(name, args, context) {
      if (name === 'bots_list') return listCallableBots(context)
      if (name === 'bot_send') return sendToBot(args, context)
      throw new Error('Unknown tool')
    },
  }
}

export function createBotToolProviders(deps: BotToolDependencies): BotToolProvider[] {
  return [
    createSearchProvider(deps),
    createReadProvider(deps),
    createOpenProvider(deps),
    createCreateProvider(deps),
    createBotsCallProvider(deps),
  ]
}
