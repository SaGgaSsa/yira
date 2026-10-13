import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FilePlus,
  Folder,
  FolderPlus,
  Pencil,
  RefreshCw,
  Search,
  Trash,
  X,
} from 'lucide-react'
import type { FileEntry, FileEntryKind, FileNameError } from '@shared/types'
import { validateEntryName } from '@shared/fileName'
import { isHiddenRelativePath } from '@shared/hiddenEntries'
import {
  createExplorerNode,
  expandExplorerDirectory,
  findExplorerNode,
  getCreateParentPath,
  getLoadedExpandedDirectories,
  getParentRelativePath,
  hasExplorerSiblingNamed,
  joinRootPath,
  mergeExplorerDirectoryChildren,
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
import { ContextMenu, type MenuItem } from './ContextMenu'
import type { ConfirmDialogOptions } from './AppDialog'
import { ExplorerInlineInput } from './ExplorerInlineInput'

const SHOW_HIDDEN_STORAGE_KEY = 'yira.explorer.showHidden'

const FILE_NAME_ERROR_KEYS: Record<FileNameError, string> = {
  empty: 'files.errorEmpty',
  'invalid-segment': 'files.errorInvalidSegment',
  'invalid-character': 'files.errorInvalidCharacter',
  'reserved-name': 'files.errorReservedName',
  'trailing-dot-or-space': 'files.errorTrailingDotOrSpace',
  'too-long': 'files.errorTooLong',
  'absolute-path': 'files.errorAbsolutePath',
}

type ExplorerDraft =
  | { mode: 'create'; parentPath: string; kind: FileEntryKind }
  | { mode: 'rename'; relativePath: string }

interface ExplorerContextMenuState {
  x: number
  y: number
  /** Right-clicked row, or null for the empty area of the tree. */
  node: ExplorerNode | null
}

function readShowHidden(): boolean {
  try {
    return window.localStorage.getItem(SHOW_HIDDEN_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeShowHidden(value: boolean): void {
  try {
    window.localStorage.setItem(SHOW_HIDDEN_STORAGE_KEY, String(value))
  } catch {
    // The preference only lasts for this session when storage is unavailable.
  }
}

// Explorer trees by root path, kept for the app session so switching panel tabs
// or workspaces does not collapse the folders the user had open.
const explorerTreeCache = new Map<string, ExplorerNode>()

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function rootLabel(rootPath: string): string {
  const parts = rootPath.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || rootPath
}

function toExplorerNode(entry: FileEntry): ExplorerNode {
  return createExplorerNode(entry.relativePath, entry.name, entry.kind)
}

interface ExplorerTreeHandlers {
  activeFilePath: string | null
  selectedPath: string | null
  draft: ExplorerDraft | null
  onSelect: (node: ExplorerNode) => void
  onToggleDirectory: (node: ExplorerNode) => void
  onOpenFile: (node: ExplorerNode) => void
  onRetry: (node: ExplorerNode) => void
  onContextMenu: (event: React.MouseEvent, node: ExplorerNode) => void
  /** Inline input for a new entry (node null) or for renaming the given node. */
  renderDraftInput: (depth: number, node: ExplorerNode | null) => React.ReactNode
}

interface ExplorerTreeNodeProps {
  node: ExplorerNode
  depth: number
  handlers: ExplorerTreeHandlers
}

function ExplorerTreeNode({ node, depth, handlers }: ExplorerTreeNodeProps): React.ReactElement {
  const { t } = useTranslation()
  const { activeFilePath, selectedPath, draft, onSelect, onToggleDirectory, onOpenFile, onRetry, onContextMenu, renderDraftInput } = handlers
  const isDirectory = node.kind === 'directory'
  const isActiveFile = !isDirectory && node.relativePath === activeFilePath
  const isSelected = node.relativePath === selectedPath
  const isRenaming = draft?.mode === 'rename' && draft.relativePath === node.relativePath
  const isCreateTarget = draft?.mode === 'create' && draft.parentPath === node.relativePath
  const Icon = isDirectory ? Folder : File
  const stateClass = isActiveFile
    ? 'bg-active-bg text-text-display'
    : isSelected ? 'bg-hover-bg text-text-display' : 'text-text-secondary'

  return (
    <li>
      {isRenaming ? renderDraftInput(depth, node) : (
        <button
          className={`flex w-full items-center gap-1.5 py-1.5 pr-3 text-left text-sm transition-colors hover:bg-hover-bg hover:text-text-display ${stateClass} ${isSelected ? 'shadow-[inset_2px_0_0_var(--text-secondary)]' : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => {
            onSelect(node)
            if (isDirectory) onToggleDirectory(node)
            else onOpenFile(node)
          }}
          onContextMenu={(event) => onContextMenu(event, node)}
          title={node.name}
        >
          {isDirectory ? (
            node.expanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />
          ) : <span className="w-[14px] shrink-0" />}
          <Icon size={14} className="shrink-0" />
          <span className="min-w-0 truncate">{node.name}</span>
        </button>
      )}

      {isDirectory && node.expanded && (
        <ul>
          {isCreateTarget && <li>{renderDraftInput(depth + 1, null)}</li>}
          {node.status === 'loading' && (
            <li className="px-3 py-2 text-xs text-text-disabled" style={{ paddingLeft: `${42 + depth * 16}px` }}>{t('common.loading')}</li>
          )}
          {node.status === 'error' && (
            <li className="flex items-center gap-2 px-3 py-2 text-xs text-red-300" style={{ paddingLeft: `${28 + depth * 16}px` }}>
              <span className="min-w-0 flex-1 truncate" title={node.error}>{node.error ?? t('ui.unableToLoadDirectory')}</span>
              <button
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-hover-bg"
                onClick={(event) => {
                  event.stopPropagation()
                  onRetry(node)
                }}
                title={t('files.retry')}
              >
                <RefreshCw size={13} />
              </button>
            </li>
          )}
          {node.status === 'ready' && node.children?.map((child) => (
            <ExplorerTreeNode
              key={child.relativePath}
              node={child}
              depth={depth + 1}
              handlers={handlers}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

interface WorkspaceExplorerProps {
  rootPath: string
  activeFilePath: string | null
  onOpenFile: (relativePath: string) => Promise<void>
  onEntryRenamed?: (oldPath: string, newPath: string) => void
  onEntryTrashed?: (path: string) => void
  requestConfirm: (options: ConfirmDialogOptions) => Promise<boolean>
}

export function WorkspaceExplorer({ rootPath, activeFilePath, onOpenFile, onEntryRenamed, onEntryTrashed, requestConfirm }: WorkspaceExplorerProps): React.ReactElement {
  const { t } = useTranslation()
  const [root, setRoot] = useState<ExplorerNode>(() => (
    explorerTreeCache.get(rootPath) ?? createExplorerNode('', rootLabel(rootPath), 'directory')
  ))
  const treeRootPathRef = useRef(rootPath)
  const [openError, setOpenError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchState, setSearchState] = useState<WorkspaceSearchState>(() => createWorkspaceSearchState())
  const searchRequestIdRef = useRef(0)
  const searchRootPathRef = useRef(rootPath)
  searchRootPathRef.current = rootPath
  const rootName = useMemo(() => rootLabel(rootPath), [rootPath])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [draft, setDraft] = useState<ExplorerDraft | null>(null)
  const [contextMenu, setContextMenu] = useState<ExplorerContextMenuState | null>(null)
  const [showHidden, setShowHidden] = useState(readShowHidden)
  const showHiddenRef = useRef(showHidden)
  const rootRef = useRef(root)
  rootRef.current = root

  const loadDirectory = useCallback(async (relativePath: string) => {
    setRoot((current) => updateExplorerDirectory(current, relativePath, { status: 'loading', error: undefined }))

    try {
      const result = await window.electron.files.list(rootPath, relativePath, { showIgnored: showHiddenRef.current })
      setRoot((current) => updateExplorerDirectory(current, relativePath, {
        status: 'ready',
        children: result.entries.map(toExplorerNode),
        error: undefined,
      }))
    } catch (error) {
      setRoot((current) => updateExplorerDirectory(current, relativePath, {
        status: 'error',
        error: errorMessage(error, t('ui.unableToLoadDirectory')),
      }))
    }
  }, [rootPath, t])

  const refreshDirectory = useCallback(async (relativePath: string) => {
    try {
      const result = await window.electron.files.list(rootPath, relativePath, { showIgnored: showHiddenRef.current })
      if (treeRootPathRef.current !== rootPath) return
      setRoot((current) => mergeExplorerDirectoryChildren(current, relativePath, result.entries.map(toExplorerNode)))
    } catch {
      // Keep the cached listing; the user can collapse and reopen the folder to retry.
    }
  }, [rootPath])

  // Runs before the root reset below so a stale tree is never stored under a new root path.
  useEffect(() => {
    if (treeRootPathRef.current === rootPath) explorerTreeCache.set(rootPath, root)
  }, [root, rootPath])

  useEffect(() => {
    treeRootPathRef.current = rootPath
    const cached = explorerTreeCache.get(rootPath)
    if (cached?.status === 'ready') {
      setRoot(cached)
      for (const relativePath of getLoadedExpandedDirectories(cached)) void refreshDirectory(relativePath)
      return
    }

    const nextRoot = createExplorerNode('', rootName, 'directory')
    setRoot(nextRoot)
    void loadDirectory('')
  }, [loadDirectory, refreshDirectory, rootName, rootPath])

  useEffect(() => {
    searchRequestIdRef.current += 1
    setSearchOpen(false)
    setSearchState(resetWorkspaceSearchState())
    setSelectedPath(null)
    setDraft(null)
    setContextMenu(null)
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
        setOpenError(errorMessage(error, t('ui.unableToLoadDirectory')))
      })
  }, [onOpenFile, t])

  const handleOpenFile = useCallback((node: ExplorerNode) => {
    handleOpenRelativePath(node.relativePath)
  }, [handleOpenRelativePath])

  const refreshLoadedDirectories = useCallback(() => {
    for (const relativePath of getLoadedExpandedDirectories(rootRef.current)) void refreshDirectory(relativePath)
  }, [refreshDirectory])

  const applyShowHidden = useCallback((next: boolean) => {
    showHiddenRef.current = next
    setShowHidden(next)
    writeShowHidden(next)
    refreshLoadedDirectories()
  }, [refreshLoadedDirectories])

  const handleSelect = useCallback((node: ExplorerNode) => {
    setSelectedPath(node.relativePath)
  }, [])

  const selectedNode = selectedPath === null ? null : findExplorerNode(root, selectedPath)

  const startCreate = useCallback((kind: FileEntryKind, parentPath: string) => {
    setContextMenu(null)
    setOpenError(null)
    const parent = findExplorerNode(rootRef.current, parentPath)
    if (parent && !(parent.expanded && parent.status === 'loading') && parent.status !== 'ready') {
      void loadDirectory(parentPath)
    }
    setRoot((current) => expandExplorerDirectory(current, parentPath))
    setDraft({ mode: 'create', parentPath, kind })
  }, [loadDirectory])

  const startRename = useCallback((node: ExplorerNode) => {
    setContextMenu(null)
    setOpenError(null)
    setSelectedPath(node.relativePath)
    setDraft({ mode: 'rename', relativePath: node.relativePath })
  }, [])

  const requestTrash = useCallback(async (node: ExplorerNode) => {
    setContextMenu(null)
    const confirmed = await requestConfirm({
      title: t('files.trashTitle'),
      message: t('files.trashMessage', { name: node.name }),
      confirmLabel: t('files.trashConfirm'),
      danger: true,
    })
    if (!confirmed) return

    try {
      await window.electron.files.trashEntry(rootPath, node.relativePath)
      onEntryTrashed?.(node.relativePath)
      await refreshDirectory(getParentRelativePath(node.relativePath))
      setSelectedPath((current) => (
        current !== null && (current === node.relativePath || current.startsWith(`${node.relativePath}/`)) ? null : current
      ))
    } catch (error) {
      setOpenError(errorMessage(error, t('files.nameMissing')))
    }
  }, [onEntryTrashed, refreshDirectory, requestConfirm, rootPath, t])

  const getNameError = useCallback((value: string, parentPath: string, allowNested: boolean, ignorePath?: string): string | null => {
    const nameError = validateEntryName(value, { allowNested })
    if (nameError) return t(FILE_NAME_ERROR_KEYS[nameError])
    return hasExplorerSiblingNamed(rootRef.current, parentPath, value, ignorePath) ? t('files.nameExists') : null
  }, [t])

  // Reveals the changed path in the listing, turning on "show hidden" when the filter would hide it.
  const refreshAfterChange = useCallback(async (parentPath: string, changedPath: string) => {
    if (isHiddenRelativePath(changedPath) && !showHiddenRef.current) {
      applyShowHidden(true)
      return
    }
    await refreshDirectory(parentPath)
  }, [applyShowHidden, refreshDirectory])

  const submitCreate = useCallback(async (draftState: Extract<ExplorerDraft, { mode: 'create' }>, name: string): Promise<string | null> => {
    try {
      const result = await window.electron.files.createEntry(rootPath, {
        parentRelativePath: draftState.parentPath,
        name,
        kind: draftState.kind,
      })
      if (result.status === 'exists') return t('files.nameExists')
      if (result.status === 'missing') return t('files.nameMissing')
      if (result.status === 'invalid') return t(FILE_NAME_ERROR_KEYS[result.reason])

      setDraft(null)
      await refreshAfterChange(draftState.parentPath, result.relativePath)
      setSelectedPath(result.relativePath)
      if (result.kind === 'file') handleOpenRelativePath(result.relativePath)
      return null
    } catch (error) {
      return errorMessage(error, t('files.nameMissing'))
    }
  }, [handleOpenRelativePath, refreshAfterChange, rootPath, t])

  const submitRename = useCallback(async (node: ExplorerNode, newName: string): Promise<string | null> => {
    if (newName === node.name) {
      setDraft(null)
      return null
    }

    try {
      const result = await window.electron.files.renameEntry(rootPath, { relativePath: node.relativePath, newName })
      if (result.status === 'exists') return t('files.nameExists')
      if (result.status === 'missing') return t('files.nameMissing')
      if (result.status === 'invalid') return t(FILE_NAME_ERROR_KEYS[result.reason])

      setDraft(null)
      onEntryRenamed?.(node.relativePath, result.relativePath)
      await refreshAfterChange(getParentRelativePath(node.relativePath), result.relativePath)
      setSelectedPath(result.relativePath)
      return null
    } catch (error) {
      return errorMessage(error, t('files.nameMissing'))
    }
  }, [onEntryRenamed, refreshAfterChange, rootPath, t])

  const renderDraftInput = useCallback((depth: number, node: ExplorerNode | null): React.ReactNode => {
    if (!draft) return null
    const cancel = () => setDraft(null)

    if (draft.mode === 'create') {
      return (
        <ExplorerInlineInput
          key={`create:${draft.parentPath}:${draft.kind}`}
          kind={draft.kind}
          depth={depth}
          ariaLabel={t('files.entryName')}
          validate={(value) => getNameError(value, draft.parentPath, true)}
          onSubmit={(value) => submitCreate(draft, value)}
          onCancel={cancel}
        />
      )
    }

    if (!node) return null
    return (
      <ExplorerInlineInput
        key={`rename:${node.relativePath}`}
        kind={node.kind}
        depth={depth}
        initialValue={node.name}
        selectBaseName={node.kind === 'file'}
        ariaLabel={t('files.entryName')}
        validate={(value) => getNameError(value, getParentRelativePath(node.relativePath), false, node.relativePath)}
        onSubmit={(value) => submitRename(node, value)}
        onCancel={cancel}
      />
    )
  }, [draft, getNameError, submitCreate, submitRename, t])

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: ExplorerNode) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedPath(node.relativePath)
    setContextMenu({ x: event.clientX, y: event.clientY, node })
  }, [])

  const handleTreeContextMenu = useCallback((event: React.MouseEvent) => {
    if (searchOpen) return
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, node: null })
  }, [searchOpen])

  const handleTreeKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (searchOpen || !selectedNode) return
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    if (event.key === 'F2') {
      event.preventDefault()
      startRename(selectedNode)
    } else if (event.key === 'Delete') {
      event.preventDefault()
      void requestTrash(selectedNode)
    }
  }, [requestTrash, searchOpen, selectedNode, startRename])

  const contextMenuItems = useMemo((): MenuItem[] => {
    if (!contextMenu) return []
    const { node } = contextMenu
    const parentPath = getCreateParentPath(node)
    const createItems: MenuItem[] = [
      { label: t('files.newFile'), icon: FilePlus, action: () => startCreate('file', parentPath) },
      { label: t('files.newFolder'), icon: FolderPlus, action: () => startCreate('directory', parentPath) },
    ]
    if (!node) return createItems

    return [
      ...createItems,
      { label: '', divider: true },
      { label: t('files.rename'), icon: Pencil, action: () => startRename(node) },
      {
        label: t('files.copyPath'),
        icon: Copy,
        action: () => { void window.electron.clipboard.writeText(joinRootPath(rootPath, node.relativePath)).catch(() => {}) },
      },
      {
        label: t('files.copyRelativePath'),
        icon: Copy,
        action: () => { void window.electron.clipboard.writeText(node.relativePath).catch(() => {}) },
      },
      {
        label: t('files.revealInExplorer'),
        icon: ExternalLink,
        action: () => { void window.electron.files.revealEntry(rootPath, node.relativePath).catch(() => {}) },
      },
      { label: '', divider: true },
      { label: t('files.moveToTrash'), icon: Trash, danger: true, action: () => { void requestTrash(node) } },
    ]
  }, [contextMenu, requestTrash, rootPath, startCreate, startRename, t])

  const treeHandlers: ExplorerTreeHandlers = {
    activeFilePath,
    selectedPath,
    draft,
    onSelect: handleSelect,
    onToggleDirectory: handleToggleDirectory,
    onOpenFile: handleOpenFile,
    onRetry: handleRetry,
    onContextMenu: handleNodeContextMenu,
    renderDraftInput,
  }
  const rootCreateDraft = draft?.mode === 'create' && draft.parentPath === ''

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
              aria-label={t('ui.searchWorkspaceFiles')}
              className="min-w-0 flex-1 bg-transparent text-sm text-text-display outline-hidden placeholder:text-text-disabled"
              onChange={(event) => handleSearchQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (getWorkspaceSearchKeyAction(event.key) !== 'close') return
                event.preventDefault()
                handleCloseSearch()
              }}
              placeholder={t('ui.searchFiles')}
              type="search"
              value={searchState.query}
            />
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-hover-bg hover:text-text-display"
              onClick={handleCloseSearch}
              title={t('ui.closeSearch')}
              aria-label={t('ui.closeSearch')}
            >
              <X size={15} />
            </button>
          </>
        ) : (
          <>
            <span className="nd-label min-w-0 flex-1 truncate">{rootName}</span>
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-hover-bg hover:text-text-display"
              onClick={() => {
                void window.electron.files.openFolder(rootPath).catch(() => {})
              }}
              title={t('files.openFolder')}
              aria-label={t('files.openFolder')}
            >
              <ExternalLink size={15} />
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-hover-bg hover:text-text-display"
              onClick={() => startCreate('file', getCreateParentPath(selectedNode))}
              title={t('files.newFile')}
              aria-label={t('files.newFile')}
            >
              <FilePlus size={15} />
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-hover-bg hover:text-text-display"
              onClick={() => startCreate('directory', getCreateParentPath(selectedNode))}
              title={t('files.newFolder')}
              aria-label={t('files.newFolder')}
            >
              <FolderPlus size={15} />
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-hover-bg hover:text-text-display"
              onClick={() => applyShowHidden(!showHidden)}
              title={showHidden ? t('files.hideHidden') : t('files.showHidden')}
              aria-label={showHidden ? t('files.hideHidden') : t('files.showHidden')}
              aria-pressed={showHidden}
            >
              {showHidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-hover-bg hover:text-text-display"
              onClick={handleOpenSearch}
              title={t('ui.searchWorkspaceFiles')}
              aria-label={t('ui.searchWorkspaceFiles')}
            >
              <Search size={15} />
            </button>
          </>
        )}
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto py-1"
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedPath(null)
        }}
        onContextMenu={handleTreeContextMenu}
        onKeyDown={handleTreeKeyDown}
      >
        {searchOpen ? (
          <>
            {searchView === 'prompt' && <div className="px-4 py-3 text-sm text-text-disabled">{t('ui.typeToSearchFiles')}</div>}
            {searchView === 'loading' && <div className="px-4 py-3 text-sm text-text-disabled">{t('ui.searching')}</div>}
            {searchView === 'error' && <div className="px-4 py-3 text-sm text-red-300">{searchState.error}</div>}
            {searchView === 'no-results' && <div className="px-4 py-3 text-sm text-text-disabled">{t('ui.noFilesFound')}</div>}
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
        ) : root.status === 'loading' ? (
          <div className="px-4 py-3 text-sm text-text-disabled">{t('common.loading')}</div>
        ) : root.status === 'error' ? (
          <div className="flex items-center gap-2 px-4 py-3 text-sm text-red-300">
            <span className="min-w-0 flex-1">{root.error ?? t('ui.unableToLoadDirectory')}</span>
            <button className="inline-flex h-7 items-center gap-1 rounded-sm px-2 hover:bg-hover-bg" onClick={() => handleRetry(root)} title={t('files.retry')}>
              <RefreshCw size={13} /> {t('files.retry')}
            </button>
          </div>
        ) : root.children?.length || rootCreateDraft ? (
          <ul>
            {rootCreateDraft && <li>{renderDraftInput(0, null)}</li>}
            {root.children?.map((child) => (
              <ExplorerTreeNode
                key={child.relativePath}
                node={child}
                depth={0}
                handlers={treeHandlers}
              />
            ))}
          </ul>
        ) : <div className="px-4 py-3 text-sm text-text-disabled">{t('ui.emptyFolder')}</div>}
      </div>
      {openError && <div className="shrink-0 border-t border-border px-3 py-2 text-xs text-red-300">{openError}</div>}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}
