import React from 'react'

export interface WorkspaceSidebarSectionProps {
  title: string
  count: number
  children: React.ReactNode
  className?: string
}

export function WorkspaceSidebarSection({
  title,
  count,
  children,
  className = '',
}: WorkspaceSidebarSectionProps): React.ReactElement {
  return (
    <section className={className}>
      <div className="flex w-full items-center gap-2 px-2 py-2">
        <span className="nd-label min-w-0 flex-1 text-text-secondary">{title}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">{count}</span>
      </div>
      <div className="mt-1 flex flex-col gap-1">{children}</div>
    </section>
  )
}
