import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder, RefreshCw, Search, X } from 'lucide-react'
import type { FileEntry } from '@shared/types'
import {
  createExplorerNode,
  toggleExplorerDirectory,
  updateExplorerDirectory,
  type ExplorerNode,
} from '@/utils/workspaceExplorerTree'
import {
  createWorkspaceSearchState,
  executeWorkspaceFileSearch,
  getWorkspaceSearchKeyAction,
  getWorkspaceSearchView,
  isWorkspaceSearchRequestCurrent,
  resetWorkspaceSearchState,
  startWorkspaceSearch,
  type WorkspaceSearchRequest,
  type WorkspaceSearchState,
} from '@/utils/workspaceExplorerSearch'

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
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchState, setSearchState] = useState<WorkspaceSearchState>(() => createWorkspaceSearchState())
  const searchRequestIdRef = useRef(0)
  const searchRootPathRef = useRef(rootPath)
  searchRootPathRef.current = rootPath
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

  useEffect(() => {
    searchRequestIdRef.current += 1
    setSearchOpen(false)
    setSearchState(resetWorkspaceSearchState())
  }, [rootPath])

  useEffect(() => {
    if (!searchOpen || searchState.status !== 'loading') return

    const requestId = searchRequestIdRef.current
    const query = searchState.query
    const responseRequest: WorkspaceSearchRequest = { id: requestId, rootPath, query }
    const timeoutId = window.setTimeout(() => {
      void executeWorkspaceFileSearch(rootPath, query, window.electron.files.search)
        .then((nextState) => {
          setSearchState((current) => {
            const currentRequest: WorkspaceSearchRequest = {
              id: searchRequestIdRef.current,
              rootPath: searchRootPathRef.current,
              query: current.query,
            }
            return isWorkspaceSearchRequestCurrent(responseRequest, currentRequest) ? nextState : current
          })
        })
    }, 200)

    return () => window.clearTimeout(timeoutId)
  }, [rootPath, searchOpen, searchState.query, searchState.status])

  const handleToggleDirectory = useCallback((node: ExplorerNode) => {
    const shouldLoad = !node.expanded && node.status !== 'ready'
    setRoot((current) => toggleExplorerDirectory(current, node.relativePath))
    if (shouldLoad) void loadDirectory(node.relativePath)
  }, [loadDirectory])

  const handleRetry = useCallback((node: ExplorerNode) => {
    void loadDirectory(node.relativePath)
  }, [loadDirectory])

  const handleOpenRelativePath = useCallback((relativePath: string) => {
    setOpenError(null)
    void onOpenFile(relativePath)
      .catch((error: unknown) => {
        setOpenError(errorMessage(error))
      })
  }, [onOpenFile])

  const handleOpenFile = useCallback((node: ExplorerNode) => {
    handleOpenRelativePath(node.relativePath)
  }, [handleOpenRelativePath])

  const handleOpenSearch = useCallback(() => {
    searchRequestIdRef.current += 1
    setSearchOpen(true)
    setSearchState(resetWorkspaceSearchState())
  }, [])

  const handleCloseSearch = useCallback(() => {
    searchRequestIdRef.current += 1
    setSearchOpen(false)
    setSearchState(resetWorkspaceSearchState())
  }, [])

  const handleSearchQueryChange = useCallback((query: string) => {
    searchRequestIdRef.current += 1
    setSearchState((current) => startWorkspaceSearch(current, query))
  }, [])

  const searchView = getWorkspaceSearchView(searchState)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 text-text-secondary">
        {searchOpen ? (
          <>
            <input
              autoFocus
              aria-label="Search workspace files"
              className="min-w-0 flex-1 bg-transparent text-sm text-text-display outline-none placeholder:text-text-disabled"
              onChange={(event) => handleSearchQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (getWorkspaceSearchKeyAction(event.key) !== 'close') return
                event.preventDefault()
                handleCloseSearch()
              }}
              placeholder="Search files"
              type="search"
              value={searchState.query}
            />
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-hover-bg hover:text-text-display"
              onClick={handleCloseSearch}
              title="Close search"
              aria-label="Close search"
            >
              <X size={15} />
            </button>
          </>
        ) : (
          <>
            <span className="nd-label min-w-0 flex-1 truncate">{rootName}</span>
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-hover-bg hover:text-text-display"
              onClick={handleOpenSearch}
              title="Search workspace files"
              aria-label="Search workspace files"
            >
              <Search size={15} />
            </button>
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {searchOpen ? (
          <>
            {searchView === 'prompt' && <div className="px-4 py-3 text-sm text-text-disabled">Type to search files</div>}
            {searchView === 'loading' && <div className="px-4 py-3 text-sm text-text-disabled">Searching…</div>}
            {searchView === 'error' && <div className="px-4 py-3 text-sm text-red-300">{searchState.error}</div>}
            {searchView === 'no-results' && <div className="px-4 py-3 text-sm text-text-disabled">No files found</div>}
            {searchView === 'results' && (
              <ul>
                {searchState.entries.map((entry) => {
                  const isActiveFile = entry.relativePath === activeFilePath
                  return (
                    <li key={entry.relativePath}>
                      <button
                        type="button"
                        className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-hover-bg hover:text-text-display ${isActiveFile ? 'bg-active-bg text-text-display' : 'text-text-secondary'}`}
                        onClick={() => handleOpenRelativePath(entry.relativePath)}
                        title={entry.relativePath}
                      >
                        <File size={14} className="shrink-0" />
                        <span className="min-w-0 truncate">{entry.name}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-text-disabled">{entry.relativePath}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        ) : (
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
        )}
      </div>
      {openError && <div className="shrink-0 border-t border-border px-3 py-2 text-xs text-red-300">{openError}</div>}
    </div>
  )
}
