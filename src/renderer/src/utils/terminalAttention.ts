export const TERMINAL_ATTENTION_BURST_MS = 2_000
export const TERMINAL_ATTENTION_GRACE_MS = 2_000

export interface TerminalAttentionEntry {
  count: number
  lastOutputAt: number
}

export function isTerminalInputAttended(
  isWindowFocused: boolean,
  terminalInput: Element | null | undefined,
  activeElement: Element | null,
): boolean {
  return isWindowFocused && terminalInput !== undefined && terminalInput !== null && terminalInput === activeElement
}

export function getNextTerminalAttentionEntry(
  current: TerminalAttentionEntry | null | undefined,
  outputAt: number,
  burstMs = TERMINAL_ATTENTION_BURST_MS,
): TerminalAttentionEntry {
  if (!current) {
    return { count: 1, lastOutputAt: outputAt }
  }

  const isSameBurst = outputAt - current.lastOutputAt <= burstMs

  return {
    count: isSameBurst ? current.count : current.count + 1,
    lastOutputAt: outputAt,
  }
}

export function formatTerminalAttentionCount(count: number): string | null {
  if (count <= 0) return null
  return count > 9 ? '9+' : String(count)
}
