import {
  NOTIFICATION_ATTENTION_DELAY_MS,
  createNativeAttentionDelayScheduler,
} from './nativeAttentionDelay'

type TimerHandle = number

const scheduled = new Map<TimerHandle, { callback: () => void; ms: number }>()
const cleared: TimerHandle[] = []
let nextHandle = 1
let requested = 0

function reset(): void {
  scheduled.clear()
  cleared.length = 0
  nextHandle = 1
  requested = 0
}

function fire(handle: TimerHandle): void {
  const timer = scheduled.get(handle)
  if (!timer) throw new Error(`timer ${handle} is not scheduled`)
  scheduled.delete(handle)
  timer.callback()
}

function expectNumber(actual: number, expected: number, message: string): void {
  if (actual !== expected) throw new Error(message)
}

function createScheduler() {
  return createNativeAttentionDelayScheduler({
    setTimeout: (callback, ms) => {
      const handle = nextHandle++
      scheduled.set(handle, { callback, ms })
      return handle
    },
    clearTimeout: (handle) => {
      cleared.push(handle as TimerHandle)
      scheduled.delete(handle as TimerHandle)
    },
  })
}

reset()
let shouldRequest = true
const delayed = createScheduler()
delayed.schedule({
  tileId: 'terminal',
  delayEnabled: true,
  muted: false,
  shouldRequestAttention: () => shouldRequest,
  requestAttention: () => {
    requested += 1
  },
})
expectNumber(scheduled.size, 1, 'enabled delay must schedule one timer')
const delayedHandle = [...scheduled.keys()][0]
if (scheduled.get(delayedHandle)?.ms !== NOTIFICATION_ATTENTION_DELAY_MS) throw new Error('enabled delay must use the fixed attention delay')
fire(delayedHandle)
expectNumber(requested, 1, 'scheduled attention must request when the condition still applies')

reset()
const cancelled = createScheduler()
cancelled.schedule({
  tileId: 'terminal',
  delayEnabled: true,
  muted: false,
  shouldRequestAttention: () => true,
  requestAttention: () => {
    requested += 1
  },
})
const cancelledHandle = [...scheduled.keys()][0]
cancelled.cancel('terminal')
if (!cleared.includes(cancelledHandle)) throw new Error('cancel must clear the pending timer')
expectNumber(scheduled.size, 0, 'cancel must remove the pending timer')
expectNumber(requested, 0, 'cancelled attention must not request')

reset()
const deduped = createScheduler()
deduped.schedule({
  tileId: 'terminal',
  delayEnabled: true,
  muted: false,
  shouldRequestAttention: () => true,
  requestAttention: () => {
    requested += 1
  },
})
const firstHandle = [...scheduled.keys()][0]
deduped.schedule({
  tileId: 'terminal',
  delayEnabled: true,
  muted: false,
  shouldRequestAttention: () => true,
  requestAttention: () => {
    requested += 1
  },
})
expectNumber(scheduled.size, 1, 'scheduling the same tile twice must not duplicate timers')
if ([...scheduled.keys()][0] !== firstHandle) throw new Error('duplicate schedule must keep the existing timer')

reset()
const muted = createScheduler()
muted.schedule({
  tileId: 'terminal',
  delayEnabled: true,
  muted: true,
  shouldRequestAttention: () => true,
  requestAttention: () => {
    requested += 1
  },
})
expectNumber(scheduled.size, 0, 'muted tiles must not schedule attention')
expectNumber(requested, 0, 'muted tiles must not request attention')

reset()
const noLongerApplies = createScheduler()
shouldRequest = true
noLongerApplies.schedule({
  tileId: 'terminal',
  delayEnabled: true,
  muted: false,
  shouldRequestAttention: () => shouldRequest,
  requestAttention: () => {
    requested += 1
  },
})
shouldRequest = false
fire([...scheduled.keys()][0])
expectNumber(requested, 0, 'scheduled attention must not request after the condition stops applying')

reset()
const immediate = createScheduler()
immediate.schedule({
  tileId: 'timer',
  delayEnabled: false,
  muted: false,
  shouldRequestAttention: () => false,
  requestAttention: () => {
    requested += 1
  },
})
expectNumber(scheduled.size, 0, 'disabled delay must not schedule a timer')
expectNumber(requested, 1, 'disabled delay must request attention immediately')
