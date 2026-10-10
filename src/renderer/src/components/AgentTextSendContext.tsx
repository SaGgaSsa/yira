import React, { createContext, useContext } from 'react'

export interface AgentTextSendContextValue {
  /** Opens the new-prompt dialog with `text` as the prompt. */
  sendText: (text: string) => void
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
