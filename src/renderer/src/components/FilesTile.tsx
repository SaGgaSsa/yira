import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronRight,
  Copy,
  ExternalLink,
  File,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import type { FileEntry, FileListResult, TileState } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { useTranslation } from 'react-i18next'

interface FilesTileProps {
  tile: TileState
  autoFocus?: boolean
}

interface LocationState {
  rootPath: string
  relativeDir: string
}

interface EntryMenuState {
  x: number
  y: number
  entry: FileEntry
}

type Notice =
  | { kind: 'info'; text: string }
  | { kind: 'error'; technicalMessage?: string }

function formatSize(entry: FileEntry, locale: string, folderLabel: string): string {
  if (entry.kind === 'directory') return folderLabel
  if (entry.size === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = entry.size
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: size >= 10 || unitIndex === 0 ? 0 : 1 }).format(size)} ${units[unitIndex]}`
}

export function formatModifiedAt(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function technicalErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

function buildBreadcrumbs(
  result: FileListResult | null,
  fallbackRootLabel: string,
  fallbackDir: string,
): Array<{ label: string; path: string }> {
  const rootLabel = result?.rootLabel || fallbackRootLabel
  const currentDir = result?.currentDir ?? fallbackDir
  const items = [{ label: rootLabel, path: '' }]

  if (!currentDir) return items

  const segments = currentDir.split('/').filter(Boolean)
  let path = ''
  for (const segment of segments) {
    path = path ? `${path}/${segment}` : segment
    items.push({ label: segment, path })
  }

  return items
}

function folderLabelFromPath(rootPath: string): string {
  const normalized = rootPath.replace(/[\\/]+$/, '')
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? normalized
}

function InactiveFilesState({
  title,
  message,
}: {
  title: string
  message: string
}): React.ReactElement {
  return (
    <div className="flex h-full w-full items-center justify-center bg-bg-primary px-6 text-center">
      <div className="max-w-[320px] text-sm text-text-secondary">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-border-visible bg-bg-tertiary">
          <Folder size={20} />
        </div>
        <div className="nd-label text-text-display">{title}</div>
        <div className="mt-2 text-text-disabled">{message}</div>
      </div>
    </div>
  )
}

export function FilesTile({ tile, autoFocus = false }: FilesTileProps): React.ReactElement {
  const { t, i18n } = useTranslation()
  const rootPath = useCanvasStore((s) => s.activeWorkspaceConfig.rootFolderPath?.trim() ?? '')
  const rootLabel = useMemo(
    () => folderLabelFromPath(rootPath) || t('tile.files'),
    [rootPath, t],
  )
  const [location, setLocation] = useState<LocationState>({ rootPath: '', relativeDir: '' })
  const [result, setResult] = useState<FileListResult | null>(null)
  const [query, setQuery] = useState('')
  const [showIgnored, setShowIgnored] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [entryMenu, setEntryMenu] = useState<EntryMenuState | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) searchInputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    setLocation({ rootPath, relativeDir: '' })
    setResult(null)
    setQuery('')
    setShowIgnored(false)
    setLoadError(null)
    setNotice(null)
    setEntryMenu(null)
  }, [rootPath])

  useEffect(() => {
    if (!notice || notice.kind !== 'info') return
    const timeout = window.setTimeout(() => setNotice(null), 2200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    if (!location.rootPath || location.rootPath !== rootPath) return

    let cancelled = false
    setLoading(true)
    setLoadError(null)

    window.electron.files
      .list(location.rootPath, location.relativeDir, { showIgnored })
      .then((nextResult) => {
        if (cancelled) return
        setResult(nextResult)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setResult(null)
        setLoadError(technicalErrorMessage(error) ?? t('files.fileOperationFailed'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [location.rootPath, location.relativeDir, refreshVersion, rootPath, showIgnored, t])

  const navigateTo = useCallback((relativeDir: string) => {
    if (!rootPath) return
    setEntryMenu(null)
    setNotice(null)
    setQuery('')
    setLoadError(null)
    setResult(null)
    setLocation({ rootPath, relativeDir })
  }, [rootPath])

  const refresh = useCallback(() => {
    setNotice(null)
    setRefreshVersion((value) => value + 1)
  }, [])

  const openEntry = useCallback(async (entry: FileEntry) => {
    setEntryMenu(null)
    setNotice(null)

    if (entry.kind === 'directory') {
      navigateTo(entry.relativePath)
      return
    }

    try {
      await window.electron.files.open(location.rootPath, entry.relativePath)
    } catch (error) {
      setNotice({ kind: 'error', technicalMessage: technicalErrorMessage(error) })
    }
  }, [location.rootPath, navigateTo])

  const revealEntry = useCallback(async (entry: FileEntry) => {
    setEntryMenu(null)
    setNotice(null)

    try {
      await window.electron.files.reveal(location.rootPath, entry.relativePath)
    } catch (error) {
      setNotice({ kind: 'error', technicalMessage: technicalErrorMessage(error) })
    }
  }, [location.rootPath])

  const copyEntryPath = useCallback(async (entry: FileEntry) => {
    setEntryMenu(null)

    try {
      await window.electron.clipboard.writeText(entry.relativePath)
      setNotice({ kind: 'info', text: t('files.copiedRelativePath', { path: entry.relativePath }) })
    } catch (error) {
      setNotice({ kind: 'error', technicalMessage: technicalErrorMessage(error) })
    }
  }, [t])

  const copyCurrentPath = useCallback(async () => {
    const currentAbsolutePath = result?.currentPath ?? location.rootPath
    if (!currentAbsolutePath) return

    try {
      await window.electron.clipboard.writeText(currentAbsolutePath)
      setNotice({ kind: 'info', text: t('files.copiedCurrentPath') })
    } catch (error) {
      setNotice({ kind: 'error', technicalMessage: technicalErrorMessage(error) })
    }
  }, [location.rootPath, result?.currentPath, t])

  const filteredEntries = useMemo(() => {
    if (!result) return []
    const needle = query.trim().toLowerCase()
    if (!needle) return result.entries

    return result.entries.filter((entry) => (
      entry.name.toLowerCase().includes(needle) ||
      entry.relativePath.toLowerCase().includes(needle)
    ))
  }, [query, result])

  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(result, rootLabel, location.relativeDir),
    [location.relativeDir, result, rootLabel],
  )

  const menuItems = useMemo<MenuItem[]>(() => {
    if (!entryMenu) return []

    return [
      {
        label: entryMenu.entry.kind === 'directory' ? t('files.openFolder') : t('common.open'),
        icon: entryMenu.entry.kind === 'directory' ? FolderOpen : ExternalLink,
        action: () => { void openEntry(entryMenu.entry) },
      },
      {
        label: t('files.revealInExplorer'),
        icon: FolderOpen,
        action: () => { void revealEntry(entryMenu.entry) },
      },
      {
        label: t('files.copyRelativePath'),
        icon: Copy,
        action: () => { void copyEntryPath(entryMenu.entry) },
      },
    ]
  }, [copyEntryPath, entryMenu, openEntry, revealEntry, t])

  if (!rootPath) {
    return (
      <InactiveFilesState
        title={t('files.noWorkspaceFolder')}
        message={t('files.noWorkspaceFolderMessage')}
      />
    )
  }

  const visibleCount = filteredEntries.length
  const totalCount = result?.entries.length ?? 0
  const currentDir = result?.currentDir ?? location.relativeDir
  const currentPathLabel = currentDir ? `/${currentDir}` : '/'
  const currentAbsolutePath = result?.currentPath ?? location.rootPath

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-bg-secondary">
      <div className="shrink-0 border-b border-border bg-bg-secondary">
        <div className="flex min-h-[52px] items-center gap-2 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.path || 'root'}>
                {index > 0 && <ChevronRight size={13} className="shrink-0 text-text-muted" />}
                <button
                  className={`max-w-[180px] truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-hover-bg ${
                    index === breadcrumbs.length - 1 ? 'text-text-display' : 'text-text-secondary'
                  }`}
                  onClick={() => navigateTo(crumb.path)}
                  title={crumb.path || rootPath}
                >
                  {crumb.label}
                </button>
              </React.Fragment>
            ))}
          </div>

          <button
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display disabled:opacity-50"
            onClick={refresh}
            disabled={loading}
            title={t('common.refresh')}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-3 pb-3">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border-visible bg-bg-primary px-3">
            <Search size={14} className="shrink-0 text-text-secondary" />
            <input
              ref={searchInputRef}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-text-primary outline-none placeholder:text-text-disabled"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('files.filterFolder')}
              spellCheck={false}
            />
            {query && (
              <button
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                onClick={() => setQuery('')}
                title={t('files.clearFilter')}
                type="button"
              >
                <X size={13} />
              </button>
            )}
          </label>

          <label className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-border-visible px-3 text-xs text-text-secondary">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[var(--accent)]"
              checked={showIgnored}
              onChange={(event) => setShowIgnored(event.target.checked)}
            />
            <span className="nd-caption">{t('files.ignored')}</span>
          </label>
        </div>

        <div className="border-t border-border px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-text-secondary">
            <span className="shrink-0 text-text-disabled">{t('files.path')}</span>
            <span className="min-w-0 flex-1 truncate" title={currentAbsolutePath}>
              {currentAbsolutePath}
            </span>
            <button
              className="shrink-0 rounded-full border border-border-visible px-2 py-1 text-[10px] text-text-secondary transition-colors hover:text-text-display"
              onClick={() => { void copyCurrentPath() }}
            >
              {t('files.copyCurrentPath')}
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[minmax(160px,1fr)_90px_100px_118px] border-b border-border px-4 py-2 text-text-secondary">
            <div className="nd-label">{t('files.name')}</div>
            <div className="nd-label">{t('files.type')}</div>
            <div className="nd-label">{t('files.size')}</div>
            <div className="nd-label text-right">{t('files.actions')}</div>
          </div>

          {loading && !result && (
            <div className="flex h-44 items-center justify-center gap-3 text-sm text-text-secondary">
              <Loader2 size={16} className="animate-spin" />
              <span>{t('files.loadingFiles')}</span>
            </div>
          )}

          {loadError && (
            <div className="flex h-44 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-text-secondary">
              <AlertTriangle size={20} className="text-danger" />
              <div className="max-w-[360px] text-text-primary">{loadError}</div>
              <div className="max-w-[520px] truncate font-mono text-[11px] text-text-disabled" title={rootPath}>
                {rootPath}
              </div>
              <button
                className="rounded-full border border-border-visible px-4 py-2 text-xs text-text-secondary transition-colors hover:text-text-display"
                onClick={refresh}
              >
                {t('files.retry')}
              </button>
            </div>
          )}

          {!loading && !loadError && result && totalCount === 0 && (
            <div className="flex h-44 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-text-disabled">
              <div>{t('files.emptyFolder')}</div>
              <div className="max-w-[520px] truncate font-mono text-[11px]" title={result.currentPath}>
                {result.currentPath}
              </div>
            </div>
          )}

          {!loading && !loadError && result && totalCount > 0 && visibleCount === 0 && (
            <div className="flex h-44 items-center justify-center text-sm text-text-disabled">
              {t('files.noMatches')}
            </div>
          )}

          {!loadError && filteredEntries.map((entry) => {
            const Icon = entry.kind === 'directory' ? Folder : File
            const isDirectory = entry.kind === 'directory'

            return (
              <div
                key={entry.relativePath}
                className="grid min-h-[48px] cursor-pointer grid-cols-[minmax(160px,1fr)_90px_100px_118px] items-center border-b border-border px-4 text-sm transition-colors hover:bg-hover-bg"
                role="button"
                tabIndex={0}
                onClick={() => { void openEntry(entry) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void openEntry(entry)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setEntryMenu({ x: event.clientX, y: event.clientY, entry })
                }}
              >
                <div className="flex min-w-0 items-center gap-3 pr-4">
                  <Icon
                    size={16}
                    className="shrink-0"
                    style={{ color: isDirectory ? 'var(--interactive)' : 'var(--text-secondary)' }}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-text-primary">{entry.name}</div>
                    <div className="truncate font-mono text-[11px] text-text-disabled">
                      {formatModifiedAt(entry.modifiedAt, i18n.language)}
                    </div>
                  </div>
                </div>
                <div className="nd-caption text-text-secondary">{isDirectory ? t('files.directory') : t('files.file')}</div>
                <div className="truncate font-mono text-xs text-text-secondary">{formatSize(entry, i18n.language, t('files.folder'))}</div>
                <div className="flex justify-end gap-1">
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                    onClick={(event) => {
                      event.stopPropagation()
                      void openEntry(entry)
                    }}
                    title={isDirectory ? t('files.openFolder') : t('common.open')}
                  >
                    {isDirectory ? <FolderOpen size={14} /> : <ExternalLink size={14} />}
                  </button>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                    onClick={(event) => {
                      event.stopPropagation()
                      void revealEntry(entry)
                    }}
                    title={t('files.revealInExplorer')}
                  >
                    <FolderOpen size={14} />
                  </button>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                    onClick={(event) => {
                      event.stopPropagation()
                      void copyEntryPath(entry)
                    }}
                    title={t('files.copyRelativePath')}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-border px-3 font-mono text-[11px] text-text-secondary">
        <div className={`min-w-0 truncate ${notice?.kind === 'error' ? 'text-danger' : ''}`}>
          {notice
            ? notice.kind === 'info'
              ? notice.text
              : notice.technicalMessage ?? t('files.fileOperationFailed')
            : t('files.itemCount', { count: totalCount, visible: visibleCount, total: totalCount })}
        </div>
        <div className="max-w-[45%] truncate text-text-disabled">{currentPathLabel}</div>
      </div>

      {entryMenu && (
        <ContextMenu
          x={entryMenu.x}
          y={entryMenu.y}
          items={menuItems}
          onClose={() => setEntryMenu(null)}
        />
      )}
    </div>
  )
}
