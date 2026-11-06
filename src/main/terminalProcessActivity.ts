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

    if (agents.some(({ process, agent }) => isDelegatedAgentRun(process, agent))) {
      activities.push({ workspaceId: root.workspaceId, tileId: root.tileId, ...(principal && { agent: principal.agent }) })
    }
  }

  return activities
}

function terminalKey(terminal: { workspaceId: string; tileId: string }): string {
  return JSON.stringify([terminal.workspaceId, terminal.tileId])
}

export class TerminalProcessActivityMonitor {
  private readonly listRoots: () => TerminalProcessRoot[]
  private readonly getProcesses: () => Promise<ProcessInfo[]>
  private readonly intervalMs: number
  private readonly onChange: (snapshot: TerminalProcessActivitySnapshot) => void
  private readonly reportedWorking = new Map<string, TerminalProcessActivity>()
  private currentSnapshot: TerminalProcessActivitySnapshot = { terminals: [] }
  private delegatedTerminals: TerminalProcessActivity[] = []
  private timer: NodeJS.Timeout | null = null
  private polling = false

  constructor(options: {
    listRoots: () => TerminalProcessRoot[]
    listProcesses?: () => Promise<ProcessInfo[]>
    intervalMs?: number
    onChange: (snapshot: TerminalProcessActivitySnapshot) => void
  }) {
    this.listRoots = options.listRoots
    this.getProcesses = options.listProcesses ?? listProcesses
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

  /** Record what the agent in a terminal reported, so it counts without waiting for a poll. */
  setReportedWorking(terminal: { workspaceId: string; tileId: string }, agent: TerminalProcessAgent, working: boolean): void {
    const key = terminalKey(terminal)
    if (!working) {
      this.reportedWorking.delete(key)
    } else {
      this.reportedWorking.set(key, { workspaceId: terminal.workspaceId, tileId: terminal.tileId, agent })
    }
    this.publish()
  }

  forgetTerminal(terminal: { workspaceId: string; tileId: string }): void {
    const key = terminalKey(terminal)
    this.reportedWorking.delete(key)
    this.delegatedTerminals = this.delegatedTerminals.filter((activity) => terminalKey(activity) !== key)
    this.publish()
  }

  async pollNow(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const roots = this.listRoots()
      if (roots.length === 0) {
        this.delegatedTerminals = []
        this.publish()
        return
      }
      const processes = await this.getProcesses()
      this.delegatedTerminals = classifyTerminalProcesses(processes, roots)
      this.publish()
    } catch {
      this.delegatedTerminals = []
      this.publish()
    } finally {
      this.polling = false
    }
  }

  private publish(): void {
    const terminals = new Map<string, TerminalProcessActivity>()
    for (const activity of this.reportedWorking.values()) terminals.set(terminalKey(activity), activity)
    // A delegated run carries the process-detected agent and wins over a report.
    for (const activity of this.delegatedTerminals) terminals.set(terminalKey(activity), activity)
    const ordered = [...terminals.values()].sort((left, right) => (
      left.workspaceId.localeCompare(right.workspaceId) || left.tileId.localeCompare(right.tileId)
    ))
    this.updateSnapshot({ terminals: ordered })
  }

  private updateSnapshot(next: TerminalProcessActivitySnapshot): void {
    const current = this.currentSnapshot.terminals
    if (JSON.stringify(current) === JSON.stringify(next.terminals)) return
    this.currentSnapshot = next
    this.onChange(this.snapshot())
  }
}
