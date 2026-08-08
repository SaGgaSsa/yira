import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder, RefreshCw } from 'lucide-react'
import type { FileEntry } from '@shared/types'
import {
  createExplorerNode,
  toggleExplorerDirectory,
  updateExplorerDirectory,
  type ExplorerNode,
} from '@/utils/workspaceExplorerTree'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load directory'
}

function rootLabel(rootPath: string): string {
  const parts = rootPath.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || rootPath
}

function toExplorerNode(entry: FileEntry): ExplorerNode {
  return createExplorerNode(entry.relativePath, entry.name, entry.kind)
}

interface ExplorerTreeNodeProps {
  node: ExplorerNode
  depth: number
  onToggleDirectory: (node: ExplorerNode) => void
  onOpenFile: (node: ExplorerNode) => void
  onRetry: (node: ExplorerNode) => void
  activeFilePath: string | null
}

function ExplorerTreeNode({ node, depth, onToggleDirectory, onOpenFile, onRetry, activeFilePath }: ExplorerTreeNodeProps): React.ReactElement {
  const isDirectory = node.kind === 'directory'
  const isActiveFile = !isDirectory && node.relativePath === activeFilePath
  const Icon = isDirectory ? Folder : File

  return (
    <li>
      <button
        className={`flex w-full items-center gap-1.5 py-1.5 pr-3 text-left text-sm transition-colors hover:bg-hover-bg hover:text-text-display ${isActiveFile ? 'bg-active-bg text-text-display' : 'text-text-secondary'}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => isDirectory ? onToggleDirectory(node) : onOpenFile(node)}
        title={node.name}
      >
        {isDirectory ? (
          node.expanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />
        ) : <span className="w-[14px] shrink-0" />}
        <Icon size={14} className="shrink-0" />
        <span className="min-w-0 truncate">{node.name}</span>
      </button>

      {isDirectory && node.expanded && (
        <div>
          {node.status === 'loading' && (
            <div className="px-3 py-2 text-xs text-text-disabled" style={{ paddingLeft: `${42 + depth * 16}px` }}>Loading…</div>
          )}
          {node.status === 'error' && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-300" style={{ paddingLeft: `${28 + depth * 16}px` }}>
              <span className="min-w-0 flex-1 truncate" title={node.error}>{node.error ?? 'Unable to load directory'}</span>
              <button
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-hover-bg"
                onClick={(event) => {
                  event.stopPropagation()
                  onRetry(node)
                }}
                title="Retry"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          )}
          {node.status === 'ready' && node.children?.map((child) => (
            <ExplorerTreeNode
              key={child.relativePath}
              node={child}
              depth={depth + 1}
              onToggleDirectory={onToggleDirectory}
              onOpenFile={onOpenFile}
              onRetry={onRetry}
              activeFilePath={activeFilePath}
            />
          ))}
        </div>
      )}
    </li>
  )
}

interface WorkspaceExplorerProps {
  rootPath: string
  activeFilePath: string | null
  onOpenFile: (relativePath: string) => Promise<void>
}

export function WorkspaceExplorer({ rootPath, activeFilePath, onOpenFile }: WorkspaceExplorerProps): React.ReactElement {
  const [root, setRoot] = useState<ExplorerNode>(() => createExplorerNode('', rootLabel(rootPath), 'directory'))
  const [openError, setOpenError] = useState<string | null>(null)
  const rootName = useMemo(() => rootLabel(rootPath), [rootPath])

  const loadDirectory = useCallback(async (relativePath: string) => {
    setRoot((current) => updateExplorerDirectory(current, relativePath, { status: 'loading', error: undefined }))

    try {
      const result = await window.electron.files.list(rootPath, relativePath)
      setRoot((current) => updateExplorerDirectory(current, relativePath, {
        status: 'ready',
        children: result.entries.map(toExplorerNode),
        error: undefined,
      }))
    } catch (error) {
      setRoot((current) => updateExplorerDirectory(current, relativePath, {
        status: 'error',
        error: errorMessage(error),
      }))
    }
  }, [rootPath])

  useEffect(() => {
    const nextRoot = createExplorerNode('', rootName, 'directory')
    setRoot(nextRoot)
    void loadDirectory('')
  }, [loadDirectory, rootName])

  const handleToggleDirectory = useCallback((node: ExplorerNode) => {
    const shouldLoad = !node.expanded && node.status !== 'ready'
    setRoot((current) => toggleExplorerDirectory(current, node.relativePath))
    if (shouldLoad) void loadDirectory(node.relativePath)
  }, [loadDirectory])

  const handleRetry = useCallback((node: ExplorerNode) => {
    void loadDirectory(node.relativePath)
  }, [loadDirectory])

  const handleOpenFile = useCallback((node: ExplorerNode) => {
    setOpenError(null)
    void onOpenFile(node.relativePath)
      .catch((error: unknown) => {
        setOpenError(errorMessage(error))
      })
  }, [onOpenFile])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="nd-label shrink-0 border-b border-border px-4 py-3 text-text-secondary">{rootName}</div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        <ul>
          <ExplorerTreeNode
            node={root}
            depth={0}
            onToggleDirectory={handleToggleDirectory}
            onOpenFile={handleOpenFile}
            onRetry={handleRetry}
            activeFilePath={activeFilePath}
          />
        </ul>
      </div>
      {openError && <div className="shrink-0 border-t border-border px-3 py-2 text-xs text-red-300">{openError}</div>}
    </div>
  )
}
