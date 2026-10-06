import React, { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AgentProvider,
  AgentProvidersConfig,
  AgentSessionHistoryItem,
  SourceControlViewMode,
  TileState,
  Workspace,
  FileTileOpenOptions,
  GitFileChange,
} from '@shared/types'
import { AgentPanel } from './AgentPanel'
import { useSettingsStore } from '@/store/settingsStore'
import { getEffectiveAgentProvider } from '@/utils/effectiveAgent'
import { WorkspaceExplorer } from './WorkspaceExplorer'
import { WorkspaceSourceControl } from './WorkspaceSourceControl'
import { useSidePanelWidth } from '@/hooks/useSidePanelWidth'

type WorkspacePanelTab = 'explorer' | 'agents' | 'source-control'

interface WorkspacePanelProps {
  rootPath: string
  workspaceId: string
  sourceControlRepositoryPaths: string[]
  sourceControlViewMode: SourceControlViewMode
  onWorkspaceUpdated: (workspace: Workspace) => void
  activeFilePath: string | null
  onOpenFile: (relativePath: string, options?: FileTileOpenOptions) => Promise<void>
  onOpenDiff: (repositoryPath: string, change: GitFileChange, staged: boolean) => void
  agentProvider?: AgentProvider
  agentProviders: AgentProvidersConfig
  tiles: TileState[]
  terminalTitles: Record<string, string>
  onFocusTile: (tileId: string) => void
  onOpenAgentsSession: (tileId: string) => void
  onResumeInTile?: (item: AgentSessionHistoryItem) => void
  onOpenWorkspaceSettings: (initialTab?: 'sourceControl') => void
}

export function WorkspacePanel({
  rootPath,
  workspaceId,
  sourceControlRepositoryPaths,
  sourceControlViewMode,
  onWorkspaceUpdated,
  activeFilePath,
  onOpenFile,
  onOpenDiff,
  agentProvider,
  agentProviders,
  tiles,
  terminalTitles,
  onFocusTile,
  onOpenAgentsSession,
  onResumeInTile,
  onOpenWorkspaceSettings,
}: WorkspacePanelProps): React.ReactElement {
  const agents = useSettingsStore((state) => state.agents)
  const effectiveAgentProvider = getEffectiveAgentProvider({ agentProvider }, agents)
  const [width, setWidth] = useSidePanelWidth()
  const [resizing, setResizing] = useState(false)
  const [tab, setTab] = useState<WorkspacePanelTab>('explorer')
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null)

  const handleResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    resizeStartRef.current = { x: event.clientX, width }
    setResizing(true)
  }, [width])

  useEffect(() => {
    if (!resizing) return

    const handleMove = (event: MouseEvent) => {
      const start = resizeStartRef.current
      if (!start) return
      setWidth(start.width - (event.clientX - start.x))
    }
    const handleUp = () => {
      resizeStartRef.current = null
      setResizing(false)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizing])

  return (
    <aside className="relative box-border flex min-h-0 shrink-0 flex-col border-l border-border bg-bg-secondary" style={{ width, minWidth: 300 }}>
      <div className="absolute bottom-0 left-0 top-0 z-10 w-2 cursor-col-resize" onMouseDown={handleResizeStart}>
        <div className="absolute bottom-8 left-0 top-8 w-px bg-border-visible" />
      </div>
      <div className="flex shrink-0 border-b border-border px-2">
        {([
          ['explorer', 'Explorer'],
          ['agents', 'Agents'],
          ['source-control', 'Source Control'],
        ] as Array<[WorkspacePanelTab, string]>).map(([id, label]) => (
          <button
            key={id}
            className={`nd-label border-b-2 px-3 py-3 transition-colors ${tab === id ? 'border-text-display text-text-display' : 'border-transparent text-text-secondary hover:text-text-display'}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'explorer' && <WorkspaceExplorer rootPath={rootPath} activeFilePath={activeFilePath} onOpenFile={onOpenFile} />}
        {tab === 'agents' && (
          <AgentPanel
            key={`${workspaceId}:${effectiveAgentProvider ?? 'none'}`}
            workspaceId={workspaceId}
            selectedProvider={effectiveAgentProvider}
            agentProviders={agentProviders}
            tiles={tiles}
            terminalTitles={terminalTitles}
            onFocusTile={onFocusTile}
            onOpenAgentsSession={onOpenAgentsSession}
            onResumeInTile={onResumeInTile}
            onOpenWorkspaceSettings={onOpenWorkspaceSettings}
          />
        )}
        {tab === 'source-control' && (
          <WorkspaceSourceControl
            key={workspaceId}
            workspaceId={workspaceId}
            sourceControlRepositoryPaths={sourceControlRepositoryPaths}
            sourceControlViewMode={sourceControlViewMode}
            onWorkspaceUpdated={onWorkspaceUpdated}
            onOpenWorkspaceSettings={onOpenWorkspaceSettings}
            onOpenDiff={onOpenDiff}
          />
        )}
      </div>
    </aside>
  )
}
