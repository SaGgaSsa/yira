type AgentAlertSoundKind = 'completed' | 'intervention'

interface AgentAlertSoundNote {
  frequency: number
  durationMs: number
}

const SOUND_INTERVAL_MS = 1500
const MIN_GAIN = 0.0001

const soundNotes: Record<AgentAlertSoundKind, AgentAlertSoundNote[]> = {
  completed: [
    { frequency: 1318, durationMs: 70 },
    { frequency: 988, durationMs: 70 },
  ],
  intervention: [
    { frequency: 988, durationMs: 60 },
    { frequency: 1318, durationMs: 60 },
    { frequency: 1760, durationMs: 60 },
  ],
}

let audioContext: AudioContext | null = null
let lastPlayedAt = 0
let lastPlayedKind: AgentAlertSoundKind | null = null

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext

  try {
    if (typeof globalThis.AudioContext !== 'function') return null
    audioContext = new globalThis.AudioContext()
    return audioContext
  } catch {
    return null
  }
}

function scheduleNote(
  context: AudioContext,
  note: AgentAlertSoundNote,
  startTime: number,
  gainLevel: number,
): void {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const endTime = startTime + note.durationMs / 1000

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(note.frequency, startTime)
  gain.gain.setValueAtTime(MIN_GAIN, startTime)
  gain.gain.exponentialRampToValueAtTime(gainLevel, startTime + 0.005)
  gain.gain.exponentialRampToValueAtTime(MIN_GAIN, endTime)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.addEventListener('ended', () => {
    oscillator.disconnect()
    gain.disconnect()
  }, { once: true })
  oscillator.start(startTime)
  oscillator.stop(endTime + 0.005)
}

export function playAgentAlertSound(kind: 'completed' | 'intervention'): void {
  const now = Date.now()
  const canInterruptCompletion = kind === 'intervention' && lastPlayedKind === 'completed'
  if (now - lastPlayedAt < SOUND_INTERVAL_MS && !canInterruptCompletion) return

  try {
    const context = getAudioContext()
    if (!context) return

    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }

    const gainLevel = kind === 'intervention' ? 0.16 : 0.12
    const noteGapMs = kind === 'intervention' ? 35 : 40
    let startTime = context.currentTime

    for (const note of soundNotes[kind]) {
      scheduleNote(context, note, startTime, gainLevel)
      startTime += (note.durationMs + noteGapMs) / 1000
    }

    lastPlayedAt = now
    lastPlayedKind = kind
  } catch {
    // Sound is optional; agent alerts should still work when Web Audio fails.
  }
}
