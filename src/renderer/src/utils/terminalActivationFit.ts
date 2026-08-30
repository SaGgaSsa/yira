export interface TerminalActivationFitState {
  isVisible: boolean
  activationGeneration: number
  currentActivationGeneration: number
  replayGeneration: number | null
  currentReplayGeneration: number | null
  isStale: boolean
}

export function canFitTerminalAfterActivation({
  isVisible,
  activationGeneration,
  currentActivationGeneration,
  replayGeneration,
  currentReplayGeneration,
  isStale,
}: TerminalActivationFitState): boolean {
  return isVisible &&
    !isStale &&
    activationGeneration === currentActivationGeneration &&
    replayGeneration !== null &&
    replayGeneration === currentReplayGeneration
}
