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

test('keeps editable controls out of tab navigation', () => {
  const previousHTMLElement = globalThis.HTMLElement

  class FakeHTMLElement {
    tagName = 'INPUT'
    isContentEditable = false

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
