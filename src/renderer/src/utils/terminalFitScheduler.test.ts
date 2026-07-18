import { createTerminalFitScheduler } from './terminalFitScheduler'

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
})
scheduler.requestFit(fitAddon, (cols, rows) => {
  resizeCalls.push({ cols, rows })
})

flushFrame('fit must be scheduled on the next frame')

if (getFitCalls() !== 1) throw new Error(`coalesced requests must fit once, got ${getFitCalls()}`)
if (getResizeCallCount() !== 1) throw new Error(`coalesced requests must resize once, got ${getResizeCallCount()}`)
if (resizeCalls[0].cols !== 100 || resizeCalls[0].rows !== 30) {
  throw new Error(`unexpected resize dimensions ${resizeCalls[0].cols}x${resizeCalls[0].rows}`)
}

flushFrame('stabilization fit must be scheduled on the following frame')

if (getFitCalls() !== 2) throw new Error(`stabilization frame must fit again, got ${getFitCalls()}`)
if (getResizeCallCount() !== 1) throw new Error('unchanged stabilization dimensions must not resize the PTY again')

scheduler.requestFit(fitAddon, (cols, rows) => {
  resizeCalls.push({ cols, rows })
})
flushFrame('second fit must be scheduled on the next frame')

if (getFitCalls() !== 3) throw new Error(`second request must still allow xterm fit, got ${getFitCalls()}`)
if (getResizeCallCount() !== 1) throw new Error('same terminal dimensions must not send a redundant PTY resize')

flushFrame('second stabilization fit must be scheduled on the following frame')

if (getFitCalls() !== 4) throw new Error(`second stabilization frame must fit again, got ${getFitCalls()}`)
if (getResizeCallCount() !== 1) throw new Error('unchanged second stabilization dimensions must not resize the PTY again')

dimensions = { cols: 120, rows: 35 }
scheduler.requestFit(fitAddon, (cols, rows) => {
  resizeCalls.push({ cols, rows })
})
flushFrame('dimension change fit must be scheduled on the next frame')

if (getFitCalls() !== 5) throw new Error(`dimension change must fit once before stabilization, got ${getFitCalls()}`)
if (getResizeCallCount() !== 2) throw new Error(`changed dimensions must send a PTY resize, got ${getResizeCallCount()}`)
if (resizeCalls[1].cols !== 120 || resizeCalls[1].rows !== 35) {
  throw new Error(`unexpected changed resize dimensions ${resizeCalls[1].cols}x${resizeCalls[1].rows}`)
}

flushFrame('dimension change stabilization fit must be scheduled on the following frame')

if (getFitCalls() !== 6) throw new Error(`dimension change stabilization must fit again, got ${getFitCalls()}`)
if (getResizeCallCount() !== 2) throw new Error('unchanged dimension change stabilization must not resize the PTY again')

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

dimensionsChangeScheduler.requestFit({
  fit: () => {
    changingFitCalls += 1
  },
  proposeDimensions: () => dimensionsBetweenFits,
}, (cols, rows) => {
  changedDimensionResizeCalls.push({ cols, rows })
})

flushFrame('initial fit must be scheduled before dimensions change')

dimensionsBetweenFits = { cols: 80, rows: 25 }
flushFrame('stabilization fit must use dimensions that changed after the first fit')

if (changingFitCalls !== 2) throw new Error(`changed dimensions must fit twice, got ${changingFitCalls}`)
if (changedDimensionResizeCalls.length !== 2) {
  throw new Error(`changed stabilization dimensions must resize the PTY twice, got ${changedDimensionResizeCalls.length}`)
}
if (changedDimensionResizeCalls[1].cols !== 80 || changedDimensionResizeCalls[1].rows !== 25) {
  throw new Error(`stabilization resize must use changed dimensions, got ${changedDimensionResizeCalls[1].cols}x${changedDimensionResizeCalls[1].rows}`)
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

finalFrameCancellationScheduler.requestFit({
  fit: () => {
    finalFrameFitCalls += 1
  },
  proposeDimensions: () => ({ cols: 100, rows: 30 }),
}, () => {})

flushFrame('initial fit must run before cancelling stabilization')
finalFrameCancellationScheduler.cancelPending()

if (queuedFrames.length > 0) {
  flushFrame('cancelled stabilization fit must not run')
}
if (finalFrameFitCalls !== 1) {
  throw new Error(`cancelling stabilization must prevent its fit, got ${finalFrameFitCalls}`)
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
  flushFrame('throwing fit must be scheduled')
} catch {
  fitErrorEscaped = true
}

if (fitErrorEscaped) throw new Error('fit errors must stay contained inside the scheduler')
