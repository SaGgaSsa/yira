export type WindowBufferFlush = () => void | Promise<void>

export interface WindowBufferRegistry {
  register: (key: string, flush: WindowBufferFlush) => () => void
  flush: () => Promise<void>
}

export function createWindowBufferRegistry(): WindowBufferRegistry {
  const callbacks = new Map<string, WindowBufferFlush>()

  return {
    register(key, flush) {
      callbacks.set(key, flush)
      return () => {
        if (callbacks.get(key) === flush) callbacks.delete(key)
      }
    },
    async flush() {
      await Promise.all([...callbacks.values()].map((callback) => callback()))
    },
  }
}

export const windowBufferRegistry = createWindowBufferRegistry()
