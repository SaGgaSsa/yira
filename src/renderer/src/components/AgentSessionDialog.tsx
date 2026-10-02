import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CLAUDE_PERMISSION_MODES, CODEX_SANDBOX_MODES } from '@shared/types'
import type {
  AgentProvider,
  AgentSessionCreateResult,
  AgentSessionLaunchOverrides,
} from '@shared/types'

export interface AgentSessionDialogProps {
  open: boolean
  workspaceId: string
  provider: AgentProvider
  worktreeAvailable: boolean
  onClose: () => void
  onCreated: (result: AgentSessionCreateResult) => void
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function buildAgentSessionLaunchOverrides(
  model: string,
  permissionMode: string,
): AgentSessionLaunchOverrides | undefined {
  const overrides: AgentSessionLaunchOverrides = {}
  const trimmedModel = model.trim()
  if (trimmedModel) overrides.model = trimmedModel
  if (permissionMode) overrides.permissionMode = permissionMode
  return Object.keys(overrides).length > 0 ? overrides : undefined
}

export function AgentSessionDialog({
  open,
  workspaceId,
  provider,
  worktreeAvailable,
  onClose,
  onCreated,
}: AgentSessionDialogProps): React.ReactElement | null {
  const { t } = useTranslation()
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const [prompt, setPrompt] = useState('')
  const [worktree, setWorktree] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [model, setModel] = useState('')
  const [permissionMode, setPermissionMode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setPrompt('')
    setWorktree(false)
    setOptionsOpen(false)
    setModel('')
    setPermissionMode('')
    setError(null)
    setIsSubmitting(false)
    promptRef.current?.focus()
  }, [open, provider])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || isSubmitting) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSubmitting, onClose, open])

  if (!open) return null

  const providerLabel = provider === 'claude' ? 'Claude' : 'Codex'
  const permissionModes: readonly string[] = provider === 'claude'
    ? CLAUDE_PERMISSION_MODES
    : CODEX_SANDBOX_MODES

  const createSession = async (promptValue = prompt): Promise<void> => {
    const trimmedPrompt = promptValue.trim()
    if (!trimmedPrompt || isSubmitting) return

    const overrides = buildAgentSessionLaunchOverrides(model, permissionMode)

    setIsSubmitting(true)
    setError(null)
    let result: AgentSessionCreateResult
    try {
      result = await window.electron.agents.createSession({
        workspaceId,
        prompt: trimmedPrompt,
        worktree: worktreeAvailable && worktree,
        ...(overrides ? { overrides } : {}),
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
            <div className="nd-label text-text-secondary">{t('agentsView.provider')}: {providerLabel}</div>
            <h2 id="agent-session-dialog-title" className="mt-1 text-xl text-text-display">{t('agentsView.newSession')}</h2>
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
                autoFocus
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

            <div className="space-y-2">
              <label className={`flex items-start gap-2 text-sm ${worktreeAvailable ? 'text-text-primary' : 'text-text-disabled'}`}>
                <input
                  type="checkbox"
                  className="mt-0.5 accent-accent"
                  checked={worktree}
                  disabled={!worktreeAvailable || isSubmitting}
                  onChange={(event) => setWorktree(event.target.checked)}
                />
                <span>{t('agentsView.worktree')}</span>
              </label>
              {!worktreeAvailable && <p className="pl-6 text-xs text-text-secondary">{t('agentsView.worktreeUnavailable')}</p>}
            </div>

            <section className="rounded-xl border border-border-visible">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-text-secondary hover:text-text-display"
                aria-expanded={optionsOpen}
                onClick={() => setOptionsOpen((value) => !value)}
              >
                {optionsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {t('agentsView.options')}
              </button>
              {optionsOpen && (
                <div className="grid gap-4 border-t border-border px-4 py-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="nd-caption mb-1.5 block text-text-secondary">{t('agentsView.model')}</span>
                    <input
                      className="w-full rounded-lg border border-border-visible bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-text-secondary"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      placeholder={t('agentsView.modelPlaceholder')}
                      disabled={isSubmitting}
                    />
                  </label>
                  <label className="block">
                    <span className="nd-caption mb-1.5 block text-text-secondary">{t('agentsView.permissions')}</span>
                    <select
                      className="w-full rounded-lg border border-border-visible bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-text-secondary"
                      value={permissionMode}
                      onChange={(event) => setPermissionMode(event.target.value)}
                      disabled={isSubmitting}
                    >
                      <option value="">{t('agentsView.workspaceDefault')}</option>
                      {permissionModes.map((mode) => <option value={mode} key={mode}>{mode}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </section>

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
              disabled={!prompt.trim() || isSubmitting}
            >
              {isSubmitting ? t('agentsView.creatingSession') : t('agentsView.createSession')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
