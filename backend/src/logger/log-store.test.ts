import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, appendFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ServerLogStore } from './log-store.js'
import type { LogEntry } from './log-store.js'

describe('ServerLogStore', () => {
  let dataDir: string
  let store: ServerLogStore

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'log-store-test-'))
    store = new ServerLogStore(dataDir)
  })

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true })
  })

  describe('append', () => {
    it('writes a JSONL line to the daily log file', async () => {
      const entry: LogEntry = { timestamp: '2026-01-15T10:00:00.000Z', level: 'info', message: 'hello' }
      await store.append(entry)

      const content = await readFile(path.join(dataDir, 'logs', '2026-01-15.jsonl'), 'utf-8')
      const parsed = JSON.parse(content.trim()) as LogEntry
      expect(parsed).toEqual(entry)
    })

    it('appends multiple entries to the same daily file, one per line', async () => {
      await store.append({ timestamp: '2026-01-15T10:00:00.000Z', level: 'info', message: 'first' })
      await store.append({ timestamp: '2026-01-15T11:00:00.000Z', level: 'warn', message: 'second' })

      const content = await readFile(path.join(dataDir, 'logs', '2026-01-15.jsonl'), 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines).toHaveLength(2)
    })

    it('redacts sensitive meta fields', async () => {
      await store.append({
        timestamp: '2026-01-15T10:00:00.000Z',
        level: 'info',
        message: 'login',
        meta: { username: 'alice', password: 'hunter2', token: 'abc123' },
      })

      const content = await readFile(path.join(dataDir, 'logs', '2026-01-15.jsonl'), 'utf-8')
      const parsed = JSON.parse(content.trim()) as LogEntry
      expect(parsed.meta).toEqual({ username: 'alice', password: '[REDACTED]', token: '[REDACTED]' })
    })

    it('redacts sensitive fields nested inside meta objects', async () => {
      await store.append({
        timestamp: '2026-01-15T10:00:00.000Z',
        level: 'info',
        message: 'nested',
        meta: { request: { authorization: 'Bearer xyz', path: '/api/x' } },
      })

      const content = await readFile(path.join(dataDir, 'logs', '2026-01-15.jsonl'), 'utf-8')
      const parsed = JSON.parse(content.trim()) as LogEntry
      expect(parsed.meta).toEqual({ request: { authorization: '[REDACTED]', path: '/api/x' } })
    })

    it('omits the meta field entirely when meta is an empty object', async () => {
      await store.append({ timestamp: '2026-01-15T10:00:00.000Z', level: 'info', message: 'no meta', meta: {} })

      const content = await readFile(path.join(dataDir, 'logs', '2026-01-15.jsonl'), 'utf-8')
      const parsed = JSON.parse(content.trim()) as LogEntry
      expect(parsed.meta).toBeUndefined()
    })
  })

  describe('query', () => {
    async function seed(entries: LogEntry[]): Promise<void> {
      for (const entry of entries) {
        await store.append(entry)
      }
    }

    it('returns an empty paginated result when no log files exist yet', async () => {
      const result = await store.query({ page: 1, pageSize: 20 })
      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 })
    })

    it('returns entries sorted by timestamp descending', async () => {
      await seed([
        { timestamp: '2026-01-15T10:00:00.000Z', level: 'info', message: 'first' },
        { timestamp: '2026-01-15T12:00:00.000Z', level: 'info', message: 'third' },
        { timestamp: '2026-01-15T11:00:00.000Z', level: 'info', message: 'second' },
      ])

      const result = await store.query({ page: 1, pageSize: 20 })
      expect(result.items.map(e => e.message)).toEqual(['third', 'second', 'first'])
      expect(result.total).toBe(3)
    })

    it('filters by minimum level', async () => {
      await seed([
        { timestamp: '2026-01-15T10:00:00.000Z', level: 'debug', message: 'd' },
        { timestamp: '2026-01-15T10:01:00.000Z', level: 'warn', message: 'w' },
        { timestamp: '2026-01-15T10:02:00.000Z', level: 'error', message: 'e' },
      ])

      const result = await store.query({ level: 'warn', page: 1, pageSize: 20 })
      expect(result.items.map(e => e.message).sort()).toEqual(['e', 'w'])
    })

    it('filters by date range', async () => {
      await seed([
        { timestamp: '2026-01-14T10:00:00.000Z', level: 'info', message: 'too early' },
        { timestamp: '2026-01-15T10:00:00.000Z', level: 'info', message: 'in range' },
        { timestamp: '2026-01-16T10:00:00.000Z', level: 'info', message: 'too late' },
      ])

      const result = await store.query({
        startDate: '2026-01-15T00:00:00.000Z',
        endDate: '2026-01-15T23:59:59.999Z',
        page: 1,
        pageSize: 20,
      })
      expect(result.items.map(e => e.message)).toEqual(['in range'])
    })

    it('filters by case-insensitive full-text search on the message', async () => {
      await seed([
        { timestamp: '2026-01-15T10:00:00.000Z', level: 'info', message: 'Vault deleted' },
        { timestamp: '2026-01-15T10:01:00.000Z', level: 'info', message: 'User created' },
      ])

      const result = await store.query({ search: 'vault', page: 1, pageSize: 20 })
      expect(result.items.map(e => e.message)).toEqual(['Vault deleted'])
    })

    it('paginates results and clamps pageSize to the 1-100 range', async () => {
      await seed(
        Array.from({ length: 5 }, (_, i) => ({
          timestamp: `2026-01-15T10:0${i}:00.000Z`,
          level: 'info' as const,
          message: `entry-${i}`,
        }))
      )

      const result = await store.query({ page: 2, pageSize: 2 })
      expect(result.total).toBe(5)
      expect(result.pageSize).toBe(2)
      expect(result.totalPages).toBe(3)
      expect(result.items).toHaveLength(2)
    })

    it('clamps an out-of-range page number to the last valid page', async () => {
      await seed([{ timestamp: '2026-01-15T10:00:00.000Z', level: 'info', message: 'only one' }])

      const result = await store.query({ page: 99, pageSize: 20 })
      expect(result.page).toBe(1)
      expect(result.items).toHaveLength(1)
    })

    it('skips malformed JSON lines without throwing', async () => {
      await mkdir(path.join(dataDir, 'logs'), { recursive: true })
      const filePath = path.join(dataDir, 'logs', '2026-01-15.jsonl')
      await appendFile(filePath, 'not valid json\n', 'utf-8')
      await appendFile(filePath, JSON.stringify({ timestamp: '2026-01-15T10:00:00.000Z', level: 'info', message: 'ok' }) + '\n', 'utf-8')

      const result = await store.query({ page: 1, pageSize: 20 })
      expect(result.items.map(e => e.message)).toEqual(['ok'])
    })

    it('only scans log files within the requested date range', async () => {
      await mkdir(path.join(dataDir, 'logs'), { recursive: true })
      // A file with an unrelated name should be ignored entirely.
      await appendFile(path.join(dataDir, 'logs', 'not-a-log.txt'), 'garbage', 'utf-8')
      await seed([{ timestamp: '2026-01-15T10:00:00.000Z', level: 'info', message: 'valid' }])

      const result = await store.query({ page: 1, pageSize: 20 })
      expect(result.items.map(e => e.message)).toEqual(['valid'])
    })
  })
})
