import { createTerminalFitScheduler, type TerminalFitResult } from './terminalFitScheduler'

let queuedFrames: Array<{ id: number; callback: () => void }> = []
let nextFrameId = 1

function makeFrameHost(): {
  requestFrame: (callback: () => void) => number
  cancelFrame: (id: number) => void
} {
  return {
    requestFrame: (callback) => {
      const id = nextFrameId++
      queuedFrames.push({ id, callback })
      return id
    },
    cancelFrame: (id) => {
      queuedFrames = queuedFrames.filter((frame) => frame.id !== id)
    },
  }
}

function flushFrame(message: string): void {
  const frame = queuedFrames.shift()
  if (!frame) throw new Error(message)
  frame.callback()
}

interface SampleCounters {
  fitCalls: number
  proposeCalls: number
}

function makeAddon(
  getDimensions: () => { cols: number; rows: number } | undefined,
  counters: SampleCounters,
): { fit: () => void; proposeDimensions: () => { cols: number; rows: number } | undefined } {
  return {
    fit: () => {
      counters.fitCalls += 1
    },
    proposeDimensions: () => {
      counters.proposeCalls += 1
      return getDimensions()
    },
  }
}

const scheduler = createTerminalFitScheduler(makeFrameHost())

const mainCounters: SampleCounters = { fitCalls: 0, proposeCalls: 0 }
let dimensions: { cols: number; rows: number } | undefined = { cols: 100, rows: 30 }
const resizeCalls: Array<{ cols: number; rows: number }> = []
const fitResults: TerminalFitResult[] = []
const mainAddon = makeAddon(() => dimensions, mainCounters)

function requestMainFit(): void {
  scheduler.requestFit(mainAddon, (cols, rows) => {
    resizeCalls.push({ cols, rows })
  }, (result) => fitResults.push(result))
}

// Coalesced requests share one stable measurement cycle.
scheduler.requestFit(mainAddon, (cols, rows) => {
  resizeCalls.push({ cols, rows })
}, (result) => fitResults.push(result))
scheduler.requestFit(mainAddon, (cols, rows) => {
  resizeCalls.push({ cols, rows })
}, (result) => fitResults.push(result))

if (queuedFrames.length !== 1) throw new Error(`coalesced requests must share one frame, got ${queuedFrames.length}`)

flushFrame('first sample must be read-only without fit')
if ((mainCounters.fitCalls as number) !== 0) throw new Error(`first sample must not call fit, got ${mainCounters.fitCalls}`)
if ((mainCounters.proposeCalls as number) !== 1) throw new Error(`first sample must propose once, got ${mainCounters.proposeCalls}`)
if (resizeCalls.length !== 0) throw new Error('first sample must not resize the PTY')
if (fitResults.length !== 0) throw new Error(`first sample must not complete, got ${fitResults.length}`)

flushFrame('stable second sample fits once and resizes')
if ((mainCounters.fitCalls as number) !== 1) throw new Error(`stable fit must call fit once, got ${mainCounters.fitCalls}`)
if ((mainCounters.proposeCalls as number) !== 3) throw new Error(`stable fit must propose twice plus post-fit real read, got ${mainCounters.proposeCalls}`)
if ((resizeCalls.length as number) !== 1) throw new Error(`stable fit must resize once, got ${resizeCalls.length}`)
if (resizeCalls[0].cols !== 100 || resizeCalls[0].rows !== 30) {
  throw new Error(`unexpected resize dimensions ${resizeCalls[0].cols}x${resizeCalls[0].rows}`)
}
if (fitResults.join(',') !== 'fitted') {
  throw new Error(`stable fit must complete once as fitted, got ${fitResults.join(',')}`)
}

// Same dimensions stay stable, fit once to keep xterm in sync, no PTY resize.
requestMainFit()
flushFrame('second first sample must not call fit')
if ((mainCounters.fitCalls as number) !== 1) throw new Error(`second first sample must not call fit, got ${mainCounters.fitCalls}`)
if (Number(resizeCalls.length) !== 1) throw new Error('second first sample must not resize the PTY')
if (fitResults.join(',') !== 'fitted') {
  throw new Error(`second first sample must not complete, got ${fitResults.join(',')}`)
}
flushFrame('second stable fit must deduplicate without PTY resize')
if ((mainCounters.fitCalls as number) !== 2) throw new Error(`second stable fit must call fit once, got ${mainCounters.fitCalls}`)
if (Number(resizeCalls.length) !== 1) throw new Error('same terminal dimensions must not send a redundant PTY resize')
if (fitResults.join(',') !== 'fitted,unchanged') {
  throw new Error(`unchanged dimensions must complete as unchanged, got ${fitResults.join(',')}`)
}

// A real stable change resizes the PTY with the current dimensions.
dimensions = { cols: 120, rows: 35 }
requestMainFit()
flushFrame('dimension change first sample must not call fit')
if ((mainCounters.fitCalls as number) !== 2) throw new Error(`dimension change first sample must not fit, got ${mainCounters.fitCalls}`)
flushFrame('dimension change stable fit must use current dimensions')
if ((mainCounters.fitCalls as number) !== 3) throw new Error(`dimension change must fit once, got ${mainCounters.fitCalls}`)
if (Number(resizeCalls.length) !== 2) throw new Error(`changed dimensions must send a PTY resize, got ${resizeCalls.length}`)
if (resizeCalls[1].cols !== 120 || resizeCalls[1].rows !== 35) {
  throw new Error(`unexpected changed resize dimensions ${resizeCalls[1].cols}x${resizeCalls[1].rows}`)
}
if (fitResults[2] !== 'fitted') {
  throw new Error(`dimension change must complete as fitted, got ${fitResults.join(',')}`)
}

// A transient size between samples never calls fit nor PTY resize,
// and recovers on the next internal frame without an external event.
const transientScheduler = createTerminalFitScheduler(makeFrameHost())
const transientCounters: SampleCounters = { fitCalls: 0, proposeCalls: 0 }
let transientDimensions: { cols: number; rows: number } | undefined = { cols: 120, rows: 35 }
const transientResizeCalls: Array<{ cols: number; rows: number }> = []
const transientResults: TerminalFitResult[] = []
transientScheduler.requestFit(makeAddon(() => transientDimensions, transientCounters), (cols, rows) => {
  transientResizeCalls.push({ cols, rows })
}, (result) => transientResults.push(result))

flushFrame('transient first sample must not call fit')
if ((transientCounters.fitCalls as number) !== 0) throw new Error('transient first sample must not call fit')
if ((transientCounters.proposeCalls as number) !== 1) throw new Error('transient first sample must propose once')

transientDimensions = { cols: 40, rows: 12 }
flushFrame('mismatched second sample must not fit nor resize')
if ((transientCounters.fitCalls as number) !== 0) {
  throw new Error(`mismatch must not call fit, got ${transientCounters.fitCalls}`)
}
if ((transientResizeCalls.length as number) !== 0) {
  throw new Error(`mismatch must not resize the PTY, got ${transientResizeCalls.length}`)
}
if (transientResults.length !== 0) {
  throw new Error(`mismatch must not complete, got ${transientResults.join(',')}`)
}
if (queuedFrames.length !== 1) {
  throw new Error(`mismatch must schedule an internal retry without external event, got ${queuedFrames.length}`)
}

flushFrame('internal retry with settled size must fit once and resize')
if ((transientCounters.fitCalls as number) !== 1) {
  throw new Error(`settled retry must call fit once, got ${transientCounters.fitCalls}`)
}
if ((transientResizeCalls.length as number) !== 1) {
  throw new Error(`settled retry must resize once, got ${transientResizeCalls.length}`)
}
if (transientResizeCalls[0].cols !== 40 || transientResizeCalls[0].rows !== 12) {
  throw new Error(`settled retry must use final dimensions, got ${transientResizeCalls[0].cols}x${transientResizeCalls[0].rows}`)
}
if (transientResults.join(',') !== 'fitted') {
  throw new Error(`settled retry must report fitted, got ${transientResults.join(',')}`)
}

// A continuous oscillation cannot loop forever: after MAX_SAMPLES valid
// samples without consecutive equality, the latest size wins once.
const oscillationScheduler = createTerminalFitScheduler(makeFrameHost())
const oscillationCounters: SampleCounters = { fitCalls: 0, proposeCalls: 0 }
const sizeA = { cols: 100, rows: 30 }
const sizeB = { cols: 120, rows: 35 }
let oscillationToggle = false
const oscillationResizeCalls: Array<{ cols: number; rows: number }> = []
const oscillationResults: TerminalFitResult[] = []
oscillationScheduler.requestFit(makeAddon(() => {
  oscillationToggle = !oscillationToggle
  return oscillationToggle ? sizeA : sizeB
}, oscillationCounters), (cols, rows) => {
  oscillationResizeCalls.push({ cols, rows })
}, (result) => oscillationResults.push(result))

for (let frame = 1; frame <= 8; frame++) {
  flushFrame(`oscillation sample ${frame} must not complete early`)
  if (frame < 8 && oscillationResults.length !== 0) {
    throw new Error(`oscillation must not complete at sample ${frame}`)
  }
  if (frame < 8 && (oscillationCounters.fitCalls as number) !== 0) {
    throw new Error(`oscillation must not call fit at sample ${frame}`)
  }
}
if (oscillationResults.join(',') !== 'fitted') {
  throw new Error(`oscillation must converge as fitted, got ${oscillationResults.join(',')}`)
}
if ((oscillationCounters.fitCalls as number) !== 1) {
  throw new Error(`oscillation must call fit exactly once, got ${oscillationCounters.fitCalls}`)
}
if ((oscillationResizeCalls.length as number) !== 1) {
  throw new Error(`oscillation must resize exactly once, got ${oscillationResizeCalls.length}`)
}
if (oscillationResizeCalls[0].cols !== 100 || oscillationResizeCalls[0].rows !== 30) {
  throw new Error(`oscillation must use post-fit real size 100x30, got ${oscillationResizeCalls[0].cols}x${oscillationResizeCalls[0].rows}`)
}
if (Number(queuedFrames.length) !== 0) {
  throw new Error(`converged oscillation must not leave a queued frame, got ${queuedFrames.length}`)
}

// Narrow but legitimate panels keep a stable resize without magic limits.
const narrowScheduler = createTerminalFitScheduler(makeFrameHost())
const narrowCounters: SampleCounters = { fitCalls: 0, proposeCalls: 0 }
const narrowResizeCalls: Array<{ cols: number; rows: number }> = []
const narrowResults: TerminalFitResult[] = []
narrowScheduler.requestFit(makeAddon(() => ({ cols: 10, rows: 5 }), narrowCounters), (cols, rows) => {
  narrowResizeCalls.push({ cols, rows })
}, (result) => narrowResults.push(result))
flushFrame('narrow first sample must not call fit')
if ((narrowCounters.fitCalls as number) !== 0) throw new Error('narrow first sample must not call fit')
flushFrame('narrow stable size must fit once and resize')
if ((narrowCounters.fitCalls as number) !== 1) throw new Error(`narrow panel must fit once, got ${narrowCounters.fitCalls}`)
if (narrowResizeCalls.length !== 1) throw new Error(`narrow panel must resize once, got ${narrowResizeCalls.length}`)
if (narrowResizeCalls[0].cols !== 10 || narrowResizeCalls[0].rows !== 5) {
  throw new Error(`narrow panel must keep exact dimensions, got ${narrowResizeCalls[0].cols}x${narrowResizeCalls[0].rows}`)
}
if (narrowResults.join(',') !== 'fitted') {
  throw new Error(`narrow panel must report fitted, got ${narrowResults.join(',')}`)
}

scheduler.requestFit(mainAddon, () => {
  throw new Error('cancelled fit must not run')
})
scheduler.cancelPending()
if (queuedFrames.length > 0) {
  flushFrame('cancelled fit must not leave a queued frame')
}

const changeScheduler = createTerminalFitScheduler(makeFrameHost())
const changeCounters: SampleCounters = { fitCalls: 0, proposeCalls: 0 }
let dimensionsBetweenSamples: { cols: number; rows: number } | undefined = { cols: 100, rows: 30 }
const changedResizeCalls: Array<{ cols: number; rows: number }> = []
const changedResults: TerminalFitResult[] = []
changeScheduler.requestFit(makeAddon(() => dimensionsBetweenSamples, changeCounters), (cols, rows) => {
  changedResizeCalls.push({ cols, rows })
}, (result) => changedResults.push(result))

flushFrame('preparation must sample read-only')
if ((changeCounters.fitCalls as number) !== 0) throw new Error('preparation sample must not call fit')
if (changedResizeCalls.length !== 0) throw new Error('preparation sample must not resize')
if (changedResults.length !== 0) throw new Error('preparation sample must not complete')

dimensionsBetweenSamples = { cols: 80, rows: 25 }
flushFrame('changed second sample mismatches and retries internally')
if ((changeCounters.fitCalls as number) !== 0) throw new Error('mismatched sample must not call fit')
if (changedResizeCalls.length !== 0) throw new Error('mismatched sample must not resize')
if (changedResults.length !== 0) throw new Error('mismatched sample must not complete')
if (queuedFrames.length !== 1) throw new Error('mismatch must retry without external event')

flushFrame('settled retry uses final dimensions')
if ((changeCounters.fitCalls as number) !== 1) throw new Error(`settled retry must fit once, got ${changeCounters.fitCalls}`)
if ((changedResizeCalls.length as number) !== 1) {
  throw new Error(`changed dimensions must resize the PTY once, got ${changedResizeCalls.length}`)
}
if (changedResizeCalls[0].cols !== 80 || changedResizeCalls[0].rows !== 25) {
  throw new Error(`settled retry must use final dimensions, got ${changedResizeCalls[0].cols}x${changedResizeCalls[0].rows}`)
}
if (changedResults.join(',') !== 'fitted') {
  throw new Error(`settled retry must complete as fitted, got ${changedResults.join(',')}`)
}

const cancelScheduler = createTerminalFitScheduler(makeFrameHost())
const cancelCounters: SampleCounters = { fitCalls: 0, proposeCalls: 0 }
const cancelResults: TerminalFitResult[] = []
cancelScheduler.requestFit(makeAddon(() => ({ cols: 100, rows: 30 }), cancelCounters), () => {}, (result) => cancelResults.push(result))
flushFrame('preparation must run before cancelling stable fit')
if ((cancelCounters.fitCalls as number) !== 0) throw new Error('preparation must not fit')
cancelScheduler.cancelPending()
if (queuedFrames.length > 0) {
  flushFrame('cancelled stable fit must not run')
}
if ((cancelCounters.fitCalls as number) !== 0) {
  throw new Error(`cancelling between frames must prevent fit, got ${cancelCounters.fitCalls}`)
}
if (cancelResults.length !== 0) {
  throw new Error(`cancelled fit must not complete, got ${cancelResults.length}`)
}

const midCycleScheduler = createTerminalFitScheduler(makeFrameHost())
const midCounters: SampleCounters = { fitCalls: 0, proposeCalls: 0 }
const midResults: TerminalFitResult[] = []
midCycleScheduler.requestFit(makeAddon(() => ({ cols: 100, rows: 30 }), midCounters), () => {
  throw new Error('cancelled mid-cycle fit must not resize')
}, (result) => midResults.push(result))
flushFrame('mid-cycle first sample runs read-only')
if ((midCounters.fitCalls as number) !== 0) throw new Error('mid-cycle first sample must not call fit')
if ((midCounters.proposeCalls as number) !== 1) throw new Error('mid-cycle first sample must propose once')
midCycleScheduler.cancelPending()
if (queuedFrames.length > 0) {
  flushFrame('cancelled second sample must not run')
}
if ((midCounters.fitCalls as number) !== 0) throw new Error('cancelling after first sample must prevent fit')
if (midResults.length !== 0) throw new Error('cancelled mid-cycle fit must not complete')

const throwingScheduler = createTerminalFitScheduler(makeFrameHost())
const throwingCounters: SampleCounters = { fitCalls: 0, proposeCalls: 0 }
throwingScheduler.requestFit({
  fit: () => {
    throwingCounters.fitCalls += 1
    throw new Error('fit failed')
  },
  proposeDimensions: () => {
    throwingCounters.proposeCalls += 1
    return { cols: 100, rows: 30 }
  },
}, () => {
  throw new Error('failed fit must not resize')
})

let fitErrorEscaped = false
try {
  flushFrame('throwing first sample must be scheduled')
  flushFrame('throwing second sample must be scheduled')
} catch {
  fitErrorEscaped = true
}

if (fitErrorEscaped) throw new Error('fit errors must stay contained inside the scheduler')
if ((throwingCounters.fitCalls as number) !== 1) throw new Error('stable throwing fit must be attempted once')
throwingScheduler.cancelPending()

const unmeasurableScheduler = createTerminalFitScheduler(makeFrameHost())
const unmeasurableCounters: SampleCounters = { fitCalls: 0, proposeCalls: 0 }
let unmeasurableDimensions: { cols: number; rows: number } | undefined
const unmeasurableResults: TerminalFitResult[] = []
unmeasurableScheduler.requestFit(makeAddon(() => unmeasurableDimensions, unmeasurableCounters), () => {
  throw new Error('an unmeasurable fit must not resize')
}, (result) => unmeasurableResults.push(result))
flushFrame('unmeasurable first sample must not call fit')
if ((unmeasurableCounters.fitCalls as number) !== 0) throw new Error('unmeasurable first sample must not call fit')
flushFrame('stable unmeasurable pair must not call fit')
if ((unmeasurableCounters.fitCalls as number) !== 0) throw new Error('unmeasurable stable pair must not call fit')

if (unmeasurableResults.join(',') !== 'unmeasurable') {
  throw new Error(`missing unmeasurable fit result: ${unmeasurableResults.join(',')}`)
}

unmeasurableDimensions = { cols: 90, rows: 22 }
unmeasurableScheduler.requestFit(makeAddon(() => unmeasurableDimensions, unmeasurableCounters), () => {}, (result) => unmeasurableResults.push(result))
flushFrame('measurable retry first sample must not call fit')
if (unmeasurableResults.join(',') !== 'unmeasurable') {
  throw new Error(`measurable retry first sample must not complete, got ${unmeasurableResults.join(',')}`)
}
flushFrame('measurable retry stable pair must fit once')

if (unmeasurableResults.join(',') !== 'unmeasurable,fitted') {
  throw new Error(`measurable retry must report fitted once, got ${unmeasurableResults.join(',')}`)
}

// Regression: seeded scheduler must start from TerminalCreateResult dims that
// already match the PTY. Same geometry must complete as unchanged without PTY resize.
{
  const localQueue: Array<{ id: number; callback: () => void }> = []
  let localId = 1000
  const localHost = {
    requestFrame: (callback: () => void): number => {
      const id = localId++
      localQueue.push({ id, callback })
      return id
    },
    cancelFrame: (id: number): void => {
      const index = localQueue.findIndex((frame) => frame.id === id)
      if (index >= 0) localQueue.splice(index, 1)
    },
  }
  const seededScheduler = createTerminalFitScheduler({ ...localHost, initialDimensions: { cols: 100, rows: 30 } })
  const seededCounters: SampleCounters = { fitCalls: 0, proposeCalls: 0 }
  const seededResizes: Array<{ cols: number; rows: number }> = []
  const seededResults: TerminalFitResult[] = []
  seededScheduler.requestFit(makeAddon(() => ({ cols: 100, rows: 30 }), seededCounters), (cols, rows) => {
    seededResizes.push({ cols, rows })
  }, (result) => seededResults.push(result))
  const runLocal = (): void => {
    const frame = localQueue.shift()
    if (!frame) throw new Error('seeded scheduler must schedule frames')
    frame.callback()
  }
  runLocal()
  runLocal()
  if (seededResizes.length !== 0) throw new Error(`seeded same geometry must not resize PTY, got ${seededResizes.length}`)
  if (seededResults.join(',') !== 'unchanged') throw new Error(`seeded same geometry must complete as unchanged, got ${seededResults.join(',')}`)
}

// Regression: scheduler must use real dims after fit, not stale stable sample.
// Propose returns A twice (stable), then B after fit (layout shifted between
// stable sample and internal FitAddon.fit). Must resize to B once, not A.
{
  const localQueue: Array<{ id: number; callback: () => void }> = []
  let localId = 2000
  const localHost = {
    requestFrame: (callback: () => void): number => {
      const id = localId++
      localQueue.push({ id, callback })
      return id
    },
    cancelFrame: (id: number): void => {
      const index = localQueue.findIndex((frame) => frame.id === id)
      if (index >= 0) localQueue.splice(index, 1)
    },
  }
  const raceScheduler = createTerminalFitScheduler(localHost)
  const raceCounters: SampleCounters = { fitCalls: 0, proposeCalls: 0 }
  const sizeA = { cols: 100, rows: 30 }
  const sizeB = { cols: 80, rows: 25 }
  const raceResizes: Array<{ cols: number; rows: number }> = []
  const raceResults: TerminalFitResult[] = []
  const raceAddon = makeAddon(() => {
    if (raceCounters.proposeCalls <= 2) return sizeA
    return sizeB
  }, raceCounters)
  raceScheduler.requestFit(raceAddon, (cols, rows) => {
    raceResizes.push({ cols, rows })
  }, (result) => raceResults.push(result))
  const runLocal = (): void => {
    const frame = localQueue.shift()
    if (!frame) throw new Error('race scheduler must schedule frames')
    frame.callback()
  }
  runLocal()
  runLocal()
  if (raceResizes.length !== 1) throw new Error(`race must resize exactly once, got ${raceResizes.length}`)
  if (raceResizes[0].cols !== 80 || raceResizes[0].rows !== 25) {
    throw new Error(`race must resize to post-fit real dims 80x25, got ${raceResizes[0].cols}x${raceResizes[0].rows}`)
  }
  if (raceResults.join(',') !== 'fitted') throw new Error(`race must complete as fitted, got ${raceResults.join(',')}`)
}

// Regression: scheduler must prefer real xterm dims after fit when provided,
// avoiding xterm/PTY desync if geometry shifted during fit.
{
  const localQueue: Array<{ id: number; callback: () => void }> = []
  let localId = 3000
  const localHost = {
    requestFrame: (callback: () => void): number => {
      const id = localId++
      localQueue.push({ id, callback })
      return id
    },
    cancelFrame: (id: number): void => {
      const index = localQueue.findIndex((frame) => frame.id === id)
      if (index >= 0) localQueue.splice(index, 1)
    },
  }
  const termScheduler = createTerminalFitScheduler(localHost)
  const termCounters: SampleCounters = { fitCalls: 0, proposeCalls: 0 }
  const termResizes: Array<{ cols: number; rows: number }> = []
  const termResults: TerminalFitResult[] = []
  const stableAddon = makeAddon(() => ({ cols: 100, rows: 30 }), termCounters)
  termScheduler.requestFit(stableAddon, (cols, rows) => {
    termResizes.push({ cols, rows })
  }, (result) => termResults.push(result), () => ({ cols: 90, rows: 28 }))
  const runLocal = (): void => {
    const frame = localQueue.shift()
    if (!frame) throw new Error('terminal-size scheduler must schedule frames')
    frame.callback()
  }
  runLocal()
  runLocal()
  if (termResizes.length !== 1) throw new Error(`terminal-size must resize exactly once, got ${termResizes.length}`)
  if (termResizes[0].cols !== 90 || termResizes[0].rows !== 28) {
    throw new Error(`terminal-size must use real xterm dims 90x28, got ${termResizes[0].cols}x${termResizes[0].rows}`)
  }
  if (termResults.join(',') !== 'fitted') throw new Error(`terminal-size must complete as fitted, got ${termResults.join(',')}`)
}

// Regression: if PTY resize fails, scheduler must allow retry with same size.
// lastDimensions is cleared on failure so same geometry resends once.
{
  const localQueue: Array<{ id: number; callback: () => void }> = []
  let localId = 4000
  const localHost = {
    requestFrame: (callback: () => void): number => {
      const id = localId++
      localQueue.push({ id, callback })
      return id
    },
    cancelFrame: (id: number): void => {
      const index = localQueue.findIndex((frame) => frame.id === id)
      if (index >= 0) localQueue.splice(index, 1)
    },
  }
  const failureScheduler = createTerminalFitScheduler(localHost)
  const failureCounters: SampleCounters = { fitCalls: 0, proposeCalls: 0 }
  const failureResizes: Array<{ cols: number; rows: number }> = []
  const failureResults: TerminalFitResult[] = []
  const failureAddon = makeAddon(() => ({ cols: 100, rows: 30 }), failureCounters)
  const runLocal = (): void => {
    const frame = localQueue.shift()
    if (!frame) throw new Error('failure scheduler must schedule frames')
    frame.callback()
  }
  failureScheduler.requestFit(failureAddon, (cols, rows) => {
    failureResizes.push({ cols, rows })
  }, (result) => failureResults.push(result))
  runLocal()
  runLocal()
  if (failureResizes.length !== 1) throw new Error(`failure first fit must resize once, got ${failureResizes.length}`)
  failureScheduler.notifyResizeFailure?.({ cols: 100, rows: 30 })
  failureScheduler.requestFit(failureAddon, (cols, rows) => {
    failureResizes.push({ cols, rows })
  }, (result) => failureResults.push(result))
  runLocal()
  runLocal()
  if (Number(failureResizes.length) !== 2) throw new Error(`failure retry same size must resend once, got ${failureResizes.length}`)
  if (failureResults.join(',') !== 'fitted,fitted') throw new Error(`failure retry must complete as fitted twice, got ${failureResults.join(',')}`)
}
