import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { sanitizeTerminalReplayBuffer } from '../src/renderer/src/utils/terminalReplaySanitizer'

test('removes the DSR and CPR requests that replay as visible terminal responses', () => {
  const replay = 'before\x1b[5n\x1b[6n\x1b[?6nafter'

  assert.equal(sanitizeTerminalReplayBuffer(replay), 'beforeafter')
})

test('removes primary and secondary device attribute requests', () => {
  const replay = 'a\x1b[cb\x1b[0cc\x1b[00cd\x1b[>ce\x1b[>0cf\x1b[>00cg'

  assert.equal(sanitizeTerminalReplayBuffer(replay), 'abcdefg')
})

test('removes DECRPM, window-size, and cell-size requests', () => {
  const replay = 'a\x1b[?1$pb\x1b[4$pc\x1b[$pd\x1b[?$pe\x1b[14tf\x1b[16tg\x1b[18th'

  assert.equal(sanitizeTerminalReplayBuffer(replay), 'abcdefgh')
})

test('removes complete DECRQSS requests with either string terminator', () => {
  const replay = 'a\x1bP$qm\x1b\\b\x1bP$qr\x9cc'

  assert.equal(sanitizeTerminalReplayBuffer(replay), 'abc')
})

test('removes OSC palette and color queries with BEL or ST terminators', () => {
  const replay = 'a\x1b]4;?\x07b\x1b]4;0;?\x07c\x1b]4;1;?\x1b\\d\x1b]10;?\x07e\x1b]11;?\x1b\\f\x1b]12;?\x07g'

  assert.equal(sanitizeTerminalReplayBuffer(replay), 'abcdefg')
})

test('removes batched OSC palette and special-color queries', () => {
  const replay = 'a\x1b]4;0;?;1;?\x07b\x1b]10;?;?\x1b\\c'

  assert.equal(sanitizeTerminalReplayBuffer(replay), 'abc')
})

test('preserves terminal output, drawing controls, color settings, titles, and OSC 52', () => {
  const replay = 'text\x1b[31mred\x1b[0m\x1b]0;Yira\x07\x1b]4;1;#ff0000\x07\x1b]10;#ffffff\x07\x1b]52;c;SGVsbG8=\x07'

  assert.equal(sanitizeTerminalReplayBuffer(replay), replay)
})

test('preserves incomplete and malformed VT requests', () => {
  const replay = 'a\x1b[6b\x1b]10;?c\x1bP$qmd\x1b[?6me\x1b]4;0;not-a-query\x07f'

  assert.equal(sanitizeTerminalReplayBuffer(replay), replay)
})

test('TerminalTile sanitizes only the terminal.create replay buffer before writing it', async () => {
  const source = await readFile(new URL('../src/renderer/src/components/TerminalTile.tsx', import.meta.url), 'utf8')

  assert.match(source, /if \(buffer\) term\.write\(sanitizeTerminalReplayBuffer\(buffer\)\)/)
  assert.match(source, /term\.write\(data\)/)
})
