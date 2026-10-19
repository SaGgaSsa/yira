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

// Agents prefix their terminal title with a status glyph or spinner frame.
const AGENT_TITLE_STATUS_PREFIX = /^[·*✢-✽◐-◓⠀-⣿]+\s*/u
const GENERIC_AGENT_TITLES = new Set(['claude', 'claude code', 'codex'])

/**
 * Session name the agent wrote on its terminal, without the status glyph.
 * Returns '' while the title only names the agent or is a spinner frame.
 */
export function getAgentNamedTitle(value: string | undefined): string {
  const title = (value ?? '').trim().replace(AGENT_TITLE_STATUS_PREFIX, '')
  if (!/[\p{L}\p{N}]/u.test(title) || GENERIC_AGENT_TITLES.has(title.toLowerCase())) return ''
  return title
}
