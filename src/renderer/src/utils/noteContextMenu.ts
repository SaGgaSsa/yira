import type { MenuItem } from '../components/ContextMenu'

export interface NoteContextMenuInput {
  translate?: (key: string) => string
  selectedText: string
  editable: boolean
  agentTargets?: Array<{ id: string; label: string }>
  onCopySelection: () => void
  onCutSelection: () => void
  onPaste: () => void
  onSelectAll: () => void
  onSendToAgent?: (id: string) => void
}

export function buildNoteContextMenuItems(input: NoteContextMenuInput): MenuItem[] {
  const label = (key: string, fallback: string): string => input.translate?.(key) ?? fallback

  return [
    {
      label: label('ui.copyText', 'Copy'),
      disabled: !input.selectedText,
      action: input.onCopySelection,
    },
    {
      label: label('ui.cut', 'Cut'),
      disabled: !input.editable || !input.selectedText,
      action: input.onCutSelection,
    },
    {
      label: label('ui.paste', 'Paste'),
      disabled: !input.editable,
      action: input.onPaste,
    },
    {
      label: label('ui.selectAll', 'Select All'),
      action: input.onSelectAll,
    },
    ...(input.onSendToAgent ? [
      { label: '', divider: true },
      input.agentTargets?.length
        ? {
            label: label('ui.sendToAgent', 'Send to agent'),
            disabled: !input.selectedText,
            submenu: !input.selectedText ? undefined : input.agentTargets.map((target) => ({
              label: target.label,
              action: () => input.onSendToAgent?.(target.id),
            })),
          }
        : {
            label: label('ui.noAgentsInWorkspace', 'No agents in this workspace'),
            disabled: true,
          },
    ] : []),
  ]
}
