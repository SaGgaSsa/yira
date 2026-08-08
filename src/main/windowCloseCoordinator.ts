export type ClosePreparationPhase = 'flush' | 'persist'
export type CloseFailureDecision = 'retry' | 'discard' | 'cancel'
export type ClosePreparationResult = 'proceed' | 'cancel'

export interface ClosePreparationFailure {
  phase: ClosePreparationPhase
  error: unknown
}

export interface WindowCloseCoordinatorOptions {
  flushRenderers: () => Promise<void>
  persistPrimary: () => Promise<void>
  promptFailure: (failure: ClosePreparationFailure) => Promise<CloseFailureDecision>
  timeoutMs: number
}

export class PhaseTimeoutError extends Error {
  readonly phase: ClosePreparationPhase

  constructor(phase: ClosePreparationPhase, timeoutMs: number) {
    super(`Timed out during ${phase} after ${timeoutMs}ms`)
    this.name = 'PhaseTimeoutError'
    this.phase = phase
  }
}

async function runPhase(
  phase: ClosePreparationPhase,
  action: () => Promise<void>,
  timeoutMs: number,
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new PhaseTimeoutError(phase, timeoutMs)), timeoutMs)
  })

  try {
    await Promise.race([action(), timeout])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

export async function coordinateWindowClose(
  options: WindowCloseCoordinatorOptions,
): Promise<ClosePreparationResult> {
  while (true) {
    let phase: ClosePreparationPhase = 'flush'
    let failure: ClosePreparationFailure

    try {
      await runPhase('flush', options.flushRenderers, options.timeoutMs)
      phase = 'persist'
      await runPhase('persist', options.persistPrimary, options.timeoutMs)
      return 'proceed'
    } catch (error) {
      failure = { phase, error }
    }

    const decision = await options.promptFailure(failure)
    if (decision === 'retry') continue
    return decision === 'discard' ? 'proceed' : 'cancel'
  }
}
