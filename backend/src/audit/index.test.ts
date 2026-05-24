import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { AuditLogger, AuditService } from './index.js'
import type { AuditEntry, AuditFilter, IAuditLogger } from './index.js'
import type { PaginatedResult } from '../user/index.js'

describe('AuditLogger', () => {
  let dataDir: string
  let logger: AuditLogger

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'audit-test-'))
    logger = new AuditLogger(dataDir)
  })

  afterAll(async () => {
    // Cleanup is best-effort
    try {
      if (dataDir) await rm(dataDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  function createEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
    return {
      timestamp: '2025-01-15T10:30:00.000Z',
      userId: 'user-123',
      action: 'LOGIN_SUCCESS',
      target: 'user-123',
      ipAddress: '192.168.1.1',
      success: true,
      ...overrides,
    }
  }

  describe('append', () => {
    it('should create the audit directory and write an entry', async () => {
      const entry = createEntry()
      await logger.append(entry)

      const auditDir = path.join(dataDir, 'audit')
      const files = await readdir(auditDir)
      expect(files).toContain('2025-01-15.jsonl')

      const content = await readFile(path.join(auditDir, '2025-01-15.jsonl'), 'utf-8')
      const parsed = JSON.parse(content.trim()) as AuditEntry
      expect(parsed.action).toBe('LOGIN_SUCCESS')
      expect(parsed.userId).toBe('user-123')
      expect(parsed.timestamp).toBe('2025-01-15T10:30:00.000Z')
    })

    it('should append multiple entries to the same file', async () => {
      await logger.append(createEntry({ timestamp: '2025-01-15T10:00:00.000Z' }))
      await logger.append(createEntry({ timestamp: '2025-01-15T11:00:00.000Z', action: 'LOGOUT' }))

      const content = await readFile(path.join(dataDir, 'audit', '2025-01-15.jsonl'), 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines).toHaveLength(2)

      const first = JSON.parse(lines[0]!) as AuditEntry
      const second = JSON.parse(lines[1]!) as AuditEntry
      expect(first.action).toBe('LOGIN_SUCCESS')
      expect(second.action).toBe('LOGOUT')
    })

    it('should write to different files for different dates', async () => {
      await logger.append(createEntry({ timestamp: '2025-01-15T10:00:00.000Z' }))
      await logger.append(createEntry({ timestamp: '2025-01-16T10:00:00.000Z' }))

      const files = await readdir(path.join(dataDir, 'audit'))
      expect(files.sort()).toEqual(['2025-01-15.jsonl', '2025-01-16.jsonl'])
    })

    it('should redact sensitive data in JSON details', async () => {
      const entry = createEntry({
        details: JSON.stringify({ password: 'secret123', username: 'admin' }),
      })
      await logger.append(entry)

      const content = await readFile(path.join(dataDir, 'audit', '2025-01-15.jsonl'), 'utf-8')
      const parsed = JSON.parse(content.trim()) as AuditEntry
      expect(parsed.details).toContain('[REDACTED]')
      expect(parsed.details).not.toContain('secret123')
      expect(parsed.details).toContain('admin')
    })

    it('should redact token values in JSON details', async () => {
      const entry = createEntry({
        details: JSON.stringify({ token: 'abc123def', action: 'login' }),
      })
      await logger.append(entry)

      const content = await readFile(path.join(dataDir, 'audit', '2025-01-15.jsonl'), 'utf-8')
      const parsed = JSON.parse(content.trim()) as AuditEntry
      expect(parsed.details).not.toContain('abc123def')
    })

    it('should redact sensitive patterns in plain text details', async () => {
      const entry = createEntry({
        details: 'password: mysecret token=abc123',
      })
      await logger.append(entry)

      const content = await readFile(path.join(dataDir, 'audit', '2025-01-15.jsonl'), 'utf-8')
      const parsed = JSON.parse(content.trim()) as AuditEntry
      expect(parsed.details).not.toContain('mysecret')
      expect(parsed.details).not.toContain('abc123')
    })

    it('should not include details field when undefined', async () => {
      const entry: AuditEntry = {
        timestamp: '2025-01-15T10:30:00.000Z',
        userId: 'user-123',
        action: 'LOGIN_SUCCESS',
        target: 'user-123',
        ipAddress: '192.168.1.1',
        success: true,
      }
      await logger.append(entry)

      const content = await readFile(path.join(dataDir, 'audit', '2025-01-15.jsonl'), 'utf-8')
      const parsed = JSON.parse(content.trim()) as Record<string, unknown>
      expect('details' in parsed).toBe(false)
    })
  })

  describe('read', () => {
    it('should return empty result when no entries exist', async () => {
      const filter: AuditFilter = { page: 1, pageSize: 10 }
      const result = await logger.read(filter)

      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
      expect(result.page).toBe(1)
      expect(result.totalPages).toBe(1)
    })

    it('should return all entries without filters', async () => {
      await logger.append(createEntry({ timestamp: '2025-01-15T10:00:00.000Z' }))
      await logger.append(createEntry({ timestamp: '2025-01-15T11:00:00.000Z', action: 'LOGOUT' }))

      const result = await logger.read({ page: 1, pageSize: 10 })
      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('should sort entries by timestamp descending (newest first)', async () => {
      await logger.append(createEntry({ timestamp: '2025-01-15T08:00:00.000Z' }))
      await logger.append(createEntry({ timestamp: '2025-01-15T12:00:00.000Z' }))
      await logger.append(createEntry({ timestamp: '2025-01-15T10:00:00.000Z' }))

      const result = await logger.read({ page: 1, pageSize: 10 })
      expect(result.items[0]!.timestamp).toBe('2025-01-15T12:00:00.000Z')
      expect(result.items[1]!.timestamp).toBe('2025-01-15T10:00:00.000Z')
      expect(result.items[2]!.timestamp).toBe('2025-01-15T08:00:00.000Z')
    })

    it('should filter by action type', async () => {
      await logger.append(createEntry({ action: 'LOGIN_SUCCESS' }))
      await logger.append(createEntry({ action: 'LOGOUT' }))
      await logger.append(createEntry({ action: 'LOGIN_FAILED' }))

      const result = await logger.read({ page: 1, pageSize: 10, action: 'LOGOUT' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0]!.action).toBe('LOGOUT')
    })

    it('should filter by date range', async () => {
      await logger.append(createEntry({ timestamp: '2025-01-14T10:00:00.000Z' }))
      await logger.append(createEntry({ timestamp: '2025-01-15T10:00:00.000Z' }))
      await logger.append(createEntry({ timestamp: '2025-01-16T10:00:00.000Z' }))

      const result = await logger.read({
        page: 1,
        pageSize: 10,
        startDate: '2025-01-15T00:00:00.000Z',
        endDate: '2025-01-15T23:59:59.999Z',
      })
      expect(result.items).toHaveLength(1)
      expect(result.items[0]!.timestamp).toBe('2025-01-15T10:00:00.000Z')
    })

    it('should paginate results correctly', async () => {
      for (let i = 0; i < 5; i++) {
        await logger.append(createEntry({
          timestamp: `2025-01-15T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
        }))
      }

      const page1 = await logger.read({ page: 1, pageSize: 2 })
      expect(page1.items).toHaveLength(2)
      expect(page1.total).toBe(5)
      expect(page1.page).toBe(1)
      expect(page1.pageSize).toBe(2)
      expect(page1.totalPages).toBe(3)

      const page2 = await logger.read({ page: 2, pageSize: 2 })
      expect(page2.items).toHaveLength(2)
      expect(page2.page).toBe(2)

      const page3 = await logger.read({ page: 3, pageSize: 2 })
      expect(page3.items).toHaveLength(1)
      expect(page3.page).toBe(3)
    })

    it('should cap pageSize at 100', async () => {
      await logger.append(createEntry())

      const result = await logger.read({ page: 1, pageSize: 200 })
      expect(result.pageSize).toBe(100)
    })

    it('should read entries across multiple date files', async () => {
      await logger.append(createEntry({ timestamp: '2025-01-14T10:00:00.000Z' }))
      await logger.append(createEntry({ timestamp: '2025-01-15T10:00:00.000Z' }))
      await logger.append(createEntry({ timestamp: '2025-01-16T10:00:00.000Z' }))

      const result = await logger.read({ page: 1, pageSize: 10 })
      expect(result.items).toHaveLength(3)
    })

    it('should combine action and date range filters', async () => {
      await logger.append(createEntry({ timestamp: '2025-01-15T10:00:00.000Z', action: 'LOGIN_SUCCESS' }))
      await logger.append(createEntry({ timestamp: '2025-01-15T11:00:00.000Z', action: 'LOGOUT' }))
      await logger.append(createEntry({ timestamp: '2025-01-16T10:00:00.000Z', action: 'LOGIN_SUCCESS' }))

      const result = await logger.read({
        page: 1,
        pageSize: 10,
        action: 'LOGIN_SUCCESS',
        startDate: '2025-01-15T00:00:00.000Z',
        endDate: '2025-01-15T23:59:59.999Z',
      })
      expect(result.items).toHaveLength(1)
      expect(result.items[0]!.action).toBe('LOGIN_SUCCESS')
      expect(result.items[0]!.timestamp).toBe('2025-01-15T10:00:00.000Z')
    })
  })
})


describe('AuditService', () => {
  function createMockAuditLogger(): IAuditLogger & { appendedEntries: AuditEntry[]; lastFilter: AuditFilter | null } {
    const mock = {
      appendedEntries: [] as AuditEntry[],
      lastFilter: null as AuditFilter | null,
      async append(entry: AuditEntry): Promise<void> {
        mock.appendedEntries.push(entry)
      },
      async read(filter: AuditFilter): Promise<PaginatedResult<AuditEntry>> {
        mock.lastFilter = filter
        return {
          items: [],
          total: 0,
          page: filter.page,
          pageSize: filter.pageSize,
          totalPages: 1,
        }
      },
    }
    return mock
  }

  describe('log', () => {
    it('should add a timestamp and delegate to auditLogger.append', async () => {
      const mockLogger = createMockAuditLogger()
      const service = new AuditService(mockLogger)

      const before = new Date().toISOString()
      await service.log({
        userId: 'user-1',
        action: 'LOGIN_SUCCESS',
        target: 'user-1',
        ipAddress: '127.0.0.1',
        success: true,
      })
      const after = new Date().toISOString()

      expect(mockLogger.appendedEntries).toHaveLength(1)
      const entry = mockLogger.appendedEntries[0]!
      expect(entry.userId).toBe('user-1')
      expect(entry.action).toBe('LOGIN_SUCCESS')
      expect(entry.target).toBe('user-1')
      expect(entry.ipAddress).toBe('127.0.0.1')
      expect(entry.success).toBe(true)
      expect(entry.timestamp).toBeDefined()
      expect(entry.timestamp >= before).toBe(true)
      expect(entry.timestamp <= after).toBe(true)
    })

    it('should preserve optional details field', async () => {
      const mockLogger = createMockAuditLogger()
      const service = new AuditService(mockLogger)

      await service.log({
        userId: 'user-1',
        action: 'ROLE_CHANGED',
        target: 'user-2',
        ipAddress: '10.0.0.1',
        success: true,
        details: 'role changed from user to admin',
      })

      expect(mockLogger.appendedEntries[0]!.details).toBe('role changed from user to admin')
    })

    it('should not include details when not provided', async () => {
      const mockLogger = createMockAuditLogger()
      const service = new AuditService(mockLogger)

      await service.log({
        userId: null,
        action: 'LOGIN_FAILED',
        target: 'unknown',
        ipAddress: '192.168.1.1',
        success: false,
      })

      const entry = mockLogger.appendedEntries[0]!
      expect('details' in entry).toBe(false)
    })
  })

  describe('query', () => {
    it('should delegate to auditLogger.read with the provided filter', async () => {
      const mockLogger = createMockAuditLogger()
      const service = new AuditService(mockLogger)

      const filter: AuditFilter = {
        action: 'LOGOUT',
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-31T23:59:59.999Z',
        page: 2,
        pageSize: 25,
      }

      await service.query(filter)

      expect(mockLogger.lastFilter).toEqual(filter)
    })

    it('should return the result from auditLogger.read', async () => {
      const mockLogger = createMockAuditLogger()
      const service = new AuditService(mockLogger)

      const result = await service.query({ page: 1, pageSize: 10 })

      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.totalPages).toBe(1)
    })
  })
})
