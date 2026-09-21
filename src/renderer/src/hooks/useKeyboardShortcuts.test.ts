import assert from 'node:assert/strict'
import test from 'node:test'

import { handleKeyboardShortcut } from './useKeyboardShortcuts'

type ShortcutDeps = Parameters<typeof handleKeyboardShortcut>[1]

const splitViewState = {
  leftTileIds: ['left-a'],
  rightTileIds: ['right-a', 'right-b'],
  activeLeftTileId: 'left-a',
  activeRightTileId: 'right-a',
  focusedPanel: 'right' as const,
  orientation: 'vertical' as const,
}

function createDeps(overrides: Partial<ShortcutDeps> = {}): ShortcutDeps {
  return {
    tiles: [
      { id: 'tile-a', zIndex: 1 },
      { id: 'tile-b', zIndex: 2 },
    ],
    focusedTileId: null,
    selectedTileIds: [],
    viewMode: 'fullview',
    fullviewActiveTileId: 'tile-a',
    splitViewState,
    focusTile: () => {},
    selectTiles: () => {},
    setFullviewActiveTileId: () => {},
    setSplitViewState: () => {},
    ...overrides,
  }
}

function keyboardEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: 'Escape',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    target: null,
    preventDefault: () => {},
    ...overrides,
  } as KeyboardEvent
}

test('returns before handling Escape when the event starts inside a terminal', () => {
  const calls: string[] = []
  const terminalTarget = {
    closest: (selector: string) => selector === '.xterm' ? {} : null,
  } as unknown as EventTarget

  handleKeyboardShortcut(
    keyboardEvent({
      target: terminalTarget,
      preventDefault: () => calls.push('preventDefault'),
    }),
    createDeps({
      onClosePicker: () => calls.push('closePicker'),
      focusTile: () => calls.push('focusTile'),
      selectTiles: () => calls.push('selectTiles'),
    }),
  )

  assert.deepEqual(calls, [])
})

test('does not close an underlying picker when a dialog handled Escape', () => {
  const calls: string[] = []

  handleKeyboardShortcut(
    keyboardEvent({ defaultPrevented: true }),
    createDeps({
      onClosePicker: () => calls.push('closePicker'),
      focusTile: () => calls.push('focusTile'),
      selectTiles: () => calls.push('selectTiles'),
    }),
  )

  assert.deepEqual(calls, [])
})

test('does not handle Escape globally when focus is inside a dialog', () => {
  const previousHTMLElement = globalThis.HTMLElement

  class FakeHTMLElement {
    tagName = 'INPUT'
    isContentEditable = false

    closest(selector: string): object | null {
      return selector === '[role="dialog"]' ? {} : null
    }

    getAttribute(): string | null {
      return null
    }
  }

  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    value: FakeHTMLElement,
  })

  try {
    const calls: string[] = []

    handleKeyboardShortcut(
      keyboardEvent({ target: new FakeHTMLElement() as unknown as EventTarget }),
      createDeps({
        onClosePicker: () => calls.push('closePicker'),
        focusTile: () => calls.push('focusTile'),
        selectTiles: () => calls.push('selectTiles'),
      }),
    )

    assert.deepEqual(calls, [])
  } finally {
    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: previousHTMLElement,
    })
  }
})

test('uses the resolver to focus the left split panel', () => {
  const calls: string[] = []
  let nextState: ShortcutDeps['splitViewState'] = splitViewState
  const event = keyboardEvent({
    key: 'ArrowLeft',
    ctrlKey: true,
    altKey: true,
    preventDefault: () => calls.push('preventDefault'),
  })

  handleKeyboardShortcut(event, createDeps({
    viewMode: 'splitview',
    setSplitViewState: (state) => {
      nextState = state
    },
  }))

  assert.equal(nextState.focusedPanel, 'left')
  assert.deepEqual(calls, ['preventDefault'])
})

test('suspends tile navigation while the activity view is open but keeps picker dismissal', () => {
  const tabCalls: string[] = []
  const tabEvent = keyboardEvent({
    key: 'Tab',
    ctrlKey: true,
    preventDefault: () => tabCalls.push('preventDefault'),
  })

  handleKeyboardShortcut(tabEvent, createDeps({
    viewMode: 'fullview',
    activityOpen: true,
    focusTile: () => tabCalls.push('focusTile'),
    selectTiles: () => tabCalls.push('selectTiles'),
    setFullviewActiveTileId: () => tabCalls.push('setFullviewActiveTileId'),
  }))

  assert.deepEqual(tabCalls, [])

  const escapeCalls: string[] = []
  handleKeyboardShortcut(
    keyboardEvent(),
    createDeps({
      activityOpen: true,
      onClosePicker: () => escapeCalls.push('closePicker'),
      focusTile: () => escapeCalls.push('focusTile'),
      selectTiles: () => escapeCalls.push('selectTiles'),
    }),
  )

  assert.deepEqual(escapeCalls, ['closePicker'])
})

test('keeps editable controls out of tab navigation', () => {
  const previousHTMLElement = globalThis.HTMLElement

  class FakeHTMLElement {
    tagName = 'INPUT'
    isContentEditable = false

    closest(): null {
      return null
    }

    getAttribute(): string | null {
      return null
    }
  }

  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    value: FakeHTMLElement,
  })

  try {
    const calls: string[] = []
    const inputTarget = new FakeHTMLElement() as unknown as EventTarget

    handleKeyboardShortcut(
      keyboardEvent({
        key: 'Tab',
        ctrlKey: true,
        target: inputTarget,
        preventDefault: () => calls.push('preventDefault'),
      }),
      createDeps({
        focusTile: () => calls.push('focusTile'),
        selectTiles: () => calls.push('selectTiles'),
        setFullviewActiveTileId: () => calls.push('setFullviewActiveTileId'),
      }),
    )

    assert.deepEqual(calls, [])
  } finally {
    if (previousHTMLElement) {
      Object.defineProperty(globalThis, 'HTMLElement', {
        configurable: true,
        value: previousHTMLElement,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'HTMLElement')
    }
  }
})
