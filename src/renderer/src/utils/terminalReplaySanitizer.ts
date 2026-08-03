const ESC = '\x1b'
const CSI_8BIT = '\x9b'
const DCS_8BIT = '\x90'
const OSC_8BIT = '\x9d'
const ST_8BIT = '\x9c'

interface StringTerminator {
  index: number
  length: number
}

function findStringTerminator(buffer: string, from: number, allowBell: boolean): StringTerminator | null {
  const candidates = [
    { index: buffer.indexOf(`${ESC}\\`, from), length: 2 },
    { index: buffer.indexOf(ST_8BIT, from), length: 1 },
    ...(allowBell ? [{ index: buffer.indexOf('\x07', from), length: 1 }] : []),
  ].filter((candidate) => candidate.index !== -1)

  if (candidates.length === 0) return null
  return candidates.reduce((first, candidate) => candidate.index < first.index ? candidate : first)
}

function findCsiEnd(buffer: string, from: number): number | null {
  for (let index = from; index < buffer.length; index += 1) {
    const code = buffer.charCodeAt(index)
    if (code >= 0x40 && code <= 0x7e) return index
    if ((code >= 0x20 && code <= 0x3f) || code === 0x3a) continue
    return null
  }
  return null
}

function isReplayResponseQuery(sequence: string): boolean {
  if (sequence === '5n' || sequence === '6n' || sequence === '?6n') return true
  if (/^(?:0*c|>0*c)$/.test(sequence)) return true
  if (/^\??(?:\d+(?:;\d+)*)?\$p$/.test(sequence)) return true
  return sequence === '14t' || sequence === '16t' || sequence === '18t'
}

function isOscColorQuery(payload: string): boolean {
  return /^4(?:;(?:\d+;)?\?)+$/.test(payload) || /^(?:10|11|12)(?:;\?)+$/.test(payload)
}

/**
 * Removes complete VT requests that xterm answers synthetically during
 * scrollback replay. Live PTY output must never pass through this function.
 */
export function sanitizeTerminalReplayBuffer(buffer: string): string {
  let sanitized = ''
  let index = 0

  while (index < buffer.length) {
    const isSevenBitCsi = buffer.startsWith(`${ESC}[`, index)
    const isEightBitCsi = buffer.startsWith(CSI_8BIT, index)
    if (isSevenBitCsi || isEightBitCsi) {
      const sequenceStart = index + (isSevenBitCsi ? 2 : 1)
      const sequenceEnd = findCsiEnd(buffer, sequenceStart)
      if (sequenceEnd === null) {
        sanitized += buffer[index]
        index += 1
        continue
      }

      const sequence = buffer.slice(sequenceStart, sequenceEnd + 1)
      if (!isReplayResponseQuery(sequence)) sanitized += buffer.slice(index, sequenceEnd + 1)
      index = sequenceEnd + 1
      continue
    }

    const isSevenBitDcs = buffer.startsWith(`${ESC}P`, index)
    const isEightBitDcs = buffer.startsWith(DCS_8BIT, index)
    if (isSevenBitDcs || isEightBitDcs) {
      const contentStart = index + (isSevenBitDcs ? 2 : 1)
      const terminator = findStringTerminator(buffer, contentStart, false)
      if (terminator === null) {
        sanitized += buffer.slice(index)
        break
      }

      if (!buffer.startsWith('$q', contentStart)) {
        sanitized += buffer.slice(index, terminator.index + terminator.length)
      }
      index = terminator.index + terminator.length
      continue
    }

    const isSevenBitOsc = buffer.startsWith(`${ESC}]`, index)
    const isEightBitOsc = buffer.startsWith(OSC_8BIT, index)
    if (isSevenBitOsc || isEightBitOsc) {
      const contentStart = index + (isSevenBitOsc ? 2 : 1)
      const terminator = findStringTerminator(buffer, contentStart, true)
      if (terminator === null) {
        sanitized += buffer.slice(index)
        break
      }

      const payload = buffer.slice(contentStart, terminator.index)
      if (!isOscColorQuery(payload)) sanitized += buffer.slice(index, terminator.index + terminator.length)
      index = terminator.index + terminator.length
      continue
    }

    sanitized += buffer[index]
    index += 1
  }

  return sanitized
}
