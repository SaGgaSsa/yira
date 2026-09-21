import { useMemo, useSyncExternalStore } from 'react'
import type { TerminalRuntimeRegistry } from '@/utils/terminalRuntimeRegistry'
import type { TerminalRuntime } from '@/utils/terminalRuntime'

/**
 * Live terminal counts per workspace, updated through real registry
 * notifications when runtimes are acquired or destroyed. No polling.
 */
export function useWorkspaceTerminalCounts(
  registry: TerminalRuntimeRegistry<TerminalRuntime>,
): Record<string, number> {
  const revision = useSyncExternalStore(
    (notify) => registry.subscribe(notify),
    () => registry.getRevision(),
  )
  return useMemo(() => registry.countTerminalsByWorkspace(), [registry, revision])
}
