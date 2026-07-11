import type { LucideIcon } from 'lucide-react'
import { Terminal, StickyNote, Globe, Clock, Folder, ClipboardList } from 'lucide-react'

export interface TileCreationAvailability {
  canCreateNote: boolean
  canCreateBrowser: boolean
  canCreateTimer: boolean
  canShowFilesCreation: boolean
  canCreateFiles: boolean
  canCreateBoard?: boolean
  boardEnabled: boolean
}

export interface TileCreationSelectorProps extends TileCreationAvailability {
  onCreateTerminal: () => void
  onCreateNote: () => void
  onCreateBrowser: () => void
  onCreateTimer: () => void
  onCreateFiles: () => void
  onCreateBoard: () => void
  boardBadge?: string | null
  boardBadgeTitle?: string
  className?: string
}

export interface TileCreationAction {
  id: 'terminal' | 'note' | 'browser' | 'timer' | 'files' | 'board'
  icon: LucideIcon
  label: string
  title: string
  disabled: boolean
  onClick: () => void
  badge?: string | null
  badgeTitle?: string
}

type TileCreationActionInput = TileCreationAvailability & Partial<Omit<TileCreationSelectorProps, keyof TileCreationAvailability | 'className'>>

const noop = () => {}

export function getTileCreationActions(input: TileCreationActionInput): TileCreationAction[] {
  const actions: TileCreationAction[] = [
    {
      id: 'terminal',
      icon: Terminal,
      label: 'Terminal',
      title: 'New terminal',
      disabled: false,
      onClick: input.onCreateTerminal ?? noop,
    },
  ]

  if (input.canCreateNote) {
    actions.push({
      id: 'note',
      icon: StickyNote,
      label: 'Note',
      title: 'New note',
      disabled: false,
      onClick: input.onCreateNote ?? noop,
    })
  }

  if (input.canCreateBrowser) {
    actions.push({
      id: 'browser',
      icon: Globe,
      label: 'Browser',
      title: 'New browser',
      disabled: false,
      onClick: input.onCreateBrowser ?? noop,
    })
  }

  if (input.canCreateTimer) {
    actions.push({
      id: 'timer',
      icon: Clock,
      label: 'Timer',
      title: 'New timer',
      disabled: false,
      onClick: input.onCreateTimer ?? noop,
    })
  }

  if (input.canShowFilesCreation) {
    actions.push({
      id: 'files',
      icon: Folder,
      label: 'Files',
      title: 'New files',
      disabled: !input.canCreateFiles,
      onClick: input.onCreateFiles ?? noop,
    })
  }

  actions.push({
    id: 'board',
    icon: ClipboardList,
    label: 'Board',
    title: input.boardEnabled ? 'New task' : 'Enable board',
    disabled: input.canCreateBoard === false,
    onClick: input.onCreateBoard ?? noop,
    badge: input.boardBadge,
    badgeTitle: input.boardBadgeTitle,
  })

  return actions
}

export function TileCreationSelector({ className, ...input }: TileCreationSelectorProps): React.ReactElement {
  return (
    <div className={`grid grid-cols-2 gap-2 ${className ?? ''}`}>
      {getTileCreationActions(input).map((action) => {
        const Icon = action.icon

        return (
          <button
            key={action.id}
            className="nd-panel-raised flex h-11 items-center justify-center gap-1.5 rounded-2xl px-2 text-text-secondary transition-colors hover:text-text-display disabled:cursor-not-allowed disabled:opacity-40"
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.title}
          >
            <Icon size={15} />
            <span className="nd-label">{action.label}</span>
            {action.badge && (
              <span
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-text-display px-1.5 font-mono text-[10px] leading-none text-text-display"
                title={action.badgeTitle}
              >
                {action.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
