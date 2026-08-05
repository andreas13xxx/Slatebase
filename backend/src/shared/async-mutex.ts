// AsyncMutex — Promise-based mutex for serializing async read-modify-write operations

/**
 * Promise-based mutex for serializing async read-modify-write operations.
 * Ensures only one async flow executes the critical section at a time.
 * Safe in single-threaded Node.js — prevents interleaving of async operations.
 */
export class AsyncMutex {
  private queue: Promise<void> = Promise.resolve()

  /**
   * Executes the given function while holding the mutex.
   * Subsequent calls are queued and execute in order.
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void
    const next = new Promise<void>((resolve) => { release = resolve })

    const prev = this.queue
    this.queue = next

    await prev
    try {
      return await fn()
    } finally {
      release!()
    }
  }
}
