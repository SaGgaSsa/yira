import { createTerminalFitScheduler } from './terminalFitScheduler'

let queuedFrame: (() => void) | null = null
let nextFrameId = 1

const scheduler = createTerminalFitScheduler({
  requestFrame: (callback) => {
    queuedFrame = callback
    return nextFrameId++
  },
  cancelFrame: () => {
    queuedFrame = null
  },
})

let fitCalls = 0
let resizeCalls: Array<{ cols: number; rows: number }> = []
let dimensions = { cols: 100, rows: 30 }

function flushFrame(message: string): void {
  const frame = queuedFrame
  if (!frame) throw new Error(message)
  queuedFrame = null
  frame()
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

scheduler.requestFit(fitAddon, (cols, rows) => {
  resizeCalls.push({ cols, rows })
})
flushFrame('second fit must be scheduled on the next frame')

if (getFitCalls() !== 2) throw new Error(`second frame must still allow xterm fit, got ${getFitCalls()}`)
if (getResizeCallCount() !== 1) throw new Error('same terminal dimensions must not send a redundant PTY resize')

dimensions = { cols: 120, rows: 35 }
scheduler.requestFit(fitAddon, (cols, rows) => {
  resizeCalls.push({ cols, rows })
})
flushFrame('dimension change fit must be scheduled on the next frame')

if (getResizeCallCount() !== 2) throw new Error(`changed dimensions must send a PTY resize, got ${getResizeCallCount()}`)
if (resizeCalls[1].cols !== 120 || resizeCalls[1].rows !== 35) {
  throw new Error(`unexpected changed resize dimensions ${resizeCalls[1].cols}x${resizeCalls[1].rows}`)
}

scheduler.requestFit(fitAddon, () => {
  throw new Error('cancelled fit must not run')
})
scheduler.cancelPending()
if (queuedFrame) {
  flushFrame('cancelled fit must not leave a queued frame')
}

const throwingScheduler = createTerminalFitScheduler({
  requestFrame: (callback) => {
    queuedFrame = callback
    return nextFrameId++
  },
  cancelFrame: () => {
    queuedFrame = null
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
