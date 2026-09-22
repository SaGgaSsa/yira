import { createTerminalFitScheduler, type TerminalFitResult } from './terminalFitScheduler'

let queuedFrames: Array<{ id: number; callback: () => void }> = []
let nextFrameId = 1

const scheduler = createTerminalFitScheduler({
  requestFrame: (callback) => {
    const id = nextFrameId++
    queuedFrames.push({ id, callback })
    return id
  },
  cancelFrame: (id) => {
    queuedFrames = queuedFrames.filter((frame) => frame.id !== id)
  },
})

let fitCalls = 0
let resizeCalls: Array<{ cols: number; rows: number }> = []
let dimensions = { cols: 100, rows: 30 }
const fitResults: TerminalFitResult[] = []

function flushFrame(message: string): void {
  const frame = queuedFrames.shift()
  if (!frame) throw new Error(message)
  frame.callback()
}

function getFitCalls(): number {
  return fitCalls
}

function getResizeCallCount(): number {
  return resizeCalls.length
}

const fitAddon = {
  fit: () => {
    fitCalls += 1
  },
  proposeDimensions: () => dimensions,
}

scheduler.requestFit(fitAddon, (cols, rows) => {
  resizeCalls.push({ cols, rows })
}, (result) => fitResults.push(result))
scheduler.requestFit(fitAddon, (cols, rows) => {
  resizeCalls.push({ cols, rows })
}, (result) => fitResults.push(result))

flushFrame('preparation frame must not fit yet')

if (getFitCalls() !== 0) throw new Error(`preparation frame must not call fit, got ${getFitCalls()}`)
if (getResizeCallCount() !== 0) throw new Error(`preparation frame must not resize, got ${getResizeCallCount()}`)
if (fitResults.length !== 0) throw new Error(`preparation frame must not complete, got ${fitResults.length}`)

scheduler.requestFit(fitAddon, (cols, rows) => {
  resizeCalls.push({ cols, rows })
}, (result) => fitResults.push(result))

flushFrame('single fit must run once on the following frame')

if (getFitCalls() !== 1) throw new Error(`coalesced requests must fit once, got ${getFitCalls()}`)
if (getResizeCallCount() !== 1) throw new Error(`coalesced requests must resize once, got ${getResizeCallCount()}`)
if (resizeCalls[0].cols !== 100 || resizeCalls[0].rows !== 30) {
  throw new Error(`unexpected resize dimensions ${resizeCalls[0].cols}x${resizeCalls[0].rows}`)
}
if (fitResults.join(',') !== 'fitted') {
  throw new Error(`single fit must complete once as fitted, got ${fitResults.join(',')}`)
}

scheduler.requestFit(fitAddon, (cols, rows) => {
  resizeCalls.push({ cols, rows })
}, (result) => fitResults.push(result))
flushFrame('second preparation frame must not fit yet')

if (getFitCalls() !== 1) throw new Error(`second preparation must not fit, got ${getFitCalls()}`)
if (getResizeCallCount() !== 1) throw new Error('second preparation must not resize the PTY')

flushFrame('second single fit must deduplicate unchanged dimensions')

if (getFitCalls() !== 2) throw new Error(`second request must fit once, got ${getFitCalls()}`)
if (getResizeCallCount() !== 1) throw new Error('same terminal dimensions must not send a redundant PTY resize')
if (fitResults.join(',') !== 'fitted,unchanged') {
  throw new Error(`unchanged dimensions must complete as unchanged, got ${fitResults.join(',')}`)
}

dimensions = { cols: 120, rows: 35 }
scheduler.requestFit(fitAddon, (cols, rows) => {
  resizeCalls.push({ cols, rows })
}, (result) => fitResults.push(result))
flushFrame('dimension change preparation must not fit yet')

if (getFitCalls() !== 2) throw new Error(`dimension change preparation must not fit, got ${getFitCalls()}`)
if (getResizeCallCount() !== 1) throw new Error('dimension change preparation must not resize the PTY')

flushFrame('dimension change single fit must use current dimensions')

if (getFitCalls() !== 3) throw new Error(`dimension change must fit once, got ${getFitCalls()}`)
if (getResizeCallCount() !== 2) throw new Error(`changed dimensions must send a PTY resize, got ${getResizeCallCount()}`)
if (resizeCalls[1].cols !== 120 || resizeCalls[1].rows !== 35) {
  throw new Error(`unexpected changed resize dimensions ${resizeCalls[1].cols}x${resizeCalls[1].rows}`)
}
if (fitResults[2] !== 'fitted') {
  throw new Error(`dimension change must complete as fitted, got ${fitResults.join(',')}`)
}

scheduler.requestFit(fitAddon, () => {
  throw new Error('cancelled fit must not run')
})
scheduler.cancelPending()
if (queuedFrames.length > 0) {
  flushFrame('cancelled fit must not leave a queued frame')
}

const dimensionsChangeScheduler = createTerminalFitScheduler({
  requestFrame: (callback) => {
    const id = nextFrameId++
    queuedFrames.push({ id, callback })
    return id
  },
  cancelFrame: (id) => {
    queuedFrames = queuedFrames.filter((frame) => frame.id !== id)
  },
})

let dimensionsBetweenFits = { cols: 100, rows: 30 }
let changingFitCalls = 0
const changedDimensionResizeCalls: Array<{ cols: number; rows: number }> = []
const changedDimensionResults: TerminalFitResult[] = []

dimensionsChangeScheduler.requestFit({
  fit: () => {
    changingFitCalls += 1
  },
  proposeDimensions: () => dimensionsBetweenFits,
}, (cols, rows) => {
  changedDimensionResizeCalls.push({ cols, rows })
}, (result) => changedDimensionResults.push(result))

flushFrame('preparation must not fit before dimensions change')

if (changingFitCalls !== 0) throw new Error(`preparation must not call fit, got ${changingFitCalls}`)
if (changedDimensionResizeCalls.length !== 0) {
  throw new Error(`preparation must not resize, got ${changedDimensionResizeCalls.length}`)
}
if (changedDimensionResults.length !== 0) {
  throw new Error(`preparation must not complete, got ${changedDimensionResults.length}`)
}

dimensionsBetweenFits = { cols: 80, rows: 25 }
flushFrame('single fit must use dimensions current at second frame')

if ((changingFitCalls as number) !== 1) throw new Error(`changed dimensions must fit once, got ${changingFitCalls}`)
if ((changedDimensionResizeCalls.length as number) !== 1) {
  throw new Error(`changed dimensions must resize the PTY once, got ${changedDimensionResizeCalls.length}`)
}
if (changedDimensionResizeCalls[0].cols !== 80 || changedDimensionResizeCalls[0].rows !== 25) {
  throw new Error(`single fit must use final dimensions, got ${changedDimensionResizeCalls[0].cols}x${changedDimensionResizeCalls[0].rows}`)
}
if (changedDimensionResults.join(',') !== 'fitted') {
  throw new Error(`single fit must complete as fitted, got ${changedDimensionResults.join(',')}`)
}

const finalFrameCancellationScheduler = createTerminalFitScheduler({
  requestFrame: (callback) => {
    const id = nextFrameId++
    queuedFrames.push({ id, callback })
    return id
  },
  cancelFrame: (id) => {
    queuedFrames = queuedFrames.filter((frame) => frame.id !== id)
  },
})

let finalFrameFitCalls = 0
const finalFrameResults: TerminalFitResult[] = []

finalFrameCancellationScheduler.requestFit({
  fit: () => {
    finalFrameFitCalls += 1
  },
  proposeDimensions: () => ({ cols: 100, rows: 30 }),
}, () => {}, (result) => finalFrameResults.push(result))

flushFrame('preparation must run before cancelling single fit')

if (finalFrameFitCalls !== 0) throw new Error(`preparation must not fit, got ${finalFrameFitCalls}`)
finalFrameCancellationScheduler.cancelPending()

if (queuedFrames.length > 0) {
  flushFrame('cancelled single fit must not run')
}
if (finalFrameFitCalls !== 0) {
  throw new Error(`cancelling between frames must prevent its fit, got ${finalFrameFitCalls}`)
}
if (finalFrameResults.length !== 0) {
  throw new Error(`cancelled fit must not complete, got ${finalFrameResults.length}`)
}

const throwingScheduler = createTerminalFitScheduler({
  requestFrame: (callback) => {
    const id = nextFrameId++
    queuedFrames.push({ id, callback })
    return id
  },
  cancelFrame: (id) => {
    queuedFrames = queuedFrames.filter((frame) => frame.id !== id)
  },
})

throwingScheduler.requestFit({
  fit: () => {
    throw new Error('fit failed')
  },
  proposeDimensions: () => {
    throw new Error('dimensions should not be proposed after failed fit')
  },
}, () => {
  throw new Error('failed fit must not resize')
})

let fitErrorEscaped = false
try {
  flushFrame('throwing preparation must be scheduled')
  flushFrame('throwing fit must be scheduled')
} catch {
  fitErrorEscaped = true
}

if (fitErrorEscaped) throw new Error('fit errors must stay contained inside the scheduler')
throwingScheduler.cancelPending()

const unmeasurableScheduler = createTerminalFitScheduler({
  requestFrame: (callback) => {
    const id = nextFrameId++
    queuedFrames.push({ id, callback })
    return id
  },
  cancelFrame: (id) => {
    queuedFrames = queuedFrames.filter((frame) => frame.id !== id)
  },
})

let unmeasurableDimensions: { cols: number; rows: number } | undefined
const unmeasurableResults: TerminalFitResult[] = []
unmeasurableScheduler.requestFit({
  fit: () => {},
  proposeDimensions: () => unmeasurableDimensions,
}, () => {
  throw new Error('an unmeasurable fit must not resize')
}, (result) => unmeasurableResults.push(result))
flushFrame('unmeasurable preparation must not complete')
flushFrame('unmeasurable single fit must be scheduled on the following frame')

if (unmeasurableResults.join(',') !== 'unmeasurable') {
  throw new Error(`missing unmeasurable fit result: ${unmeasurableResults.join(',')}`)
}

unmeasurableDimensions = { cols: 90, rows: 22 }
unmeasurableScheduler.requestFit({
  fit: () => {},
  proposeDimensions: () => unmeasurableDimensions,
}, () => {}, (result) => unmeasurableResults.push(result))
flushFrame('measurable retry preparation must not fit yet')
flushFrame('measurable retry must be scheduled on the following frame')

if (unmeasurableResults.join(',') !== 'unmeasurable,fitted') {
  throw new Error(`measurable retry must report fitted once, got ${unmeasurableResults.join(',')}`)
}
