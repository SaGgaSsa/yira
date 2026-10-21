import React, { useCallback, useMemo, useState } from 'react'
import { modPanelKey as panelKey } from '@shared/modPanels'
import type { TileState } from '@shared/types'
import { useModPanels } from '@/hooks/useModPanels'
import { ModPanelTree } from './ModPanelTree'

interface WorkspaceModPanelsProps {
  tiles: TileState[]
  onFocusTile: (tileId: string) => void
}

function terminalLabel(tile: TileState | undefined): string {
  return tile?.label?.trim() || 'Terminal'
}

export function WorkspaceModPanels({ tiles, onFocusTile }: WorkspaceModPanelsProps): React.ReactElement {
  const terminalTiles = useMemo(() => tiles.filter((tile) => tile.type === 'terminal'), [tiles])
  const tileIds = useMemo(() => terminalTiles.map((tile) => tile.id), [terminalTiles])
  const panels = useModPanels(tileIds)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selectedPanel = panels.find((panel) => panelKey(panel) === selectedKey) ?? panels[0] ?? null
  const terminals = useMemo(
    () => new Map(terminalTiles.map((tile) => [tile.id, tile])),
    [terminalTiles],
  )

  const handlePress = useCallback((key: string) => {
    if (!selectedPanel) return

    void window.electron.modPanels.press({
      tileId: selectedPanel.tileId,
      plugin: selectedPanel.plugin,
      id: selectedPanel.id,
      key,
    }).catch(() => undefined)
  }, [selectedPanel])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {panels.length === 0 ? (
        <div className="p-3 text-sm text-text-secondary">
          <p>
            No mod panels yet. Claude Code mods running in this workspace's terminals can publish
            panels here with the Yira mod kit.
          </p>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border p-2">
            {panels.map((panel) => {
              const key = panelKey(panel)
              const selected = selectedPanel === panel
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected}
                  className={`flex max-w-48 shrink-0 flex-col rounded-lg border px-2.5 py-1.5 text-left transition-colors ${selected ? 'border-border-visible bg-active-bg' : 'border-transparent hover:bg-hover-bg'}`}
                  onClick={() => setSelectedKey(key)}
                >
                  <span className={`truncate text-xs ${selected ? 'text-text-display' : 'text-text-secondary'}`}>
                    {panel.title}
                  </span>
                  <span className="truncate text-[10px] text-text-secondary">
                    {panel.plugin} · {terminalLabel(terminals.get(panel.tileId))}
                  </span>
                </button>
              )
            })}
          </div>
          {selectedPanel && (
            <>
              <div className="min-h-0 flex-1 overflow-auto p-3">
                <ModPanelTree node={selectedPanel.tree} onPress={handlePress} />
              </div>
              <div className="shrink-0 border-t border-border px-3 py-2">
                <button
                  type="button"
                  className="text-xs text-text-secondary transition-colors hover:text-text-display hover:underline"
                  onClick={() => onFocusTile(selectedPanel.tileId)}
                >
                  Go to terminal
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
