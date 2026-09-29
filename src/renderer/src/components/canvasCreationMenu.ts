import { Terminal, StickyNote, Globe, Clock } from 'lucide-react'
import type { ShellProfileId } from '@shared/types'
import type { MenuItem } from './ContextMenu'

export interface CanvasCreationMenuInput {
  translate?: (key: string) => string
  onCreateTerminal: (profileId: ShellProfileId) => void
  onCreateRichNote: () => void
  onCreateMarkdownNote: () => void
  onCreateBrowser: () => void
  onCreateTimer: () => void
  canCreateNote: boolean
  canCreateBrowser: boolean
  canCreateTimer: boolean
  profiles: Array<{ id: ShellProfileId; label: string; available: boolean }>
}

export function getCanvasCreationMenuItems(input: CanvasCreationMenuInput): MenuItem[] {
  const label = (key: string, fallback: string): string => input.translate?.(key) ?? fallback
  return [
    {
      label: label('ui.newTerminal', 'New Terminal'),
      icon: Terminal,
      submenu: input.profiles.map((profile) => ({
        label: profile.label,
        disabled: !profile.available,
        action: () => input.onCreateTerminal(profile.id),
      })),
    },
    ...(input.canCreateNote ? [{
      label: label('ui.newNote', 'New Note'),
      icon: StickyNote,
      submenu: [
        { label: label('ui.richNote', 'Rich Note'), action: input.onCreateRichNote },
        { label: label('ui.markdownNote', 'Markdown Note'), action: input.onCreateMarkdownNote },
      ],
    }] : []),
    ...(input.canCreateBrowser ? [{ label: label('ui.newBrowser', 'New Browser'), icon: Globe, action: input.onCreateBrowser }] : []),
    ...(input.canCreateTimer ? [{ label: label('ui.newTimer', 'New Timer'), icon: Clock, action: input.onCreateTimer }] : []),
  ]
}
