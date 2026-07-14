import type { LucideIcon } from 'lucide-react'

export interface TileCreationMenuItem {
  id: string
  icon: LucideIcon
  label: string
  detail?: string
  title?: string
  disabled?: boolean
  onClick: () => void
}

interface TileCreationMenuProps {
  title: string
  items: TileCreationMenuItem[]
}

export function TileCreationMenu({ title, items }: TileCreationMenuProps): React.ReactElement {
  return (
    <div className="nd-panel-raised overflow-hidden rounded-2xl" style={{ backdropFilter: 'none' }}>
      <div className="border-b border-border px-4 py-3">
        <div className="nd-label text-text-secondary">{title}</div>
      </div>
      <div className="py-2">
        {items.map((item) => {
          const Icon = item.icon

          return (
            <button
              key={item.id}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover-bg"
              style={{
                color: item.disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
              }}
              disabled={item.disabled}
              onClick={item.onClick}
              title={item.title}
            >
              <Icon size={15} />
              <span className="flex-1 text-sm">{item.label}</span>
              {item.detail && <span className="nd-caption text-text-secondary">{item.detail}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
