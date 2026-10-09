import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Play, Square, TerminalSquare, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceConfig, WorkspaceScript, WorkspaceScriptRun, WorkspaceScriptsSnapshot } from '@shared/types'

const TerminalTileWrapper = React.lazy(() => import('./TerminalTile').then((module) => ({
  default: module.TerminalTileWrapper,
})))

interface WorkspaceRunControlProps {
  workspaceId: string
  workspaceName: string
  workspaceConfig: WorkspaceConfig
  onEditCommands: () => void
}

export interface WorkspaceScriptGroup {
  key: string
  label: string
  scripts: WorkspaceScript[]
}

type WorkspaceScriptRunStatus = 'idle' | 'running' | 'success' | 'error' | 'exited'
const ADHOC_PENDING_SCRIPT_ID = 'adhoc:pending'

const selectionStorageKey = (workspaceId: string): string => `yira:workspace-script-selection:${workspaceId}`

export function readWorkspaceScriptSelection(
  workspaceId: string,
  storage?: Pick<Storage, 'getItem'>,
): string | null {
  try {
    const targetStorage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    return targetStorage?.getItem(selectionStorageKey(workspaceId)) ?? null
  } catch {
    return null
  }
}

export function writeWorkspaceScriptSelection(
  workspaceId: string,
  scriptId: string,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    const targetStorage = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    targetStorage?.setItem(selectionStorageKey(workspaceId), scriptId)
  } catch {
    // Script selection is a convenience; storage restrictions must not break the control.
  }
}

export function groupWorkspaceScripts(
  scripts: WorkspaceScript[],
  rootLabel: string,
  customLabel: string,
): WorkspaceScriptGroup[] {
  const packageGroups = new Map<string, WorkspaceScript[]>()
  const customScripts: WorkspaceScript[] = []

  for (const script of scripts) {
    if (script.source === 'custom') {
      customScripts.push(script)
      continue
    }

    const directory = script.packageDirectory || '.'
    const group = packageGroups.get(directory) ?? []
    group.push(script)
    packageGroups.set(directory, group)
  }

  const groups = [...packageGroups.entries()].map(([directory, groupedScripts]) => ({
    key: `package:${directory}`,
    label: directory === '.' ? rootLabel : directory,
    scripts: groupedScripts,
  }))

  if (customScripts.length > 0) {
    groups.push({ key: 'custom', label: customLabel, scripts: customScripts })
  }

  return groups
}

export function getDefaultWorkspaceScriptId(
  scripts: WorkspaceScript[],
  runs: WorkspaceScriptRun[],
): string | null {
  const scriptIds = new Set(scripts.map((script) => script.id))
  const runningScript = runs.find((run) => run.state === 'running' && scriptIds.has(run.scriptId))
  return runningScript?.scriptId ?? scripts[0]?.id ?? null
}

export function getWorkspaceScriptRunStatus(run: WorkspaceScriptRun | null | undefined): WorkspaceScriptRunStatus {
  if (!run) return 'idle'
  if (run.state === 'running') return 'running'
  if (run.exitCode === 0) return 'success'
  if (run.exitCode !== undefined) return 'error'
  return 'exited'
}

export function getOrphanWorkspaceScriptRuns(
  scripts: WorkspaceScript[],
  runs: WorkspaceScriptRun[],
): WorkspaceScriptRun[] {
  const scriptIds = new Set(scripts.map((script) => script.id))
  return runs.filter((run) => (
    run.command === undefined && !scriptIds.has(run.scriptId) && run.tileId.startsWith('script-')
  ))
}

function getWorkspaceRootLabel(rootFolderPath: string | undefined, fallback: string): string {
  const parts = (rootFolderPath ?? '').split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? fallback
}

function statusDotClass(status: WorkspaceScriptRunStatus): string {
  if (status === 'running') return 'bg-success'
  if (status === 'error') return 'bg-red-400'
  if (status === 'success' || status === 'exited') return 'bg-text-disabled'
  return ''
}

function statusTextClass(status: WorkspaceScriptRunStatus): string {
  if (status === 'running') return 'text-success'
  if (status === 'error') return 'text-red-300'
  return 'text-text-disabled'
}

function getRunStatusLabel(run: WorkspaceScriptRun, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (run.state === 'running') return t('scripts.running')
  if (run.exitCode === undefined) return t('scripts.exited')
  return t('scripts.exitCode', { code: run.exitCode })
}

interface WorkspaceScriptsMenuProps {
  groups: WorkspaceScriptGroup[]
  runsByScriptId: Map<string, WorkspaceScriptRun>
  orphanRuns: WorkspaceScriptRun[]
  adhocRuns: WorkspaceScriptRun[]
  selectedScriptId: string | null
  pendingScriptId: string | null
  loading: boolean
  error: string | null
  onSelect: (scriptId: string) => void
  onRunOrStop: (script: WorkspaceScript, run: WorkspaceScriptRun | null) => void
  onStopOrphan: (run: WorkspaceScriptRun) => void
  onRunCommand: (command: string) => void
  onShowOutput: (run: WorkspaceScriptRun) => void
  onRunOrStopAdhoc: (run: WorkspaceScriptRun) => void
  onDismissAdhoc: (run: WorkspaceScriptRun) => void
  onEditCommands: () => void
}

export function WorkspaceScriptsMenu({
  groups,
  runsByScriptId,
  orphanRuns,
  adhocRuns,
  selectedScriptId,
  pendingScriptId,
  loading,
  error,
  onSelect,
  onRunOrStop,
  onStopOrphan,
  onRunCommand,
  onShowOutput,
  onRunOrStopAdhoc,
  onDismissAdhoc,
  onEditCommands,
}: WorkspaceScriptsMenuProps): React.ReactElement {
  const { t } = useTranslation()
  const hasScripts = groups.some((group) => group.scripts.length > 0)
  const isEmpty = !hasScripts && orphanRuns.length === 0
  const [commandInput, setCommandInput] = useState('')
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const commandDraft = useRef('')

  const handleCommandKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      const command = commandInput.trim()
      if (!command) return
      onRunCommand(command)
      setCommandInput('')
      setHistoryIndex(null)
      commandDraft.current = ''
      return
    }

    if (event.key === 'ArrowUp' && adhocRuns.length > 0) {
      event.preventDefault()
      if (historyIndex === null) {
        commandDraft.current = commandInput
        setHistoryIndex(0)
        setCommandInput(adhocRuns[0].command ?? '')
        return
      }
      const nextIndex = Math.min(historyIndex + 1, adhocRuns.length - 1)
      setHistoryIndex(nextIndex)
      setCommandInput(adhocRuns[nextIndex].command ?? '')
      return
    }

    if (event.key === 'ArrowDown' && historyIndex !== null) {
      event.preventDefault()
      if (historyIndex === 0) {
        setHistoryIndex(null)
        setCommandInput(commandDraft.current)
        return
      }
      const nextIndex = historyIndex - 1
      setHistoryIndex(nextIndex)
      setCommandInput(adhocRuns[nextIndex].command ?? '')
    }
  }

  return (
    <div role="menu" aria-label={t('scripts.title')} className="w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-lg border border-border-visible bg-bg-secondary p-1.5 shadow-xl">
      <div className="flex items-center gap-2 rounded-md border border-border bg-bg-primary px-2.5 py-2">
        <TerminalSquare size={13} className="shrink-0 text-text-secondary" />
        <input
          type="text"
          autoFocus
          aria-label={t('scripts.commandInputLabel')}
          placeholder={t('scripts.commandPlaceholder')}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-text-display outline-none placeholder:text-text-disabled disabled:opacity-50"
          value={commandInput}
          onChange={(event) => {
            setCommandInput(event.target.value)
            setHistoryIndex(null)
          }}
          onKeyDown={handleCommandKeyDown}
          disabled={pendingScriptId === ADHOC_PENDING_SCRIPT_ID}
        />
      </div>

      {adhocRuns.length > 0 && (
        <div role="group" aria-label={t('scripts.recentCommands')} className="mb-1 border-b border-border pb-1">
          <div className="px-2.5 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text-disabled">
            {t('scripts.recentCommands')}
          </div>
          {adhocRuns.map((run) => {
            const status = getWorkspaceScriptRunStatus(run)
            const running = run.state === 'running'
            const pending = pendingScriptId === run.scriptId
            return (
              <div
                key={run.scriptId}
                className="flex items-center gap-1 rounded-md"
                data-adhoc-script-id={run.scriptId}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-hover-bg"
                  onClick={() => onShowOutput(run)}
                  title={run.command}
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-display">
                    {run.command}
                  </span>
                  <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] ${statusTextClass(status)}`}>
                    <span className={`size-1.5 rounded-full ${statusDotClass(status)}`} />
                    <span>{getRunStatusLabel(run, t)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-primary hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onRunOrStopAdhoc(run)}
                  disabled={pending}
                  title={t(running ? 'scripts.stopScript' : 'scripts.runScript')}
                  aria-label={`${t(running ? 'scripts.stopScript' : 'scripts.runScript')} ${run.command}`}
                >
                  {running ? <Square size={12} /> : <Play size={12} />}
                </button>
                {!running && (
                  <button
                    type="button"
                    className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-primary hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => onDismissAdhoc(run)}
                    disabled={pending}
                    title={t('scripts.dismissCommand')}
                    aria-label={`${t('scripts.dismissCommand')} ${run.command}`}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {loading && <div className="px-2.5 py-3 text-xs text-text-disabled">{t('common.loading')}</div>}
      {!loading && isEmpty && (
        <div className="px-2.5 py-3">
          <p className="text-xs leading-5 text-text-secondary">{t('scripts.noPackageScripts')}</p>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.key} role="group" aria-label={group.label} className="mb-1 last:mb-0">
          <div className="px-2.5 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text-disabled">{group.label}</div>
          {group.scripts.map((script) => {
            const run = runsByScriptId.get(script.id) ?? null
            const status = getWorkspaceScriptRunStatus(run)
            const running = run?.state === 'running'
            const pending = pendingScriptId === script.id
            return (
              <div
                key={script.id}
                data-script-id={script.id}
                className={`flex items-center gap-1 rounded-md ${selectedScriptId === script.id ? 'bg-hover-bg' : ''}`}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-hover-bg"
                  onClick={() => onSelect(script.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-xs text-text-display">{script.name}</span>
                      {run && (
                        <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] ${statusTextClass(status)}`}>
                          <span className={`size-1.5 rounded-full ${statusDotClass(status)}`} />
                          <span>{getRunStatusLabel(run, t)}</span>
                        </span>
                      )}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-text-disabled" title={script.command}>{script.command}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-primary hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onRunOrStop(script, run)}
                  disabled={pending}
                  title={running ? t('scripts.stopScript') : t('scripts.runScript')}
                  aria-label={`${t(running ? 'scripts.stopScript' : 'scripts.runScript')} ${script.name}`}
                >
                  {running ? <Square size={12} /> : <Play size={12} />}
                </button>
              </div>
            )
          })}
        </div>
      ))}

      {orphanRuns.length > 0 && (
        <div role="group" aria-label={t('scripts.otherProcesses')} className="mb-1 border-t border-border pt-1">
          <div className="px-2.5 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-text-disabled">{t('scripts.otherProcesses')}</div>
          {orphanRuns.map((run) => {
            const status = getWorkspaceScriptRunStatus(run)
            const running = run.state === 'running'
            return (
              <div key={run.tileId} className="flex items-center gap-2 rounded-md px-2.5 py-1.5" data-orphan-script-id={run.scriptId}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-text-display">{run.scriptId}</span>
                  <span className={`inline-flex items-center gap-1 text-[10px] ${statusTextClass(status)}`}>
                    <span className={`size-1.5 rounded-full ${statusDotClass(status)}`} />
                    <span>{getRunStatusLabel(run, t)}</span>
                  </span>
                </span>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-primary hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onStopOrphan(run)}
                  disabled={!running || pendingScriptId === run.scriptId}
                  title={t('scripts.stopScript')}
                  aria-label={`${t('scripts.stopScript')} ${run.scriptId}`}
                >
                  <Square size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {error && <p className="mx-2.5 my-1 rounded border border-red-400/30 bg-red-950/30 px-2 py-1.5 text-[11px] text-red-200" role="alert">{error}</p>}
      <div className="mt-1 border-t border-border pt-1">
        <button
          type="button"
          role="menuitem"
          className="w-full rounded-md px-2.5 py-2 text-left text-xs text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
          onClick={onEditCommands}
        >
          {t(isEmpty ? 'scripts.addCommand' : 'scripts.editCommands')}
        </button>
      </div>
    </div>
  )
}

function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length > 120 ? `${message.slice(0, 117)}…` : message
}

function makeOutputTile(run: WorkspaceScriptRun) {
  return {
    id: run.tileId,
    type: 'terminal' as const,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    zIndex: 0,
  }
}

export function WorkspaceRunControl({
  workspaceId,
  workspaceName,
  workspaceConfig,
  onEditCommands,
}: WorkspaceRunControlProps): React.ReactElement {
  const { t } = useTranslation()
  const [scriptSnapshot, setScriptSnapshot] = useState<WorkspaceScriptsSnapshot | null>(null)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingScriptId, setPendingScriptId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [outputRunTileId, setOutputRunTileId] = useState<string | null>(null)
  const [selection, setSelection] = useState(() => ({
    workspaceId,
    scriptId: readWorkspaceScriptSelection(workspaceId),
  }))
  const containerRef = useRef<HTMLDivElement>(null)
  const receivedSnapshotUpdateRef = useRef(false)
  const adhocRunPendingRef = useRef(false)

  useEffect(() => {
    let active = true
    let subscriptionToken: string | null = null
    receivedSnapshotUpdateRef.current = false
    setScriptSnapshot(null)
    setSnapshotError(null)
    setOutputRunTileId(null)

    const removeChangedListener = window.electron.scripts.onChanged((nextSnapshot) => {
      if (!active || nextSnapshot.workspaceId !== workspaceId) return
      receivedSnapshotUpdateRef.current = true
      setScriptSnapshot(nextSnapshot)
      setSnapshotError(null)
    })

    void window.electron.scripts.subscribe(workspaceId).then((token) => {
      if (!token) return
      if (!active) {
        void window.electron.scripts.unsubscribe(token)
        return
      }
      subscriptionToken = token
    }).catch((error: unknown) => {
      if (active) setSnapshotError(getErrorMessage(error))
    })

    void window.electron.scripts.snapshot(workspaceId).then((nextSnapshot) => {
      if (!active) return
      if (!receivedSnapshotUpdateRef.current) setScriptSnapshot(nextSnapshot)
      setSnapshotError(null)
    }).catch((error: unknown) => {
      if (active) setSnapshotError(getErrorMessage(error))
    })

    return () => {
      active = false
      removeChangedListener()
      if (subscriptionToken) void window.electron.scripts.unsubscribe(subscriptionToken)
    }
  }, [workspaceId])

  const currentSnapshot = scriptSnapshot?.workspaceId === workspaceId ? scriptSnapshot : null
  const scripts = currentSnapshot?.scripts ?? []
  const runs = currentSnapshot?.runs ?? []
  const selectedScriptId = selection.workspaceId === workspaceId
    && scripts.some((script) => script.id === selection.scriptId)
    ? selection.scriptId
    : getDefaultWorkspaceScriptId(scripts, runs)
  const selectedScript = scripts.find((script) => script.id === selectedScriptId) ?? null

  useEffect(() => {
    if (!currentSnapshot) return
    const selectedId = selection.workspaceId === workspaceId
      && scripts.some((script) => script.id === selection.scriptId)
      ? selection.scriptId
      : getDefaultWorkspaceScriptId(scripts, runs)
    if (selection.workspaceId === workspaceId && selection.scriptId === selectedId) return
    setSelection({ workspaceId, scriptId: selectedId })
    if (selectedId) writeWorkspaceScriptSelection(workspaceId, selectedId)
  }, [currentSnapshot, runs, scripts, selection.scriptId, selection.workspaceId, workspaceId])

  const runsByScriptId = useMemo(() => {
    const indexed = new Map<string, WorkspaceScriptRun>()
    for (const run of runs) {
      const existing = indexed.get(run.scriptId)
      if (!existing || run.state === 'running' || Date.parse(run.startedAt) > Date.parse(existing.startedAt)) {
        indexed.set(run.scriptId, run)
      }
    }
    return indexed
  }, [runs])
  const selectedRun = selectedScript ? runsByScriptId.get(selectedScript.id) ?? null : null
  const orphanRuns = useMemo(() => getOrphanWorkspaceScriptRuns(scripts, runs), [runs, scripts])
  const adhocRuns = useMemo(() => (
    runs
      .filter((run) => run.command !== undefined)
      .map((run, index) => ({ run, index }))
      .sort((left, right) => (
        right.run.startedAt.localeCompare(left.run.startedAt) || right.index - left.index
      ))
      .map(({ run }) => run)
  ), [runs])
  const rootLabel = getWorkspaceRootLabel(workspaceConfig.rootFolderPath, t('scripts.packageJson'))
  const groups = useMemo(
    () => groupWorkspaceScripts(scripts, rootLabel, t('scripts.customCommands')),
    [rootLabel, scripts, t],
  )
  const error = actionError ?? snapshotError
  const errorTitle = error || undefined

  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen && !outputRunTileId) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setMenuOpen(false)
      setOutputRunTileId(null)
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [menuOpen, outputRunTileId])

  useEffect(() => {
    if (!outputRunTileId) return
    if (runs.some((run) => run.tileId === outputRunTileId)) return
    setOutputRunTileId(null)
  }, [outputRunTileId, runs])

  const selectScript = (scriptId: string) => {
    setSelection({ workspaceId, scriptId })
    writeWorkspaceScriptSelection(workspaceId, scriptId)
    setMenuOpen(false)
  }

  const runScript = async (scriptId: string, showOutput = false) => {
    setPendingScriptId(scriptId)
    setActionError(null)
    try {
      const nextRun = await window.electron.scripts.run({ workspaceId, scriptId })
      setScriptSnapshot((current) => {
        if (!current || current.workspaceId !== workspaceId) return current
        return {
          ...current,
          runs: [...current.runs.filter((run) => run.scriptId !== scriptId), nextRun],
        }
      })
      if (showOutput) setOutputRunTileId(nextRun.tileId)
    } catch (error) {
      setActionError(getErrorMessage(error) || t('scripts.runFailed'))
    } finally {
      setPendingScriptId((current) => current === scriptId ? null : current)
    }
  }

  const runCommand = async (command: string) => {
    if (adhocRunPendingRef.current) return
    adhocRunPendingRef.current = true
    setPendingScriptId(ADHOC_PENDING_SCRIPT_ID)
    setActionError(null)
    try {
      const nextRun = await window.electron.scripts.runCommand({ workspaceId, command })
      setScriptSnapshot((current) => {
        const base = current?.workspaceId === workspaceId
          ? current
          : { workspaceId, scripts: [], runs: [] }
        return {
          ...base,
          runs: [...base.runs.filter((run) => run.scriptId !== nextRun.scriptId), nextRun],
        }
      })
      setMenuOpen(false)
      setOutputRunTileId(nextRun.tileId)
    } catch (error) {
      setActionError(getErrorMessage(error) || t('scripts.runFailed'))
    } finally {
      adhocRunPendingRef.current = false
      setPendingScriptId((current) => current === ADHOC_PENDING_SCRIPT_ID ? null : current)
    }
  }

  const stopScript = async (scriptId: string, run?: WorkspaceScriptRun | null) => {
    if (run && outputRunTileId === run.tileId) setOutputRunTileId(null)
    setPendingScriptId(scriptId)
    setActionError(null)
    try {
      await window.electron.scripts.stop({ workspaceId, scriptId })
    } catch (error) {
      setActionError(getErrorMessage(error) || t('scripts.stopFailed'))
    } finally {
      setPendingScriptId((current) => current === scriptId ? null : current)
    }
  }

  const runOrStopScript = (script: WorkspaceScript, run: WorkspaceScriptRun | null) => {
    if (run?.state === 'running') void stopScript(script.id, run)
    else void runScript(script.id)
  }

  const runOrStopAdhoc = (run: WorkspaceScriptRun) => {
    if (run.state === 'running') void stopScript(run.scriptId, run)
    else void runScript(run.scriptId)
  }

  const handleEditCommands = () => {
    setMenuOpen(false)
    onEditCommands()
  }

  const outputRun = runs.find((run) => run.tileId === outputRunTileId) ?? null
  const outputScript = outputRun ? scripts.find((script) => script.id === outputRun.scriptId) ?? null : null
  const outputIsAdhoc = outputRun?.command !== undefined

  return (
    <div ref={containerRef} className="relative inline-flex h-7 items-center gap-0.5" data-testid="workspace-run-control">
      <button
        type="button"
        className="inline-flex h-7 max-w-[180px] items-center gap-1.5 rounded-md px-2 text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
        onClick={() => setMenuOpen((open) => !open)}
        title={errorTitle ?? selectedScript?.command ?? t('scripts.title')}
        aria-label={`${t('scripts.title')}: ${workspaceName}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        {selectedRun && <span className={`size-1.5 shrink-0 rounded-full ${statusDotClass(getWorkspaceScriptRunStatus(selectedRun))}`} />}
        <span className="truncate text-xs">{selectedScript?.name ?? t('scripts.title')}</span>
        <ChevronDown size={12} className="shrink-0" />
      </button>
      <button
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => {
          if (!selectedScript) return
          runOrStopScript(selectedScript, selectedRun)
        }}
        disabled={!selectedScript || pendingScriptId === selectedScript.id}
        title={errorTitle ?? t(selectedRun?.state === 'running' ? 'scripts.stopScript' : 'scripts.runScript')}
        aria-label={t(selectedRun?.state === 'running' ? 'scripts.stopScript' : 'scripts.runScript')}
      >
        {selectedRun?.state === 'running' ? <Square size={14} /> : <Play size={14} />}
      </button>
      {selectedRun && (
        <button
          type="button"
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-hover-bg ${outputRunTileId === selectedRun.tileId ? 'text-text-display' : 'text-text-secondary hover:text-text-display'}`}
          onClick={() => setOutputRunTileId((current) => current === selectedRun.tileId ? null : selectedRun.tileId)}
          title={t(outputRunTileId === selectedRun.tileId ? 'scripts.hideOutput' : 'scripts.showOutput')}
          aria-label={t(outputRunTileId === selectedRun.tileId ? 'scripts.hideOutput' : 'scripts.showOutput')}
          aria-pressed={outputRunTileId === selectedRun.tileId}
        >
          <TerminalSquare size={14} />
        </button>
      )}

      {menuOpen && (
        <div className="absolute right-0 top-full z-[70] mt-1">
          <WorkspaceScriptsMenu
            groups={groups}
            runsByScriptId={runsByScriptId}
            orphanRuns={orphanRuns}
            adhocRuns={adhocRuns}
            selectedScriptId={selectedScriptId}
            pendingScriptId={pendingScriptId}
            loading={!currentSnapshot && !snapshotError}
            error={error}
            onSelect={selectScript}
            onRunOrStop={runOrStopScript}
            onStopOrphan={(run) => void stopScript(run.scriptId, run)}
            onRunCommand={(command) => void runCommand(command)}
            onShowOutput={(run) => {
              setOutputRunTileId(run.tileId)
              setMenuOpen(false)
            }}
            onRunOrStopAdhoc={runOrStopAdhoc}
            onDismissAdhoc={(run) => void stopScript(run.scriptId, run)}
            onEditCommands={handleEditCommands}
          />
        </div>
      )}

      {outputRun && (
        <section
          data-testid="workspace-script-output"
          className="absolute right-0 top-full z-[60] mt-1 flex h-[40vh] w-[min(900px,70vw)] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-lg border border-border-visible bg-bg-secondary shadow-2xl"
          aria-label={t('scripts.output')}
        >
          <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2.5">
            <TerminalSquare size={13} className="shrink-0 text-text-secondary" />
            <span className="min-w-0 flex-1 truncate text-xs text-text-display">
              {outputRun.command ?? outputScript?.name ?? outputRun.scriptId}
            </span>
            <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] ${statusTextClass(getWorkspaceScriptRunStatus(outputRun))}`}>
              <span className={`size-1.5 rounded-full ${statusDotClass(getWorkspaceScriptRunStatus(outputRun))}`} />
              <span>{getRunStatusLabel(outputRun, t)}</span>
            </span>
            <button
              type="button"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                if (outputRun.state === 'running') void stopScript(outputRun.scriptId, outputRun)
                else if (outputScript || outputIsAdhoc) void runScript(outputRun.scriptId, true)
              }}
              disabled={pendingScriptId === outputRun.scriptId
                || (!outputScript && !outputIsAdhoc && outputRun.state !== 'running')}
              title={t(outputRun.state === 'running' ? 'scripts.stopScript' : 'scripts.restart')}
              aria-label={t(outputRun.state === 'running' ? 'scripts.stopScript' : 'scripts.restart')}
            >
              {outputRun.state === 'running' ? <Square size={12} /> : <Play size={12} />}
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
              onClick={() => setOutputRunTileId(null)}
              title={t('scripts.closeOutput')}
              aria-label={t('scripts.closeOutput')}
            >
              <X size={13} />
            </button>
          </header>
          <div className="min-h-0 flex-1 bg-bg-primary">
            <React.Suspense fallback={<div className="p-2 text-xs text-text-disabled">{t('common.loading')}</div>}>
              <TerminalTileWrapper
                tile={makeOutputTile(outputRun)}
                workspaceId={workspaceId}
                workspaceConfig={workspaceConfig}
                isFocused={false}
                isVisible
                edgeToEdge
                connectOnly
                onFocus={() => undefined}
                onUpdate={() => undefined}
                onDelete={() => undefined}
              />
            </React.Suspense>
          </div>
          {outputRun.state === 'exited' && (
            <div className="shrink-0 border-t border-border px-2.5 py-1 text-[10px] text-text-secondary">
              {outputRun.exitCode === undefined
                ? t('scripts.exited')
                : t('scripts.exitCode', { code: outputRun.exitCode })}
            </div>
          )}
          {snapshotError && <div className="shrink-0 border-t border-border px-2.5 py-1 text-[10px] text-red-200">{t('scripts.outputUnavailable')}</div>}
        </section>
      )}
    </div>
  )
}
