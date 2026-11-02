import { useEffect, useState } from 'react'
import type { BotDefinition } from '@shared/bots'

export function useBots(): { bots: BotDefinition[]; loaded: boolean } {
  const [bots, setBots] = useState<BotDefinition[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    let receivedChange = false
    const unsubscribe = window.electron.bots.onChanged((next) => {
      if (!active) return
      receivedChange = true
      setBots(next)
      setLoaded(true)
    })
    window.electron.bots.list()
      .then((next) => {
        if (!active) return
        // A change event is newer than the initial list response.
        if (!receivedChange) setBots(next)
        setLoaded(true)
      })
      .catch(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return { bots, loaded }
}
