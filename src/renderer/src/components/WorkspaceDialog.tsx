import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderOpen, Grid3X3, History, Info, LayoutGrid, TerminalSquare, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AgentProvider, AgentProvidersConfig, RemoteTerminalConfig, WorkspaceType } from '@shared/types'
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
}

export interface WorkspaceDialogRequest {
  title: string
  eyebrow?: string
  confirmLabel?: string
  cancelLabel?: string
  canCancel?: boolean
  typeEditable?: boolean
  value: WorkspaceDialogValue
}

interface WorkspaceDialogProps {
  request: WorkspaceDialogRequest | null
  onCancel: () => void
  onConfirm: (value: WorkspaceDialogValue) => void
}

function normalizeValue(value: WorkspaceDialogValue): WorkspaceDialogValue {
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
    },
    agentProvider: normalizeWorkspaceAgentProvider(value.agentProvider),
    agentProviders: normalizeAgentProvidersConfig(value.agentProviders),
  }
}

export function WorkspaceDialog({ request, onCancel, onConfirm }: WorkspaceDialogProps): React.ReactElement | null {
  const { t } = useTranslation()
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState<WorkspaceDialogValue | null>(request?.value ?? null)
  const [showRemoteHelp, setShowRemoteHelp] = useState(false)

  useEffect(() => {
    setValue(request?.value ?? null)
    setShowRemoteHelp(false)

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
        if (!value.name.trim()) return
        event.preventDefault()
        onConfirm(normalizeValue(value))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, onConfirm, request, value])

  if (!request || !value) return null

  const canCancel = request.canCancel !== false
  const canSubmit = Boolean(value.name.trim())
  const typeEditable = request.typeEditable === true
  const providerOptions: Array<{ provider: AgentProvider | undefined; label: string }> = [
    { provider: undefined, label: t('workspace.noAgentProvider') },
    { provider: 'claude', label: t('workspace.claude') },
    { provider: 'codex', label: t('workspace.codex') },
  ]
  const selectedProvider = value.agentProvider

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

        <div data-testid="workspace-dialog-form" className="min-h-0 flex-1 overflow-y-auto space-y-6 px-6 py-6">
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
            </div>
            <div className="flex items-center gap-2">
              <div
                className="min-w-0 flex-1 truncate rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display"
                title={value.rootFolderPath || t('workspace.noFolderSelected')}
              >
                {value.rootFolderPath || t('workspace.noFolderSelected')}
              </div>
              <button
                className="shrink-0 rounded-full border border-border-visible px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                onClick={() => {
                  void window.electron.files.selectFolder(value.rootFolderPath || undefined).then((folder) => {
                    if (!folder) return
                    setValue((current) => current ? { ...current, rootFolderPath: folder.path } : current)
                  })
                }}
              >
                {t('workspace.selectFolder')}
              </button>
              <button
                className="shrink-0 rounded-full border border-border-visible px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setValue((current) => current ? { ...current, rootFolderPath: '' } : current)}
                disabled={!value.rootFolderPath}
              >
                {t('workspace.clearFolder')}
              </button>
            </div>
          </section>

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
                  spellCheck={false}
                />
              </label>
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
