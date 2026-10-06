import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  AgentPromptImageMimeType,
  AgentSessionCreateResult,
  AgentProvider,
  UserSettings,
  WorkspaceMetadata,
} from '@shared/types'
import { WorkspacePickerMenu } from './WorkspacePickerMenu'
import {
  insertPromptImageReferences,
  removePromptImageReference,
} from '@/utils/agentPromptImages'

const MAX_PROMPT_IMAGE_COUNT = 10
const MAX_PROMPT_IMAGE_SIZE = 10 * 1024 * 1024

interface PromptImagePreview {
  id: number
  /** Shown in the prompt as `[Image #number]`. */
  number: number
  preview: string
  path: string | null
}

interface ClipboardPromptImage {
  file: File
  mimeType: AgentPromptImageMimeType
}

export interface AgentSessionDialogProps {
  open: boolean
  workspaces: WorkspaceMetadata[]
  initialWorkspaceId: string | null
  agents: UserSettings['agents']
  focusRequestId: number
  onClose: () => void
  onCreated: (result: AgentSessionCreateResult) => void
  /** Shown as a step of the Activity palette: Escape and Cancel go back instead of closing. */
  onBack?: () => void
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

function getPromptImageMimeType(mimeType: string): AgentPromptImageMimeType | null {
  switch (mimeType) {
    case 'image/png':
    case 'image/jpeg':
    case 'image/gif':
    case 'image/webp':
      return mimeType
    default:
      return null
  }
}

function getClipboardPromptImages(clipboardData: DataTransfer): ClipboardPromptImage[] {
  const itemImages = Array.from(clipboardData.items ?? []).flatMap((item) => {
    if (item.kind !== 'file') return []
    const mimeType = getPromptImageMimeType(item.type)
    const file = mimeType ? item.getAsFile() : null
    return file && mimeType ? [{ file, mimeType }] : []
  })
  if (itemImages.length > 0) return itemImages

  return Array.from(clipboardData.files ?? []).flatMap((file) => {
    const mimeType = getPromptImageMimeType(file.type)
    return mimeType ? [{ file, mimeType }] : []
  })
}

function readImageDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Could not read image preview'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image preview'))
    reader.readAsDataURL(file)
  })
}

export function AgentSessionDialog({
  open,
  workspaces,
  initialWorkspaceId,
  agents,
  focusRequestId,
  onClose,
  onCreated,
  onBack,
}: AgentSessionDialogProps): React.ReactElement | null {
  const { t } = useTranslation()
  const dismiss = onBack ?? onClose
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const wasOpenRef = useRef(false)
  const capabilityRequestRef = useRef(0)
  const promptImageIdRef = useRef(0)
  const promptImageNumberRef = useRef(0)
  const pendingCaretRef = useRef<number | null>(null)
  const promptImageGenerationRef = useRef(0)
  const promptImagesRef = useRef<PromptImagePreview[]>([])
  const usableWorkspaces = useMemo(
    () => getUsableAgentWorkspaces(workspaces, agents),
    [agents, workspaces],
  )
  const firstWorkspace = getInitialWorkspace(usableWorkspaces, initialWorkspaceId)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(firstWorkspace?.workspace.id ?? null)
  const [selectedProvider, setSelectedProvider] = useState<AgentProvider | null>(() => getDefaultProvider(firstWorkspace))
  const [prompt, setPrompt] = useState('')
  const [promptImages, setPromptImages] = useState<PromptImagePreview[]>([])
  const [worktree, setWorktree] = useState(false)
  const [worktreeAvailable, setWorktreeAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSavingImages = promptImages.some((image) => image.path === null)
  const selectedWorkspace = usableWorkspaces.find(({ workspace }) => workspace.id === selectedWorkspaceId)

  const updatePromptImages = (update: (current: PromptImagePreview[]) => PromptImagePreview[]): void => {
    const nextImages = update(promptImagesRef.current)
    promptImagesRef.current = nextImages
    setPromptImages(nextImages)
  }

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
      promptImageGenerationRef.current += 1
      requestWorkspaceCapabilities(null)
      return
    }
    if (wasOpenRef.current) return

    wasOpenRef.current = true
    const nextWorkspace = getInitialWorkspace(usableWorkspaces, initialWorkspaceId)
    setSelectedWorkspaceId(nextWorkspace?.workspace.id ?? null)
    setSelectedProvider(getDefaultProvider(nextWorkspace))
    setPrompt('')
    promptImageGenerationRef.current += 1
    promptImageNumberRef.current = 0
    promptImagesRef.current = []
    setPromptImages([])
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
    // Keep the caret after the image references inserted by a paste.
    const caret = pendingCaretRef.current
    if (caret === null) return
    pendingCaretRef.current = null
    promptRef.current?.setSelectionRange?.(caret, caret)
  }, [prompt])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || isSubmitting) return
      event.preventDefault()
      dismiss()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dismiss, isSubmitting, open])

  if (!open) return null

  const createSession = async (promptValue = prompt): Promise<void> => {
    const trimmedPrompt = promptValue.trim()
    if (!selectedWorkspace || !selectedProvider || isSubmitting || isSavingImages) return

    setIsSubmitting(true)
    setError(null)
    let result: AgentSessionCreateResult
    try {
      result = await window.electron.agents.createSession({
        workspaceId: selectedWorkspace.workspace.id,
        provider: selectedProvider,
        ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
        ...(promptImages.length > 0
          ? {
            images: promptImages.flatMap((image) => (
              image.path ? [{ number: image.number, path: image.path }] : []
            )),
          }
          : {}),
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

  const removePromptImage = (previewId: number): void => {
    const image = promptImagesRef.current.find((entry) => entry.id === previewId)
    if (!image) return
    updatePromptImages((current) => current.filter((entry) => entry.id !== previewId))
    setPrompt((current) => removePromptImageReference(current, image.number))
  }

  const attachPromptImage = async (
    image: ClipboardPromptImage,
    previewId: number,
    generation: number,
  ): Promise<void> => {
    try {
      const [preview, buffer] = await Promise.all([
        readImageDataUrl(image.file),
        image.file.arrayBuffer(),
      ])
      if (
        generation !== promptImageGenerationRef.current
        || !promptImagesRef.current.some((entry) => entry.id === previewId)
      ) return

      updatePromptImages((current) => current.map((entry) => (
        entry.id === previewId ? { ...entry, preview } : entry
      )))
      const savedImage = await window.electron.agents.savePromptImage({
        mimeType: image.mimeType,
        data: new Uint8Array(buffer),
      })
      if (generation !== promptImageGenerationRef.current) return

      updatePromptImages((current) => current.map((entry) => (
        entry.id === previewId ? { ...entry, path: savedImage.path } : entry
      )))
    } catch {
      if (
        generation !== promptImageGenerationRef.current
        || !promptImagesRef.current.some((entry) => entry.id === previewId)
      ) return
      removePromptImage(previewId)
      setError(t('agentsView.promptImageAttachError'))
    }
  }

  const handlePromptPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const clipboardImages = getClipboardPromptImages(event.clipboardData)
    if (clipboardImages.length === 0) return

    event.preventDefault()
    setError(null)

    const currentImages = promptImagesRef.current
    const acceptedImages: ClipboardPromptImage[] = []
    let hasOversizedImage = false
    let hasTooManyImages = false
    for (const image of clipboardImages) {
      if (image.file.size > MAX_PROMPT_IMAGE_SIZE) {
        hasOversizedImage = true
        continue
      }
      if (currentImages.length + acceptedImages.length >= MAX_PROMPT_IMAGE_COUNT) {
        hasTooManyImages = true
        continue
      }
      acceptedImages.push(image)
    }

    if (hasOversizedImage) setError(t('agentsView.promptImageTooLarge'))
    else if (hasTooManyImages) setError(t('agentsView.promptImageLimit'))

    if (acceptedImages.length === 0) return

    const newPreviews = acceptedImages.map(() => ({
      id: ++promptImageIdRef.current,
      number: ++promptImageNumberRef.current,
      preview: '',
      path: null,
    }))
    updatePromptImages((current) => [...current, ...newPreviews])

    const textarea = event.currentTarget
    const edit = insertPromptImageReferences(
      textarea.value,
      textarea.selectionStart ?? textarea.value.length,
      textarea.selectionEnd ?? textarea.value.length,
      newPreviews.map((preview) => preview.number),
    )
    pendingCaretRef.current = edit.caret
    setPrompt(edit.value)
    const generation = promptImageGenerationRef.current
    acceptedImages.forEach((image, index) => {
      void attachPromptImage(image, newPreviews[index].id, generation)
    })
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
          {onBack && (
            <button
              type="button"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border-visible px-3 text-sm text-text-secondary transition-colors hover:text-text-display disabled:opacity-50"
              aria-label={t('activityPalette.backToActivity')}
              title={t('activityPalette.backToActivity')}
              disabled={isSubmitting}
              onClick={onBack}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {t('activityPalette.title')}
            </button>
          )}
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
            <div className="space-y-3">
              {promptImages.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {promptImages.map((image) => (
                    <div
                      key={image.id}
                      className="relative h-12 w-12 shrink-0 rounded-lg border border-border-visible bg-bg-primary"
                      aria-busy={image.path === null}
                    >
                      {image.preview && (
                        <img
                          src={image.preview}
                          alt={`${t('agentsView.promptImageAlt')} ${image.number}`}
                          className={`h-full w-full rounded-lg object-cover ${
                            image.path === null ? 'opacity-50' : ''
                          }`}
                        />
                      )}
                      <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[10px] leading-4 text-white">
                        #{image.number}
                      </span>
                      <button
                        type="button"
                        className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border-visible bg-bg-secondary text-text-secondary shadow transition-colors hover:bg-hover-bg hover:text-text-display"
                        aria-label={`${t('agentsView.removePromptImage')} ${image.number}`}
                        disabled={isSubmitting}
                        onClick={() => {
                          removePromptImage(image.id)
                          promptRef.current?.focus()
                        }}
                      >
                        <X size={11} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                ref={promptRef}
                className="min-h-36 w-full resize-y rounded-xl border border-border-visible bg-bg-primary px-4 py-3 text-sm leading-6 text-text-primary outline-none focus:border-text-secondary"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onPaste={handlePromptPaste}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
                  event.preventDefault()
                  if (event.altKey) {
                    // Textareas ignore Alt+Enter, so insert the line break like Shift+Enter does.
                    const textarea = event.currentTarget
                    textarea.setRangeText('\n', textarea.selectionStart, textarea.selectionEnd, 'end')
                    setPrompt(textarea.value)
                    return
                  }
                  if (!isSavingImages) void createSession(event.currentTarget.value)
                }}
                placeholder={t('agentsView.promptPlaceholder')}
                aria-label={t('agentsView.prompt')}
                disabled={isSubmitting}
              />
            </div>

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
              onClick={dismiss}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="rounded-full border border-text-display px-4 py-2 text-sm text-text-display transition-colors hover:bg-bg-primary disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedWorkspace || !selectedProvider || isSubmitting || isSavingImages}
            >
              {isSubmitting ? t('agentsView.creatingSession') : t('agentsView.createSession')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
