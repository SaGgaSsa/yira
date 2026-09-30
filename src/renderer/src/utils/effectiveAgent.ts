import type { AgentProvider, UserSettings, WorkspaceConfig } from '@shared/types'

export function getEnabledAgentProviders(agents: UserSettings['agents']): AgentProvider[] {
  return (['claude', 'codex'] as const).filter((provider) => agents[provider]?.enabled === true)
}

export function getEffectiveAgentProvider(config: Pick<WorkspaceConfig, 'agentProvider'>, agents: UserSettings['agents']): AgentProvider | undefined {
  const provider = config.agentProvider
  return provider && agents[provider]?.enabled === true ? provider : undefined
}
