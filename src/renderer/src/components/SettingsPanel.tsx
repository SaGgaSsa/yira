import React, { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useSettingsStore } from '@/store/settingsStore'
import { X, Monitor, Moon, Sun, Type, Grid3X3, Globe, Code2 } from 'lucide-react'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  onOpenJsonEditor: () => void
}

export function SettingsPanel({ open, onClose, onOpenJsonEditor }: SettingsPanelProps): React.ReactElement {
  const appearance = useSettingsStore((s) => s.appearance)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const showGrid = useSettingsStore((s) => s.showGrid)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const gridSize = useSettingsStore((s) => s.gridSize)
  const browserHomeUrl = useSettingsStore((s) => s.browser.homeUrl)
  const setAppearance = useSettingsStore((s) => s.setAppearance)
  const setFontSize = useSettingsStore((s) => s.setFontSize)
  const setShowGrid = useSettingsStore((s) => s.setShowGrid)
  const setSnapToGrid = useSettingsStore((s) => s.setSnapToGrid)
  const setGridSize = useSettingsStore((s) => s.setGridSize)
  const setBrowserHomeUrl = useSettingsStore((s) => s.setBrowserHomeUrl)

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null as unknown as React.ReactElement

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        className="w-[480px] max-h-[80vh] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
          <button
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-hover-bg transition-colors"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Appearance */}
          <section>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Appearance
            </h3>
            <div className="flex gap-2">
              {([
                { value: 'dark' as const, icon: Moon, label: 'Dark' },
                { value: 'light' as const, icon: Sun, label: 'Light' },
                { value: 'system' as const, icon: Monitor, label: 'System' },
              ]).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  className={`flex-1 flex flex-col items-center gap-2 px-3 py-3 rounded-lg border text-xs font-medium transition-colors ${
                    appearance === value
                      ? 'border-accent bg-active-bg text-accent'
                      : 'border-border bg-bg-secondary text-text-secondary hover:border-border-hover hover:bg-hover-bg'
                  }`}
                  onClick={() => setAppearance(value)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Font Size */}
          <section>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3 flex items-center gap-2">
              <Type size={14} />
              <span>Font Size</span>
            </h3>
            <div className="flex gap-2">
              {([
                { value: 'small' as const, label: 'Small', preview: '14px' },
                { value: 'medium' as const, label: 'Medium', preview: '16px' },
                { value: 'large' as const, label: 'Large', preview: '18px' },
              ]).map(({ value, label, preview }) => (
                <button
                  key={value}
                  className={`flex-1 flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                    fontSize === value
                      ? 'border-accent bg-active-bg text-accent'
                      : 'border-border bg-bg-secondary text-text-secondary hover:border-border-hover hover:bg-hover-bg'
                  }`}
                  onClick={() => setFontSize(value)}
                >
                  <span style={{ fontSize: preview }}>{label}</span>
                  <span className="text-[10px] text-text-muted">{preview}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <Grid3X3 size={14} />
              <span>Canvas</span>
            </h3>
            <div className="space-y-3 rounded-lg border border-border bg-bg-secondary p-3">
              <label className="flex items-center justify-between gap-4 text-sm text-text-primary">
                <span>Show grid</span>
                <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-4 text-sm text-text-primary">
                <span>Snap to grid</span>
                <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
              </label>
              <label className="block text-sm text-text-primary">
                <span className="mb-2 block">Grid size</span>
                <input
                  className="w-full rounded border border-border bg-bg-primary px-3 py-2 text-sm outline-none"
                  type="number"
                  min={8}
                  max={80}
                  step={2}
                  value={gridSize}
                  onChange={(event) => setGridSize(Number(event.target.value))}
                />
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <Globe size={14} />
              <span>Browser</span>
            </h3>
            <div className="rounded-lg border border-border bg-bg-secondary p-3">
              <label className="block text-sm text-text-primary">
                <span className="mb-2 block">Home URL</span>
                <input
                  className="w-full rounded border border-border bg-bg-primary px-3 py-2 text-sm outline-none"
                  value={browserHomeUrl}
                  onChange={(event) => setBrowserHomeUrl(event.target.value)}
                  spellCheck={false}
                />
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <Code2 size={14} />
              <span>Advanced</span>
            </h3>
            <button
              className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-3 text-left text-sm text-text-primary transition-colors hover:bg-hover-bg"
              onClick={onOpenJsonEditor}
            >
              Open Raw Canvas JSON Editor
            </button>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
