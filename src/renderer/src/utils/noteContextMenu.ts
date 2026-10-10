import type { MenuItem } from '../components/ContextMenu'

export interface NoteContextMenuInput {
  translate?: (key: string) => string
  selectedText: string
  editable: boolean
  onCopySelection: () => void
  onCutSelection: () => void
  onPaste: () => void
  onSelectAll: () => void
  /** Opens the new-prompt dialog with the selected text. */
  onSendToPrompt?: () => void
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
    ...(input.onSendToPrompt ? [
      { label: '', divider: true },
      {
        label: label('ui.sendToPrompt', 'Send to new prompt'),
        disabled: !input.selectedText,
        action: input.onSendToPrompt,
      },
    ] : []),
  ]
}
