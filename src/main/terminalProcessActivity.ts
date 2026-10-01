import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type {
  TerminalProcessActivity,
  TerminalProcessActivitySnapshot,
  TerminalProcessAgent,
} from '@shared/terminalProcessActivity'
import { listProcesses, type ProcessInfo } from './processTree'

export interface TerminalProcessRoot {
  workspaceId: string
  tileId: string
  pid: number
}

export interface ClaudeSessionState {
  status?: string
  sessionId?: string
}

export interface ClassifyOptions {
  readClaudeSession: (pid: number) => ClaudeSessionState | null
  hasRecentClaudeSubagentActivity: (sessionId: string) => boolean
}

function commandTokens(args: string): string[] {
  return args.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g)?.map((token) => (
    token.replace(/^['"]|['"]$/g, '')
  )) ?? []
}

function processArgumentTokens(process: ProcessInfo): string[] {
  const tokens = commandTokens(process.args)
  if (tokens.length === 0) return []
  const executable = process.name.replace(/\.exe$/i, '').toLowerCase()
  if ((executable === 'node' || executable === 'node.exe' || executable === 'bun' || executable === 'bun.exe') && tokens.length > 1) {
    return tokens.slice(2)
  }
  return tokens.slice(1)
}

export function detectAgent(process: ProcessInfo): TerminalProcessAgent | null {
  const name = process.name.toLowerCase().split(/[\\/]/).pop() ?? ''
  const normalizedName = name.replace(/\.exe$/, '')
  if (normalizedName === 'claude') return 'claude'
  if (normalizedName === 'codex' || /^codex-[a-z0-9_-]+$/.test(normalizedName)) return 'codex'
  if (normalizedName === 'opencode') return 'opencode'

  if (normalizedName !== 'node' && normalizedName !== 'bun') return null
  const args = process.args.toLowerCase().replace(/\\/g, '/')
  if (args.includes('@anthropic-ai/claude-code')) return 'claude'
  if (args.includes('@openai/codex')) return 'codex'
  if (args.includes('opencode-ai')) return 'opencode'
  return null
}

export function isDelegatedAgentRun(process: ProcessInfo, agent: TerminalProcessAgent): boolean {
  const tokens = processArgumentTokens(process).map((token) => token.toLowerCase())
  if (agent === 'codex') return tokens[0] === 'exec' || tokens[0] === 'e'
  if (agent === 'opencode') return tokens[0] === 'run'
  return tokens.includes('-p') || tokens.includes('--print')
}

export function classifyTerminalProcesses(
  processes: readonly ProcessInfo[],
  roots: readonly TerminalProcessRoot[],
  options: ClassifyOptions,
): TerminalProcessActivity[] {
  const children = new Map<number, ProcessInfo[]>()
  for (const process of processes) {
    const siblings = children.get(process.ppid) ?? []
    siblings.push(process)
    children.set(process.ppid, siblings)
  }
  const byPid = new Map(processes.map((process) => [process.pid, process]))
  const activities: TerminalProcessActivity[] = []

  for (const root of roots) {
    const rootProcess = byPid.get(root.pid)
    const queue: Array<{ process: ProcessInfo; depth: number }> = []
    if (rootProcess) queue.push({ process: rootProcess, depth: 0 })
    else {
      for (const child of children.get(root.pid) ?? []) queue.push({ process: child, depth: 1 })
    }
    const seen = new Set<number>()
    const subtree: ProcessInfo[] = []

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current.depth > 32 || seen.has(current.process.pid)) continue
      seen.add(current.process.pid)
      subtree.push(current.process)
      for (const child of children.get(current.process.pid) ?? []) {
        queue.push({ process: child, depth: current.depth + 1 })
      }
    }

    const agents = subtree.flatMap((process) => {
      const agent = detectAgent(process)
      return agent ? [{ process, agent }] : []
    })
    const principal = agents[0]
    let state: TerminalProcessActivity['state'] | null = null

    if (agents.some(({ process, agent }) => isDelegatedAgentRun(process, agent))) {
      state = 'working'
    }

    let claudeStatus: string | undefined
    let claudeSessionId: string | undefined
    if (principal?.agent === 'claude') {
      for (const candidate of agents) {
        if (candidate.agent !== 'claude') continue
        const session = options.readClaudeSession(candidate.process.pid)
        if (!session) continue
        claudeStatus = session.status
        claudeSessionId = session.sessionId
        if (session.status === 'busy') state = 'working'
        break
      }
      if (claudeSessionId && options.hasRecentClaudeSubagentActivity(claudeSessionId)) state = 'working'
      if (!state && claudeStatus === 'shell') state = 'background'
    }

    if (state) activities.push({ workspaceId: root.workspaceId, tileId: root.tileId, state, ...(principal && { agent: principal.agent }) })
  }

  return activities
}

const SAFE_SESSION_ID = /^[A-Za-z0-9-]{8,80}$/
const MAX_SESSION_FILE_SIZE = 64 * 1024

export function createClaudeSessionReader(options: {
  claudeDir?: string
  now?: () => number
  subagentWindowMs?: number
} = {}): Pick<ClassifyOptions, 'readClaudeSession' | 'hasRecentClaudeSubagentActivity'> {
  const claudeDir = options.claudeDir ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  const now = options.now ?? Date.now
  const subagentWindowMs = options.subagentWindowMs ?? 60_000
  const discoveredPaths = new Map<string, string>()
  const lastSearchAt = new Map<string, number>()

  function readClaudeSession(pid: number): ClaudeSessionState | null {
    try {
      const filePath = join(claudeDir, 'sessions', `${pid}.json`)
      const stats = statSync(filePath)
      if (!stats.isFile() || stats.size > MAX_SESSION_FILE_SIZE) return null
      const data: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
      if (!data || typeof data !== 'object') return null
      const record = data as Record<string, unknown>
      if (record.pid !== pid) return null
      return {
        ...(typeof record.status === 'string' && { status: record.status }),
        ...(typeof record.sessionId === 'string' && SAFE_SESSION_ID.test(record.sessionId) && { sessionId: record.sessionId }),
      }
    } catch {
      return null
    }
  }

  function findSubagentDirectory(sessionId: string): string | null {
    const cached = discoveredPaths.get(sessionId)
    if (cached && existsSync(cached)) return cached
    const currentTime = now()
    const lastSearch = lastSearchAt.get(sessionId)
    if (lastSearch !== undefined && currentTime - lastSearch < 30_000) return null
    lastSearchAt.set(sessionId, currentTime)

    try {
      const projectsPath = join(claudeDir, 'projects')
      for (const project of readdirSync(projectsPath, { withFileTypes: true })) {
        if (!project.isDirectory()) continue
        const candidate = join(projectsPath, project.name, sessionId, 'subagents')
        if (existsSync(candidate)) {
          discoveredPaths.set(sessionId, candidate)
          return candidate
        }
      }
    } catch {
      return null
    }
    return null
  }

  function hasRecentClaudeSubagentActivity(sessionId: string): boolean {
    if (!SAFE_SESSION_ID.test(sessionId)) return false
    const directory = findSubagentDirectory(sessionId)
    if (!directory) return false
    try {
      return readdirSync(directory, { withFileTypes: true }).some((entry) => {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) return false
        const modifiedAt = statSync(join(directory, entry.name)).mtimeMs
        return modifiedAt <= now() && now() - modifiedAt <= subagentWindowMs
      })
    } catch {
      return false
    }
  }

  return { readClaudeSession, hasRecentClaudeSubagentActivity }
}

export class TerminalProcessActivityMonitor {
  private readonly listRoots: () => TerminalProcessRoot[]
  private readonly getProcesses: () => Promise<ProcessInfo[]>
  private readonly reader: ClassifyOptions
  private readonly intervalMs: number
  private readonly onChange: (snapshot: TerminalProcessActivitySnapshot) => void
  private currentSnapshot: TerminalProcessActivitySnapshot = { terminals: [] }
  private timer: NodeJS.Timeout | null = null
  private polling = false

  constructor(options: {
    listRoots: () => TerminalProcessRoot[]
    listProcesses?: () => Promise<ProcessInfo[]>
    reader?: Pick<ClassifyOptions, 'readClaudeSession' | 'hasRecentClaudeSubagentActivity'>
    intervalMs?: number
    onChange: (snapshot: TerminalProcessActivitySnapshot) => void
  }) {
    this.listRoots = options.listRoots
    this.getProcesses = options.listProcesses ?? listProcesses
    this.reader = options.reader ?? createClaudeSessionReader()
    this.intervalMs = options.intervalMs ?? 40_000
    this.onChange = options.onChange
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.pollNow() }, this.intervalMs)
    this.timer.unref?.()
    void this.pollNow()
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  snapshot(): TerminalProcessActivitySnapshot {
    return { terminals: this.currentSnapshot.terminals.map((terminal) => ({ ...terminal })) }
  }

  async pollNow(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const roots = this.listRoots()
      if (roots.length === 0) {
        this.updateSnapshot({ terminals: [] })
        return
      }
      const processes = await this.getProcesses()
      const terminals = classifyTerminalProcesses(processes, roots, this.reader)
      terminals.sort((left, right) => left.workspaceId.localeCompare(right.workspaceId) || left.tileId.localeCompare(right.tileId))
      this.updateSnapshot({ terminals })
    } catch {
      this.updateSnapshot({ terminals: [] })
    } finally {
      this.polling = false
    }
  }

  private updateSnapshot(next: TerminalProcessActivitySnapshot): void {
    const current = this.currentSnapshot.terminals
    if (JSON.stringify(current) === JSON.stringify(next.terminals)) return
    this.currentSnapshot = next
    this.onChange(this.snapshot())
  }
}
