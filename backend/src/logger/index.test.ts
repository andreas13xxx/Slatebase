import { describe, it, expect, vi } from 'vitest'
import { AppLogger, createLogger } from './index.js'
import type { IConfigService, ServerConfig } from '../config/index.js'
import type { IServerLogStore, LogEntry } from './log-store.js'

function createMockConfigService(logLevel: ServerConfig['logLevel'] = 'info'): IConfigService {
  return {
    getServerConfig: () => ({ logLevel }) as ServerConfig,
  } as IConfigService
}

function createMockLogStore(): IServerLogStore & { entries: LogEntry[] } {
  const entries: LogEntry[] = []
  return {
    entries,
    append: vi.fn(async (entry: LogEntry) => {
      entries.push(entry)
    }),
    query: vi.fn(),
  }
}

describe('AppLogger', () => {
  it('constructs without a log store attached (persistEntry is a no-op)', () => {
    const logger = new AppLogger(createMockConfigService())
    expect(() => logger.info('hello')).not.toThrow()
  })

  it('persists debug/info/warn/error entries once a log store is attached', () => {
    const logger = new AppLogger(createMockConfigService())
    const logStore = createMockLogStore()
    logger.setLogStore(logStore)

    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')

    expect(logStore.entries.map(e => e.level)).toEqual(['debug', 'info', 'warn', 'error'])
    expect(logStore.entries.map(e => e.message)).toEqual(['d', 'i', 'w', 'e'])
  })

  it('includes meta in the persisted entry when provided', () => {
    const logger = new AppLogger(createMockConfigService())
    const logStore = createMockLogStore()
    logger.setLogStore(logStore)

    logger.info('with meta', { userId: '123' })

    expect(logStore.entries[0]?.meta).toEqual({ userId: '123' })
  })

  it('omits meta from the persisted entry when not provided', () => {
    const logger = new AppLogger(createMockConfigService())
    const logStore = createMockLogStore()
    logger.setLogStore(logStore)

    logger.info('no meta')

    expect(logStore.entries[0]).not.toHaveProperty('meta')
  })

  it('sets a timestamp on the persisted entry', () => {
    const logger = new AppLogger(createMockConfigService())
    const logStore = createMockLogStore()
    logger.setLogStore(logStore)

    logger.info('timed')

    expect(logStore.entries[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('silently ignores log store append failures instead of throwing', async () => {
    const logger = new AppLogger(createMockConfigService())
    const logStore: IServerLogStore = {
      append: vi.fn().mockRejectedValue(new Error('disk full')),
      query: vi.fn(),
    }
    logger.setLogStore(logStore)

    expect(() => logger.error('boom')).not.toThrow()
    // Let the rejected promise's .catch() microtask run before the test ends.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(logStore.append).toHaveBeenCalled()
  })
})

describe('createLogger', () => {
  it('creates an AppLogger instance', () => {
    const logger = createLogger(createMockConfigService())
    expect(logger).toBeInstanceOf(AppLogger)
  })
})
