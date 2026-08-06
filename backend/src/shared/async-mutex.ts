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

/**
 * A registry of `AsyncMutex` instances keyed by string (e.g. a vault ID or
 * file path). Use this when a critical section spans more than a single
 * read-modify-write of one file — e.g. a filesystem move plus an index
 * update that must not interleave with a concurrent operation on the same
 * key. Each key's mutex is created lazily and cached for the lifetime of
 * the registry; unrelated keys never block each other.
 */
export class KeyedMutex {
  private readonly mutexes = new Map<string, AsyncMutex>()

  private mutexFor(key: string): AsyncMutex {
    let mutex = this.mutexes.get(key)
    if (!mutex) {
      mutex = new AsyncMutex()
      this.mutexes.set(key, mutex)
    }
    return mutex
  }

  /**
   * Executes `fn` while holding the mutex for `key`.
   * Concurrent calls with the same key are queued and execute in order;
   * calls with different keys run independently.
   */
  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return this.mutexFor(key).runExclusive(fn)
  }
}
