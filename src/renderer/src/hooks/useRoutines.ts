import { useEffect, useState } from 'react'
import type { Routine } from '@shared/routines'

export function useRoutines(): { routines: Routine[]; loaded: boolean } {
  const [routines, setRoutines] = useState<Routine[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const routinesApi = window.electron?.routines
    if (!routinesApi) {
      setLoaded(true)
      return
    }
    let active = true
    let receivedChange = false
    const unsubscribe = routinesApi.onChanged((next) => {
      if (!active) return
      receivedChange = true
      setRoutines(next)
      setLoaded(true)
    })
    routinesApi.list()
      .then((next) => {
        if (!active) return
        // A change event is newer than the initial list response.
        if (!receivedChange) setRoutines(next)
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

  return { routines, loaded }
}
