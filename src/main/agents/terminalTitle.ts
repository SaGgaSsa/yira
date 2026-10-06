import { normalizeAgentTerminalTitle } from '@shared/agentTerminalTitle'

/** Longest unterminated OSC prefix kept between output chunks. */
const MAX_PENDING_OSC_LENGTH = 1_024
const DEFAULT_PUBLISH_INTERVAL_MS = 500
const OSC_START = '\u001b]'
const OSC_TITLE = /\u001b\][02];([^\u0007\u001b]*)(?:\u0007|\u001b\\)/g

export interface TerminalTitleScan {
  /** Last complete title in the chunk, if any. */
  title: string | undefined
  /** Unterminated OSC sequence to prepend to the next chunk. */
  pending: string
}

/** Find the last OSC 0/2 window title in terminal output. */
export function scanTerminalTitle(pending: string, chunk: string): TerminalTitleScan {
  const text = pending + chunk
  if (!text.includes(OSC_START)) return { title: undefined, pending: '' }

  let title: string | undefined
  let consumed = 0
  for (const match of text.matchAll(OSC_TITLE)) {
    title = match[1]
    consumed = match.index + match[0].length
  }

  const openIndex = text.lastIndexOf(OSC_START)
  const unterminated = openIndex >= consumed
    && !/\u0007|\u001b\\/.test(text.slice(openIndex + OSC_START.length))
  const tail = unterminated ? text.slice(openIndex) : ''
  return { title, pending: tail.length <= MAX_PENDING_OSC_LENGTH ? tail : '' }
}

interface TrackedTitle {
  workspaceId: string
  tileId: string
  pending: string
  latest: string
  published: string
  publishedAt: number
  timer: ReturnType<typeof setTimeout> | undefined
}

export interface AgentTerminalTitleTrackerOptions {
  publish: (workspaceId: string, tileId: string, title: string) => void
  intervalMs?: number
  now?: () => number
}

/**
 * Follows the window title agents write to their terminal. Agents animate the
 * title while working, so changes reach `publish` at most once per interval,
 * always ending with the latest title.
 */
export class AgentTerminalTitleTracker {
  private readonly titles = new Map<string, TrackedTitle>()

  private readonly publish: AgentTerminalTitleTrackerOptions['publish']

  private readonly intervalMs: number

  private readonly now: () => number

  constructor(options: AgentTerminalTitleTrackerOptions) {
    this.publish = options.publish
    this.intervalMs = options.intervalMs ?? DEFAULT_PUBLISH_INTERVAL_MS
    this.now = options.now ?? (() => Date.now())
  }

  /** Feed terminal output (or a snapshot buffer) of an agent session. */
  receive(workspaceId: string, tileId: string, output: string): void {
    const key = `${workspaceId}\u0000${tileId}`
    let tracked = this.titles.get(key)
    if (!tracked && !output.includes(OSC_START)) return
    if (!tracked) {
      tracked = { workspaceId, tileId, pending: '', latest: '', published: '', publishedAt: 0, timer: undefined }
      this.titles.set(key, tracked)
    }

    const scan = scanTerminalTitle(tracked.pending, output)
    tracked.pending = scan.pending
    const title = normalizeAgentTerminalTitle(scan.title)
    if (!title) return
    tracked.latest = title
    if (tracked.timer !== undefined) return

    const delay = tracked.publishedAt + this.intervalMs - this.now()
    if (delay <= 0) {
      this.flush(tracked)
      return
    }
    const scheduled = tracked
    scheduled.timer = setTimeout(() => {
      scheduled.timer = undefined
      this.flush(scheduled)
    }, delay)
  }

  forget(workspaceId: string, tileId: string): void {
    const key = `${workspaceId}\u0000${tileId}`
    const tracked = this.titles.get(key)
    if (!tracked) return
    clearTimeout(tracked.timer)
    this.titles.delete(key)
  }

  dispose(): void {
    for (const tracked of this.titles.values()) clearTimeout(tracked.timer)
    this.titles.clear()
  }

  private flush(tracked: TrackedTitle): void {
    if (tracked.latest === tracked.published) return
    tracked.published = tracked.latest
    tracked.publishedAt = this.now()
    this.publish(tracked.workspaceId, tracked.tileId, tracked.latest)
  }
}
