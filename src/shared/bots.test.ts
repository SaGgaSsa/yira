import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isBotAvailableInWorkspace,
  normalizeBotInput,
  normalizeStoredBot,
} from './bots'

const validInput = {
  name: 'Reviewer',
  icon: 'shield',
  color: 'emerald',
  provider: 'claude',
  model: '',
  description: 'Reviews changes before they land.',
  role: 'Review the diff.',
  workspaces: { mode: 'all' },
}

test('normalizes a minimal valid bot input', () => {
  const bot = normalizeBotInput(validInput)
  assert.equal(bot.name, 'Reviewer')
  assert.equal(bot.icon, 'shield')
  assert.equal(bot.color, 'emerald')
  assert.equal(bot.provider, 'claude')
  assert.equal(bot.model, '')
  assert.equal(bot.description, 'Reviews changes before they land.')
  assert.equal(bot.role, 'Review the diff.')
  assert.deepEqual(bot.workspaces, { mode: 'all' })
  assert.equal('id' in bot, false)
})

test('trims the bot name', () => {
  const bot = normalizeBotInput({ ...validInput, name: '  Reviewer  ' })
  assert.equal(bot.name, 'Reviewer')
})

test('rejects empty and oversized bot names', () => {
  assert.throws(() => normalizeBotInput({ ...validInput, name: '   ' }), /name/i)
  assert.throws(() => normalizeBotInput({ ...validInput, name: 'x'.repeat(41) }), /name/i)
})

test('rejects invalid icon, color, and provider values', () => {
  assert.throws(() => normalizeBotInput({ ...validInput, icon: 'camera' }), /icon/i)
  assert.throws(() => normalizeBotInput({ ...validInput, color: 'pink' }), /color/i)
  assert.throws(() => normalizeBotInput({ ...validInput, provider: 'gemini' }), /provider/i)
})

test('rejects models with spaces or quotes', () => {
  assert.throws(() => normalizeBotInput({ ...validInput, model: 'claude sonnet' }), /model/i)
  assert.throws(() => normalizeBotInput({ ...validInput, model: 'claude"sonnet' }), /model/i)
})

test('accepts a custom model identifier', () => {
  const bot = normalizeBotInput({ ...validInput, model: 'claude-3.5:sonnet[1m]' })
  assert.equal(bot.model, 'claude-3.5:sonnet[1m]')
})

test('normalizes line endings in the role', () => {
  const bot = normalizeBotInput({
    ...validInput,
    role: '  Line one\r\nLine two\rLine three  ',
  })
  assert.equal(bot.role, 'Line one\nLine two\nLine three')
})

test('deduplicates selected workspace ids', () => {
  const bot = normalizeBotInput({
    ...validInput,
    workspaces: { mode: 'selected', workspaceIds: ['ws-b', ' ws-a ', 'ws-b'] },
  })
  assert.deepEqual(bot.workspaces, {
    mode: 'selected',
    workspaceIds: ['ws-b', 'ws-a'],
  })
})

test('accepts an empty selected workspace list', () => {
  const bot = normalizeBotInput({
    ...validInput,
    workspaces: { mode: 'selected', workspaceIds: [] },
  })
  assert.deepEqual(bot.workspaces, { mode: 'selected', workspaceIds: [] })
})

test('normalizeStoredBot accepts complete data and rejects broken data', () => {
  const stored = {
    ...validInput,
    id: 'bot-1',
    createdAt: '2026-07-04T10:00:00.000Z',
    updatedAt: '2026-07-04T10:30:00.000Z',
  }

  assert.deepEqual(normalizeStoredBot(stored), stored)
  assert.equal(normalizeStoredBot({ ...stored, id: 'not-a-bot' }), null)
  assert.equal(normalizeStoredBot({ ...stored, createdAt: 123 }), null)
  assert.equal(normalizeStoredBot({ ...stored, updatedAt: undefined }), null)
  assert.equal(normalizeStoredBot({ ...stored, name: '' }), null)
  assert.equal(normalizeStoredBot(null), null)
})

test('isBotAvailableInWorkspace respects both scope modes', () => {
  assert.equal(isBotAvailableInWorkspace({ workspaces: { mode: 'all' } }, 'ws-1'), true)
  assert.equal(
    isBotAvailableInWorkspace(
      { workspaces: { mode: 'selected', workspaceIds: ['ws-1'] } },
      'ws-1',
    ),
    true,
  )
  assert.equal(
    isBotAvailableInWorkspace(
      { workspaces: { mode: 'selected', workspaceIds: ['ws-1'] } },
      'ws-2',
    ),
    false,
  )
})
