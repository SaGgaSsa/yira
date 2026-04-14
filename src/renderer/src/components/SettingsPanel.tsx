import React, { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Monitor, Moon, Sun, Type, Grid3X3, Globe, Code2 } from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'

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
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80" onClick={handleBackdropClick}>
      <div className="w-[560px] max-h-[86vh] overflow-hidden rounded-[24px] border border-border-visible bg-bg-secondary">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <div className="nd-label text-text-secondary">Settings Matrix</div>
            <h2 className="mt-2 text-xl text-text-display">Yira system controls</h2>
          </div>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[calc(86vh-88px)] space-y-7 overflow-y-auto px-6 py-6">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Monitor size={14} className="text-text-secondary" />
              <span className="nd-label text-text-secondary">Appearance</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([
                { value: 'dark' as const, icon: Moon, label: 'Dark' },
                { value: 'light' as const, icon: Sun, label: 'Light' },
                { value: 'system' as const, icon: Monitor, label: 'System' },
              ]).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  className={`rounded-[20px] border px-4 py-4 text-left transition-colors ${
                    appearance === value ? 'border-text-display bg-bg-tertiary' : 'border-border bg-bg-secondary'
                  }`}
                  onClick={() => setAppearance(value)}
                >
                  <div className="flex items-center justify-between">
                    <Icon size={16} className={appearance === value ? 'text-text-display' : 'text-text-secondary'} />
                    {appearance === value && <span className="nd-caption text-text-secondary">[ ACTIVE ]</span>}
                  </div>
                  <div className="nd-label mt-6 text-text-secondary">{label}</div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Type size={14} className="text-text-secondary" />
              <span className="nd-label text-text-secondary">Density</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([
                { value: 'small' as const, label: 'Small', preview: '14PX' },
                { value: 'medium' as const, label: 'Medium', preview: '16PX' },
                { value: 'large' as const, label: 'Large', preview: '18PX' },
              ]).map(({ value, label, preview }) => (
                <button
                  key={value}
                  className={`rounded-[20px] border px-4 py-4 text-left transition-colors ${
                    fontSize === value ? 'border-text-display bg-bg-tertiary' : 'border-border bg-bg-secondary'
                  }`}
                  onClick={() => setFontSize(value)}
                >
                  <div className="font-mono text-lg text-text-display">{preview}</div>
                  <div className="nd-label mt-4 text-text-secondary">{label}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
            <div className="mb-4 flex items-center gap-2">
              <Grid3X3 size={14} className="text-text-secondary" />
              <span className="nd-label text-text-secondary">Canvas</span>
            </div>
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-4">
                <span className="nd-label text-text-secondary">Grid visible</span>
                <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
              </label>
              <label className="flex items-center justify-between gap-4">
                <span className="nd-label text-text-secondary">Snap enabled</span>
                <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
              </label>
              <label className="block">
                <span className="nd-label mb-2 block text-text-secondary">Grid size</span>
                <input
                  className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
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

          <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
            <div className="mb-4 flex items-center gap-2">
              <Globe size={14} className="text-text-secondary" />
              <span className="nd-label text-text-secondary">Browser</span>
            </div>
            <label className="block">
              <span className="nd-label mb-2 block text-text-secondary">Home URL</span>
              <input
                className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
                value={browserHomeUrl}
                onChange={(event) => setBrowserHomeUrl(event.target.value)}
                spellCheck={false}
              />
            </label>
          </section>

          <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
            <div className="mb-4 flex items-center gap-2">
              <Code2 size={14} className="text-text-secondary" />
              <span className="nd-label text-text-secondary">Advanced</span>
            </div>
            <button
              className="flex w-full items-center justify-between rounded-full border border-border-visible px-4 py-3 text-left transition-colors hover:border-text-secondary"
              onClick={onOpenJsonEditor}
            >
              <span className="nd-label text-text-display">Open raw canvas JSON</span>
              <span className="nd-caption text-text-secondary">[ EDIT ]</span>
            </button>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
