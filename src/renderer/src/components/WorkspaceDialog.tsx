import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, FolderOpen, GitBranch, Grid3X3, History, Info, LayoutGrid, TerminalSquare, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AgentProvider, AgentProvidersConfig, GitRepository, RemoteTerminalConfig, WakeOnLanConfig, WorkspaceType } from '@shared/types'
import { normalizeAgentProvidersConfig, normalizeWorkspaceAgentProvider } from '@shared/workspaceConfig'

export interface WorkspaceDialogValue {
  type: WorkspaceType
  name: string
  rootFolderPath: string
  initialCommand: string
  terminalHistoryEnabled: boolean
  remoteTerminal: RemoteTerminalConfig
  agentProvider?: AgentProvider
  agentProviders: AgentProvidersConfig
  sourceControlRepositoryPaths: string[]
}

export interface WorkspaceDialogRequest {
  title: string
  eyebrow?: string
  confirmLabel?: string
  cancelLabel?: string
  canCancel?: boolean
  typeEditable?: boolean
  workspaceId?: string
  initialTab?: WorkspaceDialogTabId
  value: WorkspaceDialogValue
}

interface WorkspaceDialogProps {
  request: WorkspaceDialogRequest | null
  onCancel: () => void
  onConfirm: (value: WorkspaceDialogValue) => void
}

const WAKE_ON_LAN_MAC_PATTERN = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i
const WAKE_ON_LAN_MAC_HYPHEN_PATTERN = /^(?:[0-9a-f]{2}-){5}[0-9a-f]{2}$/i

function isLiteralIpv4(value: string): boolean {
  const octets = value.split('.')
  return octets.length === 4 && octets.every((octet) => {
    if (!/^(0|[1-9]\d{0,2})$/.test(octet)) return false
    const number = Number(octet)
    return number >= 0 && number <= 255
  })
}

function isWakeOnLanMacValid(macAddress: string): boolean {
  const value = typeof macAddress === 'string' ? macAddress.trim() : ''
  return WAKE_ON_LAN_MAC_PATTERN.test(value) || WAKE_ON_LAN_MAC_HYPHEN_PATTERN.test(value)
}

function isWakeOnLanBroadcastValid(broadcastAddress: string | undefined): boolean {
  const value = typeof broadcastAddress === 'string' ? broadcastAddress.trim() : ''
  return !value || isLiteralIpv4(value)
}

function isWakeOnLanPortValid(port: number | undefined): boolean {
  return port === undefined || Number.isInteger(port) && port >= 1 && port <= 65535
}

export function isWakeOnLanConfigValid(value: WakeOnLanConfig | undefined): boolean {
  if (!value || !value.enabled) return true
  return isWakeOnLanMacValid(value.macAddress)
    && isWakeOnLanBroadcastValid(value.broadcastAddress)
    && isWakeOnLanPortValid(value.port)
}

function normalizeWakeOnLanValue(value: WakeOnLanConfig | undefined): WakeOnLanConfig | undefined {
  if (!value) return undefined
  return {
    ...value,
    macAddress: typeof value.macAddress === 'string' ? value.macAddress.trim() : '',
    ...(value.broadcastAddress === undefined
      ? {}
      : { broadcastAddress: typeof value.broadcastAddress === 'string' ? value.broadcastAddress.trim() : '' }),
    ...(value.port === undefined ? {} : { port: value.port }),
  }
}

export function normalizeValue(value: WorkspaceDialogValue): WorkspaceDialogValue {
  const wakeOnLan = normalizeWakeOnLanValue(value.remoteTerminal.wakeOnLan)

  return {
    type: value.type === 'grid' ? 'grid' : 'canvas',
    name: value.name.trim(),
    rootFolderPath: value.rootFolderPath.trim(),
    initialCommand: value.initialCommand.trim(),
    terminalHistoryEnabled: value.terminalHistoryEnabled,
    remoteTerminal: {
      host: value.remoteTerminal.host.trim(),
      user: value.remoteTerminal.user.trim(),
      ...(value.remoteTerminal.port === undefined ? {} : { port: value.remoteTerminal.port }),
      ...(wakeOnLan ? { wakeOnLan } : {}),
    },
    agentProvider: normalizeWorkspaceAgentProvider(value.agentProvider),
    agentProviders: normalizeAgentProvidersConfig(value.agentProviders),
    sourceControlRepositoryPaths: [...new Set(value.sourceControlRepositoryPaths.map((path) => path.trim()).filter(Boolean))],
  }
}

type WorkspaceDialogTabId = 'general' | 'terminal' | 'agents' | 'sourceControl'

export function WorkspaceDialog({ request, onCancel, onConfirm }: WorkspaceDialogProps): React.ReactElement | null {
  const { t } = useTranslation()
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState<WorkspaceDialogValue | null>(request?.value ?? null)
  const [showRemoteHelp, setShowRemoteHelp] = useState(false)
  const [folderOpenFailed, setFolderOpenFailed] = useState(false)
  const [activeTab, setActiveTab] = useState<WorkspaceDialogTabId>('general')
  const [repositories, setRepositories] = useState<GitRepository[]>([])
  const [repositoriesLoading, setRepositoriesLoading] = useState(false)

  useEffect(() => {
    setValue(request?.value ?? null)
    setShowRemoteHelp(false)
    setFolderOpenFailed(false)
    setActiveTab(request?.initialTab ?? 'general')
    setRepositories([])
    setRepositoriesLoading(false)

    if (!request) return

    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    })
  }, [request])

  useEffect(() => {
    if (!request || !value) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && request.canCancel !== false) {
        event.preventDefault()
        onCancel()
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        const target = event.target as HTMLElement | null
        if (target?.tagName === 'TEXTAREA') return
        if (target?.getAttribute('role') === 'tab') return
        if (!value.name.trim() || !isWakeOnLanConfigValid(value.remoteTerminal.wakeOnLan)) return
        event.preventDefault()
        onConfirm(normalizeValue(value))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, onConfirm, request, value])

  useEffect(() => {
    if (!request || !value || activeTab !== 'sourceControl') return

    const rootFolderPath = value.rootFolderPath.trim()
    if (!rootFolderPath) {
      setRepositories([])
      setRepositoriesLoading(false)
      return
    }

    let cancelled = false
    setRepositories([])
    setRepositoriesLoading(true)

    void window.electron.git.discoverRepositoriesAtRoot(rootFolderPath).then((discovered) => {
      if (cancelled) return
      setRepositories(discovered)
    }).catch(() => {
      if (cancelled) return
      setRepositories([])
    }).finally(() => {
      if (!cancelled) setRepositoriesLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [activeTab, value?.rootFolderPath])

  if (!request || !value) return null

  const canCancel = request.canCancel !== false
  const wakeOnLan = value.remoteTerminal.wakeOnLan
  const wakeOnLanEnabled = wakeOnLan?.enabled === true
  const wakeOnLanMacValid = !wakeOnLanEnabled || isWakeOnLanMacValid(wakeOnLan?.macAddress ?? '')
  const wakeOnLanBroadcastValid = !wakeOnLanEnabled || isWakeOnLanBroadcastValid(wakeOnLan?.broadcastAddress)
  const wakeOnLanPortValid = !wakeOnLanEnabled || isWakeOnLanPortValid(wakeOnLan?.port)
  const canSubmit = Boolean(value.name.trim()) && isWakeOnLanConfigValid(wakeOnLan)
  const typeEditable = request.typeEditable === true
  const providerOptions: Array<{ provider: AgentProvider | undefined; label: string }> = [
    { provider: undefined, label: t('workspace.noAgentProvider') },
    { provider: 'claude', label: t('workspace.claude') },
    { provider: 'codex', label: t('workspace.codex') },
  ]
  const selectedProvider = value.agentProvider

  const tabs: Array<{ id: WorkspaceDialogTabId; label: string }> = [
    { id: 'general', label: t('workspace.general') },
    { id: 'terminal', label: t('workspace.terminal') },
    { id: 'agents', label: t('workspace.agents') },
    { id: 'sourceControl', label: t('workspace.sourceControl') },
  ]

  const updateProviderArgs = (provider: AgentProvider, args: string[]) => {
    setValue((current) => current ? {
      ...current,
      agentProviders: {
        ...current.agentProviders,
        [provider]: {
          ...current.agentProviders[provider],
          args,
        },
      },
    } : current)
  }

  const updateRootFolderPath = (rootFolderPath: string) => {
    setFolderOpenFailed(false)
    setValue((current) => {
      if (!current) return current
      const rootChanged = current.rootFolderPath.trim() !== rootFolderPath.trim()
      return {
        ...current,
        rootFolderPath,
        ...(rootChanged ? { sourceControlRepositoryPaths: [] } : {}),
      }
    })
  }

  const toggleRepository = (repositoryPath: string, checked: boolean) => {
    setValue((current) => {
      if (!current) return current
      const selected = new Set(current.sourceControlRepositoryPaths)
      if (checked) selected.add(repositoryPath)
      else selected.delete(repositoryPath)
      return {
        ...current,
        sourceControlRepositoryPaths: [...selected],
      }
    })
  }

  const updateWakeOnLan = (patch: Partial<WakeOnLanConfig>) => {
    setValue((current) => {
      if (!current) return current
      const currentWakeOnLan = current.remoteTerminal.wakeOnLan ?? { enabled: true, macAddress: '' }
      return {
        ...current,
        remoteTerminal: {
          ...current.remoteTerminal,
          wakeOnLan: { ...currentWakeOnLan, ...patch },
        },
      }
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/80">
      <div className="flex max-h-[calc(100vh-32px)] w-[640px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[24px] border border-border-visible bg-bg-secondary shadow-2xl">
        <header className="shrink-0 flex items-center justify-between gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <div className="nd-label text-text-secondary">{request.eyebrow ?? t('workspace.workspaceSettings')}</div>
            <h2 className="mt-2 text-xl text-text-display">{request.title}</h2>
          </div>
          {canCancel && (
            <button
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display"
              onClick={onCancel}
              title={t('dialogs.closeDialog')}
            >
              <X size={16} />
            </button>
          )}
        </header>

        <div data-testid="workspace-dialog-form" className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mb-6 flex gap-2 overflow-x-auto border-b border-border" role="tablist" aria-label={t('workspace.workspaceSettings')}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`workspace-dialog-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`workspace-dialog-panel-${tab.id}`}
                className={`shrink-0 border-b-2 px-3 py-3 text-sm transition-colors ${
                  activeTab === tab.id ? 'border-text-display text-text-display' : 'border-transparent text-text-secondary hover:text-text-display'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            id={`workspace-dialog-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`workspace-dialog-tab-${activeTab}`}
            tabIndex={0}
          >
          {activeTab === 'general' && (
            <div className="space-y-6">
              <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
                <div className="mb-4 flex items-center gap-2">
                  {value.type === 'grid' ? <Grid3X3 size={14} className="text-text-secondary" /> : <LayoutGrid size={14} className="text-text-secondary" />}
                  <span className="nd-label text-text-secondary">{t('workspace.workspaceType')}</span>
                </div>
                {typeEditable ? (
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { type: 'canvas' as const, label: t('workspace.canvas'), icon: LayoutGrid },
                      { type: 'grid' as const, label: t('workspace.grid'), icon: Grid3X3 },
                    ]).map((option) => {
                      const Icon = option.icon
                      const active = value.type === option.type
                      return (
                        <button
                          key={option.type}
                          type="button"
                          className={`flex items-center gap-3 rounded-[18px] border px-4 py-4 text-left transition-colors ${
                            active ? 'border-text-display bg-bg-primary text-text-display' : 'border-border-visible text-text-secondary hover:bg-hover-bg hover:text-text-display'
                          }`}
                          onClick={() => setValue((current) => current ? { ...current, type: option.type } : current)}
                        >
                          <Icon size={16} />
                          <span className="nd-label">{option.label}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-full border border-border-visible bg-bg-primary px-4 py-3 text-sm text-text-display">
                    {value.type === 'grid' ? t('workspace.grid') : t('workspace.canvas')}
                  </div>
                )}
              </section>

              <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
                <label className="block">
                  <span className="nd-label mb-2 block text-text-secondary">{t('workspace.workspaceName')}</span>
                  <input
                    ref={nameInputRef}
                    className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
                    value={value.name}
                    onChange={(event) => setValue((current) => current ? { ...current, name: event.target.value } : current)}
                    placeholder={t('workspace.workspaceName')}
                    spellCheck={false}
                  />
                </label>
              </section>

              <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
                <div className="mb-4 flex items-center gap-2">
                  <FolderOpen size={14} className="text-text-secondary" />
                  <span className="nd-label text-text-secondary">{t('workspace.rootFolder')}</span>
                  <button
                    type="button"
                    className="ml-auto shrink-0 rounded-full p-2 text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50"
                    title={t('files.openFolder')}
                    aria-label={t('files.openFolder')}
                    disabled={!value.rootFolderPath.trim()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.stopPropagation()
                    }}
                    onClick={() => {
                      setFolderOpenFailed(false)
                      void window.electron.files.openFolder(value.rootFolderPath).catch(() => {
                        setFolderOpenFailed(true)
                      })
                    }}
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="min-w-0 flex-1 truncate rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display"
                    title={value.rootFolderPath || t('workspace.noFolderSelected')}
                  >
                    {value.rootFolderPath || t('workspace.noFolderSelected')}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-border-visible px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                    onClick={() => {
                      void window.electron.files.selectFolder(value.rootFolderPath || undefined).then((folder) => {
                        if (!folder) return
                        updateRootFolderPath(folder.path)
                      })
                    }}
                  >
                    {t('workspace.selectFolder')}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-border-visible px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => updateRootFolderPath('')}
                    disabled={!value.rootFolderPath}
                  >
                    {t('workspace.clearFolder')}
                  </button>
                </div>
                {folderOpenFailed && (
                  <p role="alert" className="mt-2 text-xs text-red-300">{t('files.fileOperationFailed')}</p>
                )}
              </section>
            </div>
          )}

          {activeTab === 'terminal' && (
            <div className="space-y-6">
              <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
                <div className="mb-4 flex items-center gap-2">
                  <TerminalSquare size={14} className="text-text-secondary" />
                  <span className="nd-label text-text-secondary">{t('workspace.initialCommand')}</span>
                </div>
                <input
                  className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
                  value={value.initialCommand}
                  onChange={(event) => setValue((current) => current ? { ...current, initialCommand: event.target.value } : current)}
                  placeholder={t('workspace.optionalCommand')}
                  spellCheck={false}
                />
              </section>

              <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
                <div className="mb-4 flex items-center gap-2">
                  <TerminalSquare size={14} className="text-text-secondary" />
                  <span className="nd-label text-text-secondary">{t('workspace.remoteTerminal')}</span>
                  <button
                    className="ml-auto flex h-7 w-7 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                    onClick={() => setShowRemoteHelp(true)}
                    title={t('workspace.remoteTerminalRequirements')}
                    type="button"
                  >
                    <Info size={14} />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="nd-label mb-2 block text-text-secondary">{t('workspace.hostTailscaleOrLocal')}</span>
                    <input
                      className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
                      value={value.remoteTerminal.host}
                      onChange={(event) => setValue((current) => current ? {
                        ...current,
                        remoteTerminal: { ...current.remoteTerminal, host: event.target.value },
                      } : current)}
                      placeholder="notebook.tailnet.ts.net"
                      spellCheck={false}
                    />
                  </label>
                  <label className="block">
                    <span className="nd-label mb-2 block text-text-secondary">{t('workspace.linuxUser')}</span>
                    <input
                      className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
                      value={value.remoteTerminal.user}
                      onChange={(event) => setValue((current) => current ? {
                        ...current,
                        remoteTerminal: { ...current.remoteTerminal, user: event.target.value },
                      } : current)}
                      placeholder="dev"
                      spellCheck={false}
                    />
                  </label>
                  <label className="block sm:col-span-2 sm:max-w-[200px]">
                    <span className="nd-label mb-2 block text-text-secondary">{t('workspace.sshPort')}</span>
                    <input
                      className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
                      type="number"
                      min="1"
                      max="65535"
                      value={value.remoteTerminal.port ?? ''}
                      onChange={(event) => {
                        const nextPort = event.target.value ? Number(event.target.value) : undefined
                        setValue((current) => current ? {
                          ...current,
                          remoteTerminal: { ...current.remoteTerminal, ...(nextPort === undefined ? { port: undefined } : { port: nextPort }) },
                        } : current)
                      }}
                      placeholder="22"
                    />
                  </label>
                </div>
                <div className="mt-5 border-t border-border pt-4">
                  <label className="flex items-center justify-between gap-4">
                    <span className="nd-label text-text-secondary">{t('workspace.wakeOnLan')}</span>
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 accent-[var(--text-primary)]"
                      checked={wakeOnLanEnabled}
                      onChange={(event) => {
                        const enabled = event.target.checked
                        setValue((current) => {
                          if (!current) return current
                          const currentWakeOnLan = current.remoteTerminal.wakeOnLan
                          if (!currentWakeOnLan && !enabled) return current
                          return {
                            ...current,
                            remoteTerminal: {
                              ...current.remoteTerminal,
                              wakeOnLan: currentWakeOnLan
                                ? { ...currentWakeOnLan, enabled }
                                : { enabled, macAddress: '' },
                            },
                          }
                        })
                      }}
                      aria-label={t('workspace.wakeOnLan')}
                    />
                  </label>
                  {wakeOnLanEnabled && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="nd-label mb-2 block text-text-secondary">{t('workspace.wakeOnLanMacAddress')}</span>
                        <input
                          className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
                          value={wakeOnLan?.macAddress ?? ''}
                          onChange={(event) => updateWakeOnLan({ macAddress: event.target.value })}
                          placeholder="AA:BB:CC:DD:EE:FF"
                          spellCheck={false}
                          aria-invalid={!wakeOnLanMacValid}
                          aria-describedby={!wakeOnLanMacValid ? 'workspace-wake-on-lan-mac-error' : undefined}
                        />
                        {!wakeOnLanMacValid && (
                          <p id="workspace-wake-on-lan-mac-error" role="alert" className="mt-2 text-xs text-red-300">
                            {t('workspace.wakeOnLanInvalidMac')}
                          </p>
                        )}
                      </label>
                      <label className="block">
                        <span className="nd-label mb-2 block text-text-secondary">{t('workspace.wakeOnLanBroadcastAddress')}</span>
                        <input
                          className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
                          value={wakeOnLan?.broadcastAddress ?? ''}
                          onChange={(event) => updateWakeOnLan({ broadcastAddress: event.target.value })}
                          placeholder="255.255.255.255"
                          spellCheck={false}
                          aria-invalid={!wakeOnLanBroadcastValid}
                          aria-describedby={!wakeOnLanBroadcastValid ? 'workspace-wake-on-lan-broadcast-error' : undefined}
                        />
                        {!wakeOnLanBroadcastValid && (
                          <p id="workspace-wake-on-lan-broadcast-error" role="alert" className="mt-2 text-xs text-red-300">
                            {t('workspace.wakeOnLanInvalidBroadcast')}
                          </p>
                        )}
                      </label>
                      <label className="block sm:col-span-2 sm:max-w-[200px]">
                        <span className="nd-label mb-2 block text-text-secondary">{t('workspace.wakeOnLanUdpPort')}</span>
                        <input
                          className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
                          type="number"
                          min="1"
                          max="65535"
                          value={wakeOnLan?.port ?? ''}
                          onChange={(event) => {
                            const nextPort = event.target.value ? Number(event.target.value) : undefined
                            updateWakeOnLan({ port: nextPort })
                          }}
                          placeholder="9"
                          aria-invalid={!wakeOnLanPortValid}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
                <label className="flex items-center justify-between gap-4">
                  <span className="flex min-w-0 items-center gap-2">
                    <History size={14} className="shrink-0 text-text-secondary" />
                    <span className="nd-label truncate text-text-secondary">{t('workspace.terminalHistory')}</span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 accent-[var(--text-primary)]"
                    checked={value.terminalHistoryEnabled}
                    onChange={(event) => setValue((current) => current ? { ...current, terminalHistoryEnabled: event.target.checked } : current)}
                  />
                </label>
              </section>
            </div>
          )}

          {activeTab === 'agents' && (
            <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
              <div className="mb-4 flex items-center gap-2">
                <TerminalSquare size={14} className="text-text-secondary" />
                <span className="nd-label text-text-secondary">{t('workspace.agentProvider')}</span>
              </div>
              <p className="mb-4 text-sm leading-6 text-text-secondary">{t('workspace.agentProviderHelp')}</p>
              <div className="space-y-3" role="radiogroup" aria-label={t('workspace.agentProvider')}>
                {providerOptions.map((option) => {
                  const active = selectedProvider === option.provider
                  return (
                    <label
                      key={option.provider ?? 'none'}
                      className={`flex cursor-pointer items-center gap-3 rounded-[18px] border px-4 py-3 transition-colors ${
                        active ? 'border-text-display bg-bg-primary text-text-display' : 'border-border-visible text-text-secondary hover:bg-hover-bg hover:text-text-display'
                      }`}
                    >
                      <input
                        type="radio"
                        name="workspace-agent-provider"
                        className="h-4 w-4 shrink-0 accent-[var(--text-primary)]"
                        checked={active}
                        onChange={() => setValue((current) => current ? { ...current, agentProvider: option.provider } : current)}
                      />
                      <span className="text-sm">{option.label}</span>
                    </label>
                  )
                })}
              </div>
              {selectedProvider && (
                <label className="mt-4 block">
                  <span className="nd-label mb-2 block text-text-secondary">{t('workspace.agentProviderArgs')}</span>
                  <textarea
                    className="min-h-[72px] w-full resize-y rounded-[14px] border border-border-visible bg-bg-secondary px-3 py-2 font-mono text-xs text-text-display outline-none"
                    value={value.agentProviders[selectedProvider].args.join('\n')}
                    onChange={(event) => updateProviderArgs(selectedProvider, event.target.value.split(/\r?\n/))}
                    placeholder={t('workspace.agentProviderArgsPlaceholder')}
                    spellCheck={false}
                    aria-label={`${selectedProvider === 'claude' ? t('workspace.claude') : t('workspace.codex')} ${t('workspace.agentProviderArgs')}`}
                  />
                </label>
              )}
            </section>
          )}

          {activeTab === 'sourceControl' && (
            <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
              <div className="mb-2 flex items-center gap-2">
                <GitBranch size={14} className="text-text-secondary" />
                <span className="nd-label text-text-secondary">{t('workspace.sourceControl')}</span>
              </div>
              <p className="mb-4 text-sm leading-6 text-text-secondary">{t('workspace.selectRepositories')}</p>
              {repositoriesLoading ? (
                <div className="rounded-[18px] border border-border-visible px-4 py-3 text-sm text-text-secondary" role="status">
                  {t('common.loading')}
                </div>
              ) : repositories.length === 0 ? (
                <div className="rounded-[18px] border border-border-visible px-4 py-3 text-sm text-text-secondary" role="status">
                  {t('workspace.noRepositoriesConfigured')}
                </div>
              ) : (
                <div className="space-y-2" role="group" aria-label={t('workspace.selectRepositories')}>
                  {repositories.map((repository) => {
                    const checked = value.sourceControlRepositoryPaths.includes(repository.relativePath)
                    return (
                      <label
                        key={repository.relativePath}
                        className={`flex cursor-pointer items-center gap-3 rounded-[18px] border px-4 py-3 transition-colors ${
                          checked ? 'border-text-display bg-bg-primary text-text-display' : 'border-border-visible text-text-secondary hover:bg-hover-bg hover:text-text-display'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-[var(--text-primary)]"
                          checked={checked}
                          onChange={(event) => toggleRepository(repository.relativePath, event.target.checked)}
                          aria-label={`${t('workspace.repository')}: ${repository.name}`}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{repository.name}</span>
                        <span className="shrink-0 font-mono text-xs text-text-disabled">{repository.relativePath}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </section>
          )}
          </div>
        </div>

        <footer data-testid="workspace-dialog-actions" className="shrink-0 flex items-center justify-end gap-3 border-t border-border px-6 py-5">
          {canCancel && (
            <button
              className="rounded-full border border-border-visible px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
              onClick={onCancel}
            >
              {request.cancelLabel ?? t('common.cancel')}
            </button>
          )}
          <button
            className="rounded-full border border-text-display px-4 py-2 text-sm text-text-display transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onConfirm(normalizeValue(value))}
            disabled={!canSubmit}
          >
            {request.confirmLabel ?? t('workspace.saveWorkspace')}
          </button>
        </footer>

        {showRemoteHelp && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 p-6">
            <div className="w-full max-w-lg rounded-[24px] border border-border-visible bg-bg-secondary p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="nd-label text-text-secondary">{t('workspace.remoteTerminal')}</div>
                  <h3 className="mt-2 text-lg text-text-display">{t('workspace.remoteTerminalHelpTitle')}</h3>
                </div>
                <button
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary hover:text-text-display"
                  onClick={() => setShowRemoteHelp(false)}
                  title={t('workspace.closeRemoteTerminalHelp')}
                  type="button"
                >
                  <X size={15} />
                </button>
              </div>
              <p className="mt-4 text-sm leading-6 text-text-secondary">
                {t('workspace.remoteTerminalHelpMessage')}
              </p>
              <button
                className="mt-6 rounded-full border border-text-display px-4 py-2 text-sm text-text-display transition-colors hover:bg-hover-bg"
                onClick={() => setShowRemoteHelp(false)}
                type="button"
              >
                {t('workspace.gotIt')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
