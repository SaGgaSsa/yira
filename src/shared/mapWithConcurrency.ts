/** Map items with a bounded number of pending promises while preserving input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const workerCount = Math.max(1, Math.min(
    Number.isFinite(concurrency) ? Math.floor(concurrency) : 1,
    items.length,
  ))
  let nextIndex = 0

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}
