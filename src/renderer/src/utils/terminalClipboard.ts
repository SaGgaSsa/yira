interface TerminalSelectionSource {
  hasSelection: () => boolean
  getSelection: () => string
}

interface TerminalKeyboardShortcutEvent {
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}

const SUPPORTED_OSC52_SELECTIONS = new Set(['c', 'p', 's'])
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function decodeBase64Utf8(payload: string): string | null {
  if (!payload || payload.length % 4 !== 0 || !BASE64_PATTERN.test(payload)) return null

  try {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

export function decodeOsc52ClipboardPayload(data: string): string | null {
  const separatorIndex = data.indexOf(';')
  if (separatorIndex < 0) return null

  const selection = data.slice(0, separatorIndex)
  const payload = data.slice(separatorIndex + 1)
  if (payload === '?' || !payload) return null

  const selectors = selection || 'c'
  for (const selector of selectors) {
    if (!SUPPORTED_OSC52_SELECTIONS.has(selector)) return null
  }

  return decodeBase64Utf8(payload)
}

export function getTerminalContextSelectionSnapshot(term: TerminalSelectionSource | null): string {
  if (!term?.hasSelection()) return ''
  return term.getSelection()
}

export function isTerminalCopyShortcut(event: TerminalKeyboardShortcutEvent): boolean {
  return (
    event.ctrlKey &&
    event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    event.key.toLowerCase() === 'c'
  )
}
