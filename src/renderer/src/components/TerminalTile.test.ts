import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./TerminalTile.tsx', import.meta.url), 'utf8')

if (source.includes('createNativeAttentionDelayScheduler')) {
  throw new Error('terminal output must not instantiate a native attention scheduler')
}

if (source.includes('notifications.requestAttention')) {
  throw new Error('terminal output must not request native window attention')
}

if (source.includes('attentionDelayEnabled')) {
  throw new Error('terminal output must not depend on the timer attention delay setting')
}

for (const requiredSnippet of [
  'markTerminalOutput(tile.id)',
  'notificationsMutedRef.current',
  'clearAttentionIfAttended',
  "terminalInput?.addEventListener('focus', clearAttentionIfAttended)",
]) {
  if (!source.includes(requiredSnippet)) {
    throw new Error(`terminal activity flow must retain ${requiredSnippet}`)
  }
}
