export const MAX_AGENT_TERMINAL_TITLE_LENGTH = 200

/**
 * Display form of the title an agent sets on its terminal: the agent's text as
 * is, without control characters. Returns '' when nothing is left.
 */
export function normalizeAgentTerminalTitle(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .trim()
    .slice(0, MAX_AGENT_TERMINAL_TITLE_LENGTH)
}
