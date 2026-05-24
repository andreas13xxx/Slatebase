import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { UserRepository, ensureDefaultAdmin } from './index.js'
import type { UserRecord } from './index.js'
import type { ILogger } from '../logger/index.js'

function createTestUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    userId: 'test-user-id-1',
    username: 'testuser',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    role: 'user',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: '',
    preferredLanguage: 'en',
    colorScheme: 'system',
    suspended: false,
    mustChangePassword: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('UserRepository', () => {
  let tempDir: string
  let repo: UserRepository

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-user-repo-'))
    repo = new UserRepository(tempDir)
  })

  afterAll(async () => {
    // Clean up all temp directories
    // Note: individual cleanup per test is not needed since each test gets a fresh dir
  })

  describe('save and findById', () => {
    it('should save a user and retrieve it by ID', async () => {
      const user = createTestUser()
      await repo.save(user)

      const found = await repo.findById(user.userId)
      expect(found).toEqual(user)
    })

    it('should return null for non-existent user ID', async () => {
      const found = await repo.findById('non-existent-id')
      expect(found).toBeNull()
    })

    it('should overwrite an existing user on save', async () => {
      const user = createTestUser()
      await repo.save(user)

      const updated = { ...user, displayName: 'Updated Name', updatedAt: '2025-01-02T00:00:00.000Z' }
      await repo.save(updated)

      const found = await repo.findById(user.userId)
      expect(found).toEqual(updated)
    })
  })

  describe('findByUsername', () => {
    it('should find a user by username via the index', async () => {
      const user = createTestUser()
      await repo.save(user)

      const found = await repo.findByUsername('testuser')
      expect(found).toEqual(user)
    })

    it('should return null for non-existent username', async () => {
      const found = await repo.findByUsername('nobody')
      expect(found).toBeNull()
    })

    it('should update the index when username changes', async () => {
      const user = createTestUser()
      await repo.save(user)

      const renamed = { ...user, username: 'newname', updatedAt: '2025-01-02T00:00:00.000Z' }
      await repo.save(renamed)

      const oldLookup = await repo.findByUsername('testuser')
      expect(oldLookup).toBeNull()

      const newLookup = await repo.findByUsername('newname')
      expect(newLookup).toEqual(renamed)
    })
  })

  describe('delete', () => {
    it('should remove a user and clean up the index', async () => {
      const user = createTestUser()
      await repo.save(user)

      await repo.delete(user.userId)

      const byId = await repo.findById(user.userId)
      expect(byId).toBeNull()

      const byUsername = await repo.findByUsername(user.username)
      expect(byUsername).toBeNull()
    })

    it('should not throw when deleting a non-existent user', async () => {
      await expect(repo.delete('non-existent')).resolves.toBeUndefined()
    })
  })

  describe('count', () => {
    it('should return 0 when no users exist', async () => {
      const count = await repo.count()
      expect(count).toBe(0)
    })

    it('should return the correct count after saves', async () => {
      await repo.save(createTestUser({ userId: 'u1', username: 'alice' }))
      await repo.save(createTestUser({ userId: 'u2', username: 'bob' }))

      const count = await repo.count()
      expect(count).toBe(2)
    })

    it('should decrement after delete', async () => {
      await repo.save(createTestUser({ userId: 'u1', username: 'alice' }))
      await repo.save(createTestUser({ userId: 'u2', username: 'bob' }))
      await repo.delete('u1')

      const count = await repo.count()
      expect(count).toBe(1)
    })
  })

  describe('countByRole', () => {
    it('should count users by role', async () => {
      await repo.save(createTestUser({ userId: 'u1', username: 'admin1', role: 'admin' }))
      await repo.save(createTestUser({ userId: 'u2', username: 'user1', role: 'user' }))
      await repo.save(createTestUser({ userId: 'u3', username: 'user2', role: 'user' }))

      const adminCount = await repo.countByRole('admin')
      expect(adminCount).toBe(1)

      const userCount = await repo.countByRole('user')
      expect(userCount).toBe(2)
    })

    it('should return 0 when no users have the specified role', async () => {
      await repo.save(createTestUser({ userId: 'u1', username: 'user1', role: 'user' }))

      const adminCount = await repo.countByRole('admin')
      expect(adminCount).toBe(0)
    })
  })

  describe('findAll', () => {
    it('should return all users sorted by username ascending', async () => {
      await repo.save(createTestUser({ userId: 'u1', username: 'charlie' }))
      await repo.save(createTestUser({ userId: 'u2', username: 'alice' }))
      await repo.save(createTestUser({ userId: 'u3', username: 'bob' }))

      const result = await repo.findAll()
      expect(result.items).toHaveLength(3)
      expect(result.items[0]?.username).toBe('alice')
      expect(result.items[1]?.username).toBe('bob')
      expect(result.items[2]?.username).toBe('charlie')
      expect(result.total).toBe(3)
      expect(result.page).toBe(1)
      expect(result.totalPages).toBe(1)
    })

    it('should paginate results correctly', async () => {
      await repo.save(createTestUser({ userId: 'u1', username: 'alice' }))
      await repo.save(createTestUser({ userId: 'u2', username: 'bob' }))
      await repo.save(createTestUser({ userId: 'u3', username: 'charlie' }))
      await repo.save(createTestUser({ userId: 'u4', username: 'dave' }))
      await repo.save(createTestUser({ userId: 'u5', username: 'eve' }))

      const page1 = await repo.findAll({ page: 1, pageSize: 2 })
      expect(page1.items).toHaveLength(2)
      expect(page1.items[0]?.username).toBe('alice')
      expect(page1.items[1]?.username).toBe('bob')
      expect(page1.total).toBe(5)
      expect(page1.page).toBe(1)
      expect(page1.pageSize).toBe(2)
      expect(page1.totalPages).toBe(3)

      const page2 = await repo.findAll({ page: 2, pageSize: 2 })
      expect(page2.items).toHaveLength(2)
      expect(page2.items[0]?.username).toBe('charlie')
      expect(page2.items[1]?.username).toBe('dave')

      const page3 = await repo.findAll({ page: 3, pageSize: 2 })
      expect(page3.items).toHaveLength(1)
      expect(page3.items[0]?.username).toBe('eve')
    })

    it('should return empty result when no users exist', async () => {
      const result = await repo.findAll()
      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
      expect(result.totalPages).toBe(1)
    })
  })

  describe('atomic writes', () => {
    it('should persist user data as JSON file', async () => {
      const user = createTestUser()
      await repo.save(user)

      const filePath = path.join(tempDir, 'users', `${user.userId}.json`)
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      expect(parsed).toEqual(user)
    })

    it('should persist index as JSON file', async () => {
      const user = createTestUser()
      await repo.save(user)

      const indexPath = path.join(tempDir, 'users', '_index.json')
      const raw = await fs.readFile(indexPath, 'utf-8')
      const parsed = JSON.parse(raw)
      expect(parsed).toEqual({ [user.username]: user.userId })
    })

    it('should create the users directory if it does not exist', async () => {
      const freshDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-fresh-'))
      const freshRepo = new UserRepository(freshDir)

      await freshRepo.save(createTestUser())

      const dirExists = await fs.stat(path.join(freshDir, 'users')).then(() => true).catch(() => false)
      expect(dirExists).toBe(true)
    })
  })
})


function createMockLogger(): ILogger & { messages: { level: string; message: string; meta?: object }[] } {
  const messages: { level: string; message: string; meta?: object }[] = []
  return {
    messages,
    debug(message: string, meta?: object) { if (meta !== undefined) { messages.push({ level: 'debug', message, meta }) } else { messages.push({ level: 'debug', message }) } },
    info(message: string, meta?: object) { if (meta !== undefined) { messages.push({ level: 'info', message, meta }) } else { messages.push({ level: 'info', message }) } },
    warn(message: string, meta?: object) { if (meta !== undefined) { messages.push({ level: 'warn', message, meta }) } else { messages.push({ level: 'warn', message }) } },
    error(message: string, meta?: object) { if (meta !== undefined) { messages.push({ level: 'error', message, meta }) } else { messages.push({ level: 'error', message }) } },
  }
}

describe('ensureDefaultAdmin', () => {
  let tempDir: string
  let repo: UserRepository
  let logger: ReturnType<typeof createMockLogger>

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-admin-'))
    repo = new UserRepository(tempDir)
    logger = createMockLogger()
  })

  it('should create a default admin when no users exist', async () => {
    await ensureDefaultAdmin(repo, logger)

    const count = await repo.count()
    expect(count).toBe(1)

    const admin = await repo.findByUsername('admin')
    expect(admin).not.toBeNull()
    expect(admin!.username).toBe('admin')
    expect(admin!.role).toBe('admin')
    expect(admin!.displayName).toBe('Administrator')
    expect(admin!.email).toBe('')
    expect(admin!.avatarUrl).toBe('')
    expect(admin!.preferredLanguage).toBe('de')
    expect(admin!.colorScheme).toBe('system')
    expect(admin!.suspended).toBe(false)
    expect(admin!.mustChangePassword).toBe(true)
    expect(admin!.passwordHash).toContain('$argon2id$')
  })

  it('should not create admin when users already exist', async () => {
    const existingUser = createTestUser({ userId: 'existing-1', username: 'existinguser' })
    await repo.save(existingUser)

    await ensureDefaultAdmin(repo, logger)

    const count = await repo.count()
    expect(count).toBe(1)

    const admin = await repo.findByUsername('admin')
    expect(admin).toBeNull()
  })

  it('should log an info message when admin is created', async () => {
    await ensureDefaultAdmin(repo, logger)

    const infoMessages = logger.messages.filter(m => m.level === 'info')
    expect(infoMessages).toHaveLength(1)
    expect(infoMessages[0]!.message).toBe('Default admin account created')
    expect(infoMessages[0]!.meta).toHaveProperty('userId')
  })

  it('should not log when users already exist', async () => {
    await repo.save(createTestUser({ userId: 'u1', username: 'someone' }))

    await ensureDefaultAdmin(repo, logger)

    expect(logger.messages).toHaveLength(0)
  })

  it('should set createdAt and updatedAt to the same ISO timestamp', async () => {
    await ensureDefaultAdmin(repo, logger)

    const admin = await repo.findByUsername('admin')
    expect(admin).not.toBeNull()
    expect(admin!.createdAt).toBe(admin!.updatedAt)
    // Verify it's a valid ISO 8601 string
    expect(new Date(admin!.createdAt).toISOString()).toBe(admin!.createdAt)
  })

  it('should generate a valid UUID for the userId', async () => {
    await ensureDefaultAdmin(repo, logger)

    const admin = await repo.findByUsername('admin')
    expect(admin).not.toBeNull()
    // UUID v4 format: 8-4-4-4-12 hex characters
    expect(admin!.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
