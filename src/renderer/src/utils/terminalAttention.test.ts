import {
  formatTerminalAttentionCount,
  getNextTerminalAttentionEntry,
} from './terminalAttention'

const first = getNextTerminalAttentionEntry(null, 1_000)
if (first.count !== 1) throw new Error(`first unattended output must count 1, got ${first.count}`)
if (first.lastOutputAt !== 1_000) throw new Error(`first unattended output timestamp must be stored, got ${first.lastOutputAt}`)

const sameBurst = getNextTerminalAttentionEntry(first, 2_500)
if (sameBurst.count !== 1) throw new Error(`output within 2s burst must not increment, got ${sameBurst.count}`)
if (sameBurst.lastOutputAt !== 2_500) throw new Error(`same burst must still update timestamp, got ${sameBurst.lastOutputAt}`)

const nextBurst = getNextTerminalAttentionEntry(sameBurst, 4_501)
if (nextBurst.count !== 2) throw new Error(`output after 2s pause must increment, got ${nextBurst.count}`)

const reset = getNextTerminalAttentionEntry(null, 10_000)
if (reset.count !== 1) throw new Error(`cleared attention must restart at 1, got ${reset.count}`)

if (formatTerminalAttentionCount(0) !== null) throw new Error('zero attention count must not render a badge')
if (formatTerminalAttentionCount(9) !== '9') throw new Error('count 9 must render as 9')
if (formatTerminalAttentionCount(10) !== '9+') throw new Error('count 10 must render as 9+')
