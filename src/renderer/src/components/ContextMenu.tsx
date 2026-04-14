import React, { useEffect, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Terminal, StickyNote, Globe, LayoutGrid, ChevronRight, LucideIcon } from 'lucide-react'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  action?: () => void
  danger?: boolean
  disabled?: boolean
  divider?: boolean
  submenu?: Omit<MenuItem, 'submenu'>[]
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

const ICON_SIZE = 14

function MenuItems({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [activeSubmenu, setActiveSubmenu] = useState<number | null>(null)
  const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number } | null>(null)
  const [submenuItems, setSubmenuItems] = useState<MenuItem[]>([])
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  const openSubmenu = (index: number, item: MenuItem) => {
    if (!item.submenu || item.submenu.length === 0) {
      setActiveSubmenu(null)
      setSubmenuPos(null)
      return
    }
    const btn = buttonRefs.current[index]
    if (btn) {
      const rect = btn.getBoundingClientRect()
      setSubmenuPos({ x: rect.right, y: rect.top })
    } else {
      setSubmenuPos(null)
    }
    setActiveSubmenu(index)
    setSubmenuItems(item.submenu!)
  }

  return (
    <>
      {items.map((item, i) => {
        if (item.divider) {
          return (
            <div
              key={i}
              className="mx-2 my-1"
              style={{ borderTop: '1px solid var(--border-color)' }}
            />
          )
        }

        const Icon = item.icon
        const hasSubmenu = item.submenu && item.submenu.length > 0

        return (
          <div key={i} className="relative">
            <button
              ref={(el) => { buttonRefs.current[i] = el }}
              className="w-full text-left flex items-center justify-between gap-2.5 px-4 py-3 text-sm transition-colors hover:bg-hover-bg"
              style={{
                color: item.disabled
                  ? 'var(--text-disabled)'
                  : item.danger
                    ? 'var(--danger)'
                    : 'var(--text-primary)',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
              }}
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation()
                if (hasSubmenu) {
                  if (activeSubmenu === i) {
                    setActiveSubmenu(null)
                    setSubmenuPos(null)
                  } else {
                    openSubmenu(i, item)
                  }
                  return
                }
                item.action?.()
                onClose()
              }}
              onMouseEnter={() => {
                if (hasSubmenu) openSubmenu(i, item)
              }}
            >
              <span className="flex items-center gap-2.5">
                {Icon && <Icon size={ICON_SIZE} style={{ flexShrink: 0 }} />}
                <span className="nd-label truncate">{item.label}</span>
              </span>
              {hasSubmenu && <ChevronRight size={12} className="text-text-muted shrink-0" />}
            </button>
          </div>
        )
      })}

      {/* Submenu portal — rendered outside the backdrop to avoid click-through */}
      {activeSubmenu !== null && submenuPos && createPortal(
        <div
          className="fixed overflow-hidden rounded-2xl py-1 z-[10002]"
          style={{
            left: submenuPos.x,
            top: submenuPos.y,
            minWidth: 180,
            maxWidth: 240,
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-visible)',
          }}
        >
          {submenuItems.map((sub, j) => {
            const SubIcon = sub.icon
            return (
              <button
                key={j}
                className="w-full text-left flex items-center gap-2.5 px-4 py-3 text-sm transition-colors hover:bg-hover-bg"
                style={{
                  color: sub.disabled
                    ? 'var(--text-disabled)'
                    : sub.danger
                      ? 'var(--danger)'
                      : 'var(--text-primary)',
                  cursor: sub.disabled ? 'not-allowed' : 'pointer',
                }}
                disabled={sub.disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  sub.action?.()
                  onClose()
                }}
              >
                {SubIcon && <SubIcon size={ICON_SIZE} style={{ flexShrink: 0 }} />}
                <span className="nd-label flex-1 truncate">{sub.label}</span>
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null)
  const [clamped, setClamped] = useState({ x: 0, y: 0 })

  // Clamp position to viewport
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    setClamped({
      x: Math.min(x, vw - rect.width - 8),
      y: Math.min(y, vh - rect.height - 8),
    })
  }, [x, y])

  // Dismiss on outside click / Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  return createPortal(
    <div
      className="fixed inset-0 z-[10000]"
      onClick={handleBackdrop}
    >
      <div
        ref={menuRef}
        className="absolute overflow-hidden rounded-2xl py-1"
        style={{
          left: clamped.x,
          top: clamped.y,
          minWidth: 200,
          maxWidth: 280,
          background: 'var(--surface-raised)',
          border: '1px solid var(--border-visible)',
        }}
      >
        <MenuItems items={items} onClose={onClose} />
      </div>
    </div>,
    document.body,
  )
}
