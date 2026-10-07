import React from 'react'
import { ChevronDown } from 'lucide-react'

export interface WorkspaceSidebarSectionProps {
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
  className?: string
}

export function WorkspaceSidebarSection({
  title,
  count,
  expanded,
  onToggle,
  children,
  className = '',
}: WorkspaceSidebarSectionProps): React.ReactElement {
  return (
    <section className={className}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-hover-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interactive)]"
      >
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={`shrink-0 text-text-secondary transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
        <span className="nd-label min-w-0 flex-1 text-text-secondary">{title}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">{count}</span>
      </button>
      {expanded && <div className="mt-1 flex flex-col gap-1">{children}</div>}
    </section>
  )
}
