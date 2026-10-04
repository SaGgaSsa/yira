import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AgentProvider, AgentSessionCreateResult, UserSettings, WorkspaceMetadata } from '@shared/types'
import { WorkspacePickerMenu } from './WorkspacePickerMenu'

export interface AgentSessionDialogProps {
  open: boolean
  workspaces: WorkspaceMetadata[]
  initialWorkspaceId: string | null
  agents: UserSettings['agents']
  focusRequestId: number
  onClose: () => void
  onCreated: (result: AgentSessionCreateResult) => void
}

export interface UsableAgentWorkspace {
  workspace: WorkspaceMetadata
  providers: AgentProvider[]
}

export function getUsableAgentWorkspaces(
  workspaces: WorkspaceMetadata[],
  agents: UserSettings['agents'],
): UsableAgentWorkspace[] {
  return workspaces.flatMap((workspace) => {
    const providers = (['claude', 'codex'] as const).filter((provider) => (
      agents[provider]?.enabled === true && workspace.config.agentProviders[provider]?.enabled === true
    ))
    // A workspace set to "no agent" has no Agents View to show the session in.
    const configuredProvider = workspace.config.agentProvider
    return configuredProvider && providers.includes(configuredProvider) ? [{ workspace, providers }] : []
  })
}

function getDefaultProvider(workspace: UsableAgentWorkspace | undefined): AgentProvider | null {
  if (!workspace) return null
  const configuredProvider = workspace.workspace.config.agentProvider
  return configuredProvider && workspace.providers.includes(configuredProvider)
    ? configuredProvider
    : workspace.providers[0] ?? null
}

function getInitialWorkspace(
  workspaces: UsableAgentWorkspace[],
  initialWorkspaceId: string | null,
): UsableAgentWorkspace | undefined {
  return workspaces.find(({ workspace }) => workspace.id === initialWorkspaceId) ?? workspaces[0]
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getProviderLabel(provider: AgentProvider, translate: (key: string) => string): string {
  return translate(provider === 'claude' ? 'agentsView.claude' : 'agentsView.codex')
}

export function AgentSessionDialog({
  open,
  workspaces,
  initialWorkspaceId,
  agents,
  focusRequestId,
  onClose,
  onCreated,
}: AgentSessionDialogProps): React.ReactElement | null {
  const { t } = useTranslation()
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const wasOpenRef = useRef(false)
  const capabilityRequestRef = useRef(0)
  const usableWorkspaces = useMemo(
    () => getUsableAgentWorkspaces(workspaces, agents),
    [agents, workspaces],
  )
  const firstWorkspace = getInitialWorkspace(usableWorkspaces, initialWorkspaceId)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(firstWorkspace?.workspace.id ?? null)
  const [selectedProvider, setSelectedProvider] = useState<AgentProvider | null>(() => getDefaultProvider(firstWorkspace))
  const [prompt, setPrompt] = useState('')
  const [worktree, setWorktree] = useState(false)
  const [worktreeAvailable, setWorktreeAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const selectedWorkspace = usableWorkspaces.find(({ workspace }) => workspace.id === selectedWorkspaceId)

  const requestWorkspaceCapabilities = useCallback((workspaceId: string | null): void => {
    const requestId = ++capabilityRequestRef.current
    setWorktreeAvailable(false)
    setWorktree(false)
    if (!workspaceId) return

    void window.electron.agents.sessionCapabilities(workspaceId)
      .then((capabilities) => {
        if (requestId !== capabilityRequestRef.current) return
        if (!capabilities.worktreeAvailable) setWorktree(false)
        setWorktreeAvailable(capabilities.worktreeAvailable)
      })
      .catch(() => {
        if (requestId !== capabilityRequestRef.current) return
        setWorktree(false)
        setWorktreeAvailable(false)
      })
  }, [])

  useEffect(() => () => {
    capabilityRequestRef.current += 1
  }, [])

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      requestWorkspaceCapabilities(null)
      return
    }
    if (wasOpenRef.current) return

    wasOpenRef.current = true
    const nextWorkspace = getInitialWorkspace(usableWorkspaces, initialWorkspaceId)
    setSelectedWorkspaceId(nextWorkspace?.workspace.id ?? null)
    setSelectedProvider(getDefaultProvider(nextWorkspace))
    setPrompt('')
    setWorktree(false)
    setWorktreeAvailable(false)
    setError(null)
    setIsSubmitting(false)
    requestWorkspaceCapabilities(nextWorkspace?.workspace.id ?? null)
    promptRef.current?.focus()
  }, [agents, initialWorkspaceId, open, requestWorkspaceCapabilities, usableWorkspaces])

  useEffect(() => {
    if (open) promptRef.current?.focus()
  }, [focusRequestId, open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || isSubmitting) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSubmitting, onClose, open])

  if (!open) return null

  const createSession = async (promptValue = prompt): Promise<void> => {
    const trimmedPrompt = promptValue.trim()
    if (!selectedWorkspace || !selectedProvider || isSubmitting) return

    setIsSubmitting(true)
    setError(null)
    let result: AgentSessionCreateResult
    try {
      result = await window.electron.agents.createSession({
        workspaceId: selectedWorkspace.workspace.id,
        provider: selectedProvider,
        ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
        worktree: worktreeAvailable && worktree,
      })
    } catch (submitError) {
      setError(getErrorMessage(submitError))
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
    onCreated(result)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-session-dialog-title"
        className="w-full max-w-2xl overflow-hidden rounded-[20px] border border-border-visible bg-bg-secondary shadow-2xl"
      >
        <div className="flex items-start gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0 flex-1">
            <h2 id="agent-session-dialog-title" className="text-xl text-text-display">
              {t('agentsView.newAgentSession')}
            </h2>
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display disabled:opacity-50"
            aria-label={t('agentsView.closeDialog')}
            title={t('agentsView.closeDialog')}
            disabled={isSubmitting}
            onClick={onClose}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void createSession()
          }}
        >
          <div className="space-y-4 px-6 py-5">
            <label className="block">
              <span className="nd-label mb-2 block text-text-secondary">{t('agentsView.prompt')}</span>
              <textarea
                ref={promptRef}
                className="min-h-36 w-full resize-y rounded-xl border border-border-visible bg-bg-primary px-4 py-3 text-sm leading-6 text-text-primary outline-none focus:border-text-secondary"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
                  event.preventDefault()
                  void createSession(event.currentTarget.value)
                }}
                placeholder={t('agentsView.promptPlaceholder')}
                disabled={isSubmitting}
              />
            </label>

            {usableWorkspaces.length === 0 ? (
              <p className="rounded-lg border border-border-visible bg-bg-primary px-3 py-2 text-sm text-text-secondary">
                {t('agentsView.noUsableWorkspace')}
              </p>
            ) : selectedWorkspace && selectedProvider ? (
              <div className="flex flex-wrap items-center justify-start gap-2">
                <WorkspacePickerMenu
                  options={usableWorkspaces.map(({ workspace }) => ({
                    id: workspace.id,
                    label: workspace.name.trim() || t('agentsView.unnamedWorkspace'),
                  }))}
                  selectedId={selectedWorkspaceId}
                  label={t('agentsView.workspace')}
                  disabled={isSubmitting}
                  onSelect={(workspaceId) => {
                    const nextWorkspace = usableWorkspaces.find(({ workspace }) => workspace.id === workspaceId)
                    setSelectedWorkspaceId(nextWorkspace?.workspace.id ?? null)
                    setSelectedProvider(getDefaultProvider(nextWorkspace))
                    setWorktree(false)
                    requestWorkspaceCapabilities(nextWorkspace?.workspace.id ?? null)
                    setError(null)
                    promptRef.current?.focus()
                  }}
                />

                {selectedWorkspace.providers.length > 1 ? (
                  <div
                    role="radiogroup"
                    aria-label={t('agentsView.provider')}
                    className="inline-flex h-9 shrink-0 overflow-hidden rounded-full border border-border-visible"
                  >
                    {selectedWorkspace.providers.map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        role="radio"
                        aria-checked={selectedProvider === provider}
                        className={`h-full px-3 text-sm transition-colors disabled:opacity-50 ${
                          selectedProvider === provider
                            ? 'bg-bg-primary text-text-display'
                            : 'text-text-secondary hover:bg-hover-bg'
                        }`}
                        disabled={isSubmitting}
                        onClick={() => setSelectedProvider(provider)}
                      >
                        {getProviderLabel(provider, t)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="inline-flex h-9 shrink-0 items-center rounded-full border border-border-visible px-3 text-sm text-text-secondary">
                    {getProviderLabel(selectedProvider, t)}
                  </span>
                )}

                {worktreeAvailable && (
                  <label
                    className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border-visible px-3 text-sm text-text-primary transition-colors ${
                      isSubmitting ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-hover-bg'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-accent"
                      checked={worktree}
                      disabled={isSubmitting}
                      title={t('agentsView.worktreeDescription')}
                      onChange={(event) => setWorktree(event.target.checked)}
                    />
                    <span>{t('agentsView.worktree')}</span>
                  </label>
                )}
              </div>
            ) : null}

            {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            <button
              type="button"
              className="rounded-full border border-border-visible px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg disabled:opacity-50"
              disabled={isSubmitting}
              onClick={onClose}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="rounded-full border border-text-display px-4 py-2 text-sm text-text-display transition-colors hover:bg-bg-primary disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedWorkspace || !selectedProvider || isSubmitting}
            >
              {isSubmitting ? t('agentsView.creatingSession') : t('agentsView.createSession')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
