import { createWindowAttentionController } from './windowAttention'

class FakeWindow {
  focused = false
  flashCalls: boolean[] = []
  private focusListeners: Array<() => void> = []

  isFocused(): boolean {
    return this.focused
  }

  isDestroyed(): boolean {
    return false
  }

  flashFrame(flag: boolean): void {
    this.flashCalls.push(flag)
  }

  on(event: 'focus', listener: () => void): void {
    if (event === 'focus') this.focusListeners.push(listener)
  }

  emitFocus(): void {
    this.focused = true
    for (const listener of this.focusListeners) listener()
  }
}

function expectNumber(actual: number, expected: number, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, received ${actual}`)
}

const attention = createWindowAttentionController()
const window = new FakeWindow()

const first = attention.request(window, true)
const repeated = attention.request(window, true)
if (first !== 'marked') throw new Error('first unattended request must mark the window')
if (repeated !== 'already-marked') throw new Error('repeated unattended request must be coalesced')
expectNumber(window.flashCalls.filter(Boolean).length, 1, 'repeated requests must flash once')

window.emitFocus()
expectNumber(window.flashCalls.filter(flag => !flag).length, 1, 'window focus must clear native attention')

window.focused = false
const afterFocus = attention.request(window, true)
if (afterFocus !== 'marked') throw new Error('window focus must re-arm native attention')
expectNumber(window.flashCalls.filter(Boolean).length, 2, 'a later attention episode must flash once')

attention.clear(window)
window.focused = false
const afterClear = attention.request(window, true)
if (afterClear !== 'marked') throw new Error('explicit clearing must re-arm native attention')
expectNumber(window.flashCalls.filter(Boolean).length, 3, 'attention after an explicit clear must flash once')
