import { useSyncExternalStore } from 'react'
import { createAgentSessionSource, EMPTY_AGENT_SESSIONS } from '@/utils/agentSessionSource'

const source = createAgentSessionSource(() => window.electron.agents)
const emptySnapshot = () => EMPTY_AGENT_SESSIONS
const inactiveSubscription = () => () => {}

export function useAgentSessionSnapshot(enabled = true) {
  return useSyncExternalStore(
    enabled ? source.subscribe : inactiveSubscription,
    enabled ? source.getSnapshot : emptySnapshot,
    emptySnapshot,
  )
}
