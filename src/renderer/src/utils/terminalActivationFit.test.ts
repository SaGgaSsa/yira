import assert from 'node:assert/strict'
import test from 'node:test'

import { canFitTerminalAfterActivation, type TerminalActivationFitState } from './terminalActivationFit'

function state(overrides: Partial<TerminalActivationFitState> = {}): TerminalActivationFitState {
  return {
    isVisible: true,
    activationGeneration: 4,
    currentActivationGeneration: 4,
    replayGeneration: 9,
    currentReplayGeneration: 9,
    isStale: false,
    ...overrides,
  }
}

test('allows a fit only for the visible current activation after its current replay', () => {
  assert.equal(canFitTerminalAfterActivation(state()), true)
})

test('rejects a fit when the terminal is hidden or its activation is stale', () => {
  assert.equal(canFitTerminalAfterActivation(state({ isVisible: false })), false)
  assert.equal(canFitTerminalAfterActivation(state({ activationGeneration: 3 })), false)
  assert.equal(canFitTerminalAfterActivation(state({ currentActivationGeneration: 5 })), false)
})

test('rejects a fit before replay completes or after a newer replay starts', () => {
  assert.equal(canFitTerminalAfterActivation(state({ replayGeneration: null })), false)
  assert.equal(canFitTerminalAfterActivation(state({ currentReplayGeneration: null })), false)
  assert.equal(canFitTerminalAfterActivation(state({ replayGeneration: 8 })), false)
  assert.equal(canFitTerminalAfterActivation(state({ currentReplayGeneration: 10 })), false)
})

test('rejects a fit for explicitly stale terminal state', () => {
  assert.equal(canFitTerminalAfterActivation(state({ isStale: true })), false)
})
