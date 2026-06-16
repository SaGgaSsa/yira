import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, Grid3X3, LayoutGrid, Pencil, RotateCcw, Save, Trash2, X } from 'lucide-react'
import type { WorkspaceManagementEntry, WorkspaceMetadata } from '@shared/types'
import { WorkspaceDialog, type WorkspaceDialogRequest, type WorkspaceDialogValue } from './WorkspaceDialog'

interface WorkspaceManagementDialogProps {
  open: boolean
  workspaces: WorkspaceMetadata[]
  onCancel: () => void
  onSave: (entries: WorkspaceManagementEntry[]) => Promise<void>
}

interface WorkspaceDraft extends WorkspaceManagementEntry {
  key: string
  markedForRemoval: boolean
  removalText: string
}

type DraftEditorState = {
  key: string | null
  request: WorkspaceDialogRequest
} | null

function workspaceToDraft(workspace: WorkspaceMetadata): WorkspaceDraft {
  return {
    key: workspace.id,
    id: workspace.id,
    name: workspace.name,
    type: workspace.config.type,
    rootFolderPath: workspace.config.rootFolderPath ?? '',
    initialCommand: workspace.config.initialCommand ?? '',
    terminalHistoryEnabled: workspace.config.terminalHistoryEnabled !== false,
    markedForRemoval: false,
    removalText: '',
  }
}

function draftToDialogValue(draft?: WorkspaceDraft): WorkspaceDialogValue {
  return {
    type: draft?.type ?? 'canvas',
    name: draft?.name ?? '',
    rootFolderPath: draft?.rootFolderPath ?? '',
    initialCommand: draft?.initialCommand ?? '',
    terminalHistoryEnabled: draft?.terminalHistoryEnabled ?? true,
  }
}

function dialogValueToDraftValue(value: WorkspaceDialogValue): WorkspaceManagementEntry {
  return {
    name: value.name,
    type: value.type,
    rootFolderPath: value.rootFolderPath || undefined,
    initialCommand: value.initialCommand || undefined,
    terminalHistoryEnabled: value.terminalHistoryEnabled,
  }
}

export function WorkspaceManagementDialog({
  open,
  workspaces,
  onCancel,
  onSave,
}: WorkspaceManagementDialogProps): React.ReactElement | null {
  const [drafts, setDrafts] = useState<WorkspaceDraft[]>([])
  const [editor, setEditor] = useState<DraftEditorState>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    setDrafts(workspaces.map(workspaceToDraft))
    setEditor(null)
    setSaving(false)
    setError(null)
  }, [open, workspaces])

  const activeDrafts = useMemo(
    () => drafts.filter((draft) => !draft.markedForRemoval),
    [drafts],
  )
  const canSave = activeDrafts.every((draft) => draft.name.trim())

  if (!open) return null

  const moveDraft = (key: string, direction: -1 | 1) => {
    setDrafts((current) => {
      const index = current.findIndex((draft) => draft.key === key)
      const targetIndex = index + direction
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current

      const next = [...current]
      const [draft] = next.splice(index, 1)
      next.splice(targetIndex, 0, draft)
      return next
    })
  }

  const openEditor = (draft: WorkspaceDraft | null) => {
    setEditor({
      key: draft?.key ?? null,
      request: {
        title: 'Edit workspace',
        eyebrow: 'Workspace Draft',
        confirmLabel: 'Apply Draft',
        typeEditable: false,
        value: draftToDialogValue(draft ?? undefined),
      },
    })
  }

  const confirmEditor = (value: WorkspaceDialogValue) => {
    if (!editor) return

    const draftValue = dialogValueToDraftValue(value)

    setDrafts((current) => current.map((draft) => (
      draft.key === editor.key
        ? { ...draft, ...draftValue, type: draft.type, markedForRemoval: false, removalText: '' }
        : draft
    )))
    setEditor(null)
  }

  const saveDrafts = async () => {
    setSaving(true)
    setError(null)

    try {
      await onSave(activeDrafts.map((draft) => ({
        id: draft.id,
        name: draft.name,
        type: draft.type,
        rootFolderPath: draft.rootFolderPath || undefined,
        initialCommand: draft.initialCommand || undefined,
        terminalHistoryEnabled: draft.terminalHistoryEnabled,
      })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save workspace changes')
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/80">
      <div className="flex max-h-[90vh] w-[920px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[24px] border border-border-visible bg-bg-secondary shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <div className="nd-label text-text-secondary">Workspaces</div>
            <h2 className="mt-2 text-xl text-text-display">Manage Workspaces</h2>
          </div>
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display"
            onClick={onCancel}
            title="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
          {error && (
            <div className="rounded-[18px] border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {drafts.map((draft, index) => {
              const isNewDraft = !draft.id
              const canMarkRemoval = draft.removalText.trim() === draft.name.trim()

              return (
                <section
                  key={draft.key}
                  className={`rounded-[20px] border px-4 py-4 ${draft.markedForRemoval ? 'border-red-500/40 bg-red-500/10' : 'border-border bg-bg-tertiary'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => moveDraft(draft.key, -1)}
                        disabled={index === 0}
                        title="Move up"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => moveDraft(draft.key, 1)}
                        disabled={index === drafts.length - 1}
                        title="Move down"
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-base text-text-display">{draft.name || 'Untitled Workspace'}</div>
                        {draft.markedForRemoval && (
                          <span className="rounded-full border border-red-500/50 px-2 py-1 text-xs uppercase tracking-[0.08em] text-red-200">
                            Will remove
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full border border-border-visible px-2 py-1 text-xs uppercase tracking-[0.08em] text-text-secondary">
                          {draft.type === 'grid' ? <Grid3X3 size={12} /> : <LayoutGrid size={12} />}
                          {draft.type === 'grid' ? 'Grid' : 'Canvas'}
                        </span>
                        {isNewDraft && !draft.markedForRemoval && (
                          <span className="rounded-full border border-border-visible px-2 py-1 text-xs uppercase tracking-[0.08em] text-text-secondary">
                            New
                          </span>
                        )}
                      </div>
                      <div className="mt-2 truncate font-mono text-xs text-text-secondary" title={draft.rootFolderPath || 'No root folder'}>
                        {draft.rootFolderPath || 'No root folder'}
                      </div>
                      {draft.initialCommand && (
                        <div className="mt-2 truncate font-mono text-xs text-text-disabled" title={draft.initialCommand}>
                          {draft.initialCommand}
                        </div>
                      )}

                      {!isNewDraft && !draft.markedForRemoval && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <input
                            className="min-w-[220px] flex-1 rounded-full border border-border-visible bg-bg-primary px-4 py-2 font-mono text-sm text-text-display outline-none"
                            value={draft.removalText}
                            onChange={(event) => {
                              const removalText = event.target.value
                              setDrafts((current) => current.map((entry) => (
                                entry.key === draft.key ? { ...entry, removalText } : entry
                              )))
                            }}
                            placeholder={`Type ${draft.name}`}
                            spellCheck={false}
                          />
                          <button
                            className="inline-flex items-center gap-2 rounded-full border border-red-500/50 px-4 py-2 text-sm text-red-200 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={() => {
                              setDrafts((current) => current.map((entry) => (
                                entry.key === draft.key ? { ...entry, markedForRemoval: true } : entry
                              )))
                            }}
                            disabled={!canMarkRemoval}
                          >
                            <Trash2 size={14} />
                            <span>Remove from Yira</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {draft.markedForRemoval ? (
                        <button
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                          onClick={() => {
                            setDrafts((current) => current.map((entry) => (
                              entry.key === draft.key ? { ...entry, markedForRemoval: false, removalText: '' } : entry
                            )))
                          }}
                          title="Undo removal"
                        >
                          <RotateCcw size={15} />
                        </button>
                      ) : (
                        <button
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                          onClick={() => openEditor(draft)}
                          title="Edit workspace"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {isNewDraft && !draft.markedForRemoval && (
                        <button
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                          onClick={() => {
                            setDrafts((current) => current.filter((entry) => entry.key !== draft.key))
                          }}
                          title="Discard draft"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-5">
          <button
            className="rounded-full border border-border-visible px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-text-display px-4 py-2 text-sm text-text-display transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void saveDrafts()
            }}
            disabled={!canSave || saving}
          >
            <Save size={14} />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      <WorkspaceDialog
        request={editor?.request ?? null}
        onCancel={() => setEditor(null)}
        onConfirm={confirmEditor}
      />
    </div>,
    document.body,
  )
}
