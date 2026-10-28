import { create } from 'zustand'
import type { CommandPaletteRecent } from '@/utils/commandPalette'

const COMMAND_PALETTE_RECENTS_LIMIT = 12

interface CommandPaletteStore {
  /** Newest first, unique by key, at most 12. */
  recents: CommandPaletteRecent[]
  recordUse: (recent: CommandPaletteRecent) => void
  reset: () => void
}

export const useCommandPaletteStore = create<CommandPaletteStore>((set, get) => ({
  recents: [],

  recordUse: (recent) => {
    set({
      recents: [
        recent,
        ...get().recents.filter((entry) => entry.key !== recent.key),
      ].slice(0, COMMAND_PALETTE_RECENTS_LIMIT),
    })
  },

  reset: () => {
    set({ recents: [] })
  },
}))
