import { useEffect, useMemo, useState } from 'react'
import { modPanelKey as panelKey, type ModPanel } from '@shared/modPanels'

function withPanel(current: ReadonlyMap<string, ModPanel>, panel: ModPanel): ReadonlyMap<string, ModPanel> {
  const key = panelKey(panel)
  const existing = current.get(key)
  // A list() response can be older than a change already delivered by onChange.
  if (existing && existing.updatedAt > panel.updatedAt) return current

  const next = new Map(current)
  next.set(key, panel)
  return next
}

/** Panels published by the mods in the given agent terminal tiles, sorted by title. */
export function useModPanels(tileIds: readonly string[]): ModPanel[] {
  const [panels, setPanels] = useState<ReadonlyMap<string, ModPanel>>(() => new Map())

  useEffect(() => {
    const bridge = window.electron.modPanels

    let active = true
    const closedKeys = new Set<string>()

    const unsubscribe = bridge.onChange((change) => {
      if (!active) return

      if (change.type === 'close') {
        const key = panelKey(change.address)
        closedKeys.add(key)
        setPanels((current) => {
          if (!current.has(key)) return current
          const next = new Map(current)
          next.delete(key)
          return next
        })
        return
      }

      if (change.type !== 'upsert') return
      closedKeys.delete(panelKey(change.panel))
      setPanels((current) => withPanel(current, change.panel))
    })

    // Subscribe before reading the snapshot, so changes that happen in between
    // are merged by updatedAt instead of being lost.
    void bridge.list().then((listed) => {
      if (!active) return
      setPanels((current) => {
        let next = current
        for (const panel of listed) {
          if (closedKeys.has(panelKey(panel))) continue
          next = withPanel(next, panel)
        }
        return next
      })
    }).catch(() => undefined)

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return useMemo(() => {
    const ids = new Set(tileIds)
    return [...panels.values()]
      .filter((panel) => ids.has(panel.tileId))
      .sort((left, right) => left.title.localeCompare(right.title))
  }, [panels, tileIds])
}
