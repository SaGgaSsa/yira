import { useState, useEffect, useCallback } from 'react'
import type { LayoutTemplate } from '../../../shared/types'

const TEMPLATES_PATH = '~/.contex/layout-templates.json'

interface LayoutTemplatesFile {
  templates: LayoutTemplate[]
}

export function useLayoutTemplates() {
  const [templates, setTemplates] = useState<LayoutTemplate[]>([])
  const [loading, setLoading] = useState(true)

  // Load
  useEffect(() => {
    const load = async () => {
      try {
        const stat = await window.electron.fs.stat(TEMPLATES_PATH).catch(() => null)
        if (!stat) { setLoading(false); return }
        const raw = await window.electron.fs.readFile(TEMPLATES_PATH)
        const data = JSON.parse(raw) as LayoutTemplatesFile
        setTemplates(data.templates ?? [])
      } catch { /* first run, no file */ }
      setLoading(false)
    }
    load()
  }, [])

  const persist = useCallback(async (next: LayoutTemplate[]) => {
    setTemplates(next)
    const data: LayoutTemplatesFile = { templates: next }
    await window.electron.fs.writeFile(TEMPLATES_PATH, JSON.stringify(data, null, 2))
  }, [])

  const addTemplate = useCallback(async (t: LayoutTemplate) => {
    const next = [...templates, t]
    await persist(next)
    return t
  }, [templates, persist])

  const updateTemplate = useCallback(async (id: string, patch: Partial<LayoutTemplate>) => {
    const next = templates.map(t => t.id === id ? { ...t, ...patch } : t)
    await persist(next)
  }, [templates, persist])

  const deleteTemplate = useCallback(async (id: string) => {
    const next = templates.filter(t => t.id !== id)
    await persist(next)
  }, [templates, persist])

  return { templates, loading, addTemplate, updateTemplate, deleteTemplate }
}
