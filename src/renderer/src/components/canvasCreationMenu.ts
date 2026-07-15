import { Terminal, StickyNote, Globe, Clock } from 'lucide-react'
import type { ShellProfileId } from '@shared/types'
import type { MenuItem } from './ContextMenu'

export interface CanvasCreationMenuInput {
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
  return [
    {
      label: 'New Terminal',
      icon: Terminal,
      submenu: input.profiles.map((profile) => ({
        label: profile.label,
        disabled: !profile.available,
        action: () => input.onCreateTerminal(profile.id),
      })),
    },
    ...(input.canCreateNote ? [{
      label: 'New Note',
      icon: StickyNote,
      submenu: [
        { label: 'Rich Note', action: input.onCreateRichNote },
        { label: 'Markdown Note', action: input.onCreateMarkdownNote },
      ],
    }] : []),
    ...(input.canCreateBrowser ? [{ label: 'New Browser', icon: Globe, action: input.onCreateBrowser }] : []),
    ...(input.canCreateTimer ? [{ label: 'New Timer', icon: Clock, action: input.onCreateTimer }] : []),
  ]
}
