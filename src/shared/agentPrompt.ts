export const MAX_AGENT_PROMPT_LENGTH = 20_000

// Line feeds, carriage returns and tabs are allowed; other C0/C1 control
// characters (such as ANSI color codes copied from a terminal) are not.
const INVALID_PROMPT_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/

export type AgentPromptIssue = 'too-long' | 'invalid-characters'

/** Returns why an initial agent prompt cannot be sent, or null when it is valid. */
export function getAgentPromptIssue(prompt: string): AgentPromptIssue | null {
  if (prompt.length > MAX_AGENT_PROMPT_LENGTH) return 'too-long'
  if (INVALID_PROMPT_CHARACTERS.test(prompt)) return 'invalid-characters'
  return null
}
