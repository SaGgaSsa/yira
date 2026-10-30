import assert from 'node:assert/strict'
import test from 'node:test'
import { getAgentPromptIssue, MAX_AGENT_PROMPT_LENGTH } from './agentPrompt'

test('accepts prompts with line breaks and tabs up to the length limit', () => {
  assert.equal(getAgentPromptIssue('First line\r\nSecond\tline'), null)
  assert.equal(getAgentPromptIssue('x'.repeat(MAX_AGENT_PROMPT_LENGTH)), null)
})

test('rejects prompts over the length limit', () => {
  assert.equal(getAgentPromptIssue('x'.repeat(MAX_AGENT_PROMPT_LENGTH + 1)), 'too-long')
})

test('rejects control characters such as terminal color codes', () => {
  assert.equal(getAgentPromptIssue('\u001b[31mred\u001b[0m'), 'invalid-characters')
  assert.equal(getAgentPromptIssue('page\u000cbreak'), 'invalid-characters')
  assert.equal(getAgentPromptIssue('next\u0085line'), 'invalid-characters')
})
