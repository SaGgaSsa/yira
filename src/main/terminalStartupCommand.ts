export interface DeferredTerminalStartupCommandOptions {
  command: string
  write: (data: string) => void
  quietPeriodMs?: number
  fallbackMs?: number
}

export class DeferredTerminalStartupCommand {
  private readonly command: string
  private readonly write: (data: string) => void
  private readonly quietPeriodMs: number
  private quietTimer: ReturnType<typeof setTimeout> | undefined
  private fallbackTimer: ReturnType<typeof setTimeout> | undefined
  private sent = false
  private disposed = false

  constructor(options: DeferredTerminalStartupCommandOptions) {
    this.command = options.command.trim()
    this.write = options.write
    this.quietPeriodMs = options.quietPeriodMs ?? 50
    this.fallbackTimer = setTimeout(() => this.flush(), options.fallbackMs ?? 1_000)
  }

  onOutput(data: string): void {
    if (!data || this.sent || this.disposed) return

    if (this.quietTimer) clearTimeout(this.quietTimer)
    this.quietTimer = setTimeout(() => this.flush(), this.quietPeriodMs)
  }

  dispose(): void {
    this.disposed = true
    this.clearTimers()
  }

  private flush(): void {
    if (this.sent || this.disposed) return

    this.sent = true
    this.clearTimers()
    this.write(`${this.command}\r`)
  }

  private clearTimers(): void {
    if (this.quietTimer) clearTimeout(this.quietTimer)
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer)
    this.quietTimer = undefined
    this.fallbackTimer = undefined
  }
}
