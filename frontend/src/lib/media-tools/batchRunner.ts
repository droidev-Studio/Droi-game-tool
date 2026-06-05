export type BatchProgress = {
  done: number
  total: number
  batchIndex: number
  batchCount: number
}

export type RunInBatchesOptions = {
  batchSize?: number
  onProgress?: (progress: BatchProgress) => void
  shouldCancel?: () => boolean
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

export async function runInBatches<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  options: RunInBatchesOptions = {},
): Promise<R[]> {
  const batchSize = Math.max(1, options.batchSize ?? 3)
  const batchCount = Math.ceil(items.length / batchSize)
  const results: R[] = new Array(items.length)
  let done = 0

  for (let start = 0; start < items.length; start += batchSize) {
    if (options.shouldCancel?.()) break
    const batchIndex = Math.floor(start / batchSize)
    const batch = items.slice(start, start + batchSize)
    const batchResults = await Promise.all(batch.map((item, localIndex) => worker(item, start + localIndex)))
    batchResults.forEach((result, localIndex) => {
      results[start + localIndex] = result
    })
    done += batch.length
    options.onProgress?.({ done, total: items.length, batchIndex: batchIndex + 1, batchCount })
    await yieldToBrowser()
  }

  return results.slice(0, done)
}

export async function runSequentialChunks<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  options: RunInBatchesOptions = {},
): Promise<R[]> {
  const batchSize = Math.max(1, options.batchSize ?? 3)
  const batchCount = Math.ceil(items.length / batchSize)
  const results: R[] = []

  for (let index = 0; index < items.length; index += 1) {
    if (options.shouldCancel?.()) break
    const item = items[index]
    results[index] = await worker(item, index)
    const done = index + 1
    if (done % batchSize === 0 || done === items.length) {
      options.onProgress?.({
        done,
        total: items.length,
        batchIndex: Math.ceil(done / batchSize),
        batchCount,
      })
      await yieldToBrowser()
    }
  }

  return results
}
