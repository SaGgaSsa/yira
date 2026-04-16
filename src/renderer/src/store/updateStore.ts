import { create } from 'zustand'
import type { UpdateState } from '@shared/types'

type UpdateStore = UpdateState & {
  initialized: boolean
  initialize: () => Promise<void>
  checkForUpdates: () => Promise<void>
  installUpdate: () => Promise<void>
}

const DEFAULT_UPDATE_STATE: UpdateState = {
  status: 'idle',
  currentVersion: '0.0.0',
  availableVersion: null,
  progressPercent: null,
  message: null,
}

let unsubscribeFromUpdates: (() => void) | null = null

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  ...DEFAULT_UPDATE_STATE,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return

    const snapshot = await window.electron.updates.getState()
    set({
      ...snapshot,
      initialized: true,
    })

    unsubscribeFromUpdates?.()
    unsubscribeFromUpdates = window.electron.updates.onStateChange((nextState) => {
      set(nextState)
    })
  },

  checkForUpdates: async () => {
    const nextState = await window.electron.updates.check()
    set(nextState)
  },

  installUpdate: async () => {
    await window.electron.updates.install()
  },
}))
