import {
  decodeOsc52ClipboardPayload,
  getTerminalContextSelectionSnapshot,
  isTerminalCopyShortcut,
} from './terminalClipboard'

const decoded = decodeOsc52ClipboardPayload('c;SGVsbG8gdGVybWluYWw=')
if (decoded !== 'Hello terminal') {
  throw new Error(`OSC 52 clipboard payload must decode base64 text, got ${JSON.stringify(decoded)}`)
}

const primarySelection = decodeOsc52ClipboardPayload('p;UHJpbWFyeSBzZWxlY3Rpb24=')
if (primarySelection !== 'Primary selection') {
  throw new Error(`OSC 52 primary selection payload must decode, got ${JSON.stringify(primarySelection)}`)
}

if (decodeOsc52ClipboardPayload('c;?') !== null) {
  throw new Error('OSC 52 clipboard query must not write to the clipboard')
}

if (decodeOsc52ClipboardPayload('q;SGVsbG8=') !== null) {
  throw new Error('OSC 52 unsupported selectors must be ignored')
}

if (decodeOsc52ClipboardPayload('c;not valid base64') !== null) {
  throw new Error('OSC 52 invalid base64 payloads must be ignored')
}

const snapshot = getTerminalContextSelectionSnapshot({
  hasSelection: () => true,
  getSelection: () => 'selected text',
})
if (snapshot !== 'selected text') {
  throw new Error(`context menu selection snapshot must preserve selected text, got ${JSON.stringify(snapshot)}`)
}

const emptySnapshot = getTerminalContextSelectionSnapshot({
  hasSelection: () => false,
  getSelection: () => 'stale text',
})
if (emptySnapshot !== '') {
  throw new Error(`context menu selection snapshot must be empty when there is no active selection, got ${JSON.stringify(emptySnapshot)}`)
}

if (!isTerminalCopyShortcut({ key: 'C', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false })) {
  throw new Error('Ctrl+Shift+C must copy the selected terminal text')
}

if (isTerminalCopyShortcut({ key: 'c', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false })) {
  throw new Error('Ctrl+C must remain available for shell interrupt')
}

if (isTerminalCopyShortcut({ key: 'c', ctrlKey: true, shiftKey: true, altKey: true, metaKey: false })) {
  throw new Error('Ctrl+Alt+Shift+C must not be treated as terminal copy')
}
