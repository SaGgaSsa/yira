import React, { createContext, useContext } from 'react'
import type { AgentTextSendTarget } from '@/utils/agentTextSend'

export interface AgentTextSendContextValue {
  targets: AgentTextSendTarget[]
  sendText: (targetTileId: string, text: string, sourceTileId: string) => void | Promise<void>
}

interface AgentTextSendContextProviderProps {
  value: AgentTextSendContextValue
  className?: string
  children: React.ReactNode
}

const AgentTextSendContext = createContext<AgentTextSendContextValue | null>(null)

export function useAgentTextSendContext(): AgentTextSendContextValue | null {
  return useContext(AgentTextSendContext)
}

export function AgentTextSendContextProvider({
  value,
  className,
  children,
}: AgentTextSendContextProviderProps): React.ReactElement {
  return (
    <AgentTextSendContext.Provider value={value}>
      <div className={className}>{children}</div>
    </AgentTextSendContext.Provider>
  )
}
