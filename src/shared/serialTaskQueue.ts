export interface SerialTaskQueue {
  run: <T>(task: () => T | Promise<T>) => Promise<T>
}

export function createSerialTaskQueue(): SerialTaskQueue {
  let tail = Promise.resolve()

  return {
    run<T>(task: () => T | Promise<T>): Promise<T> {
      const result = tail.then(task)
      tail = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
  }
}
