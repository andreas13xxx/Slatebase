import { describe, it, expect } from 'vitest'
import {
  avatarTypeSchema,
  avatarColorSchema,
  avatarDicebearSchema,
  avatarDataSchema,
  updateProfileSchema,
  MAX_AVATAR_DATA_LENGTH,
} from './validation.js'
import {
  UserService,
  UserValidationError,
  type IUserRepository,
  type UserRecord,
} from './index.js'
import type { ISessionStore } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'

// ─── Schema tests ──────────────────────────────────────────────────────────

describe('avatarTypeSchema', () => {
  it('accepts the four valid types', () => {
    for (const t of ['initials', 'url', 'dicebear', 'image']) {
      expect(avatarTypeSchema.safeParse(t).success).toBe(true)
    }
  })

  it('rejects an unknown type', () => {
    expect(avatarTypeSchema.safeParse('gravatar').success).toBe(false)
  })
})

describe('avatarColorSchema', () => {
  it('accepts an empty string and a #rrggbb colour', () => {
    expect(avatarColorSchema.safeParse('').success).toBe(true)
    expect(avatarColorSchema.safeParse('#1a2b3c').success).toBe(true)
  })

  it('rejects short, unprefixed or named colours', () => {
    expect(avatarColorSchema.safeParse('#fff').success).toBe(false)
    expect(avatarColorSchema.safeParse('1a2b3c').success).toBe(false)
    expect(avatarColorSchema.safeParse('red').success).toBe(false)
  })
})

describe('avatarDicebearSchema', () => {
  it('accepts an empty string and an https api.dicebear.com URL', () => {
    expect(avatarDicebearSchema.safeParse('').success).toBe(true)
    expect(
      avatarDicebearSchema.safeParse('https://api.dicebear.com/9.x/bottts/svg?seed=x').success,
    ).toBe(true)
  })

  it('rejects another host, http, or a non-URL', () => {
    expect(avatarDicebearSchema.safeParse('https://evil.example.com/x.svg').success).toBe(false)
    expect(avatarDicebearSchema.safeParse('http://api.dicebear.com/9.x/bottts/svg').success).toBe(false)
    expect(avatarDicebearSchema.safeParse('not a url').success).toBe(false)
  })

  it('rejects a URL longer than 2048 chars', () => {
    const long = 'https://api.dicebear.com/9.x/bottts/svg?seed=' + 'a'.repeat(2100)
    expect(avatarDicebearSchema.safeParse(long).success).toBe(false)
  })
})

describe('avatarDataSchema', () => {
  it('accepts an empty string and a png/webp data URL', () => {
    expect(avatarDataSchema.safeParse('').success).toBe(true)
    expect(avatarDataSchema.safeParse('data:image/png;base64,AAAA').success).toBe(true)
    expect(avatarDataSchema.safeParse('data:image/webp;base64,AAAA').success).toBe(true)
  })

  it('rejects a non-image data URL or a plain string', () => {
    expect(avatarDataSchema.safeParse('data:text/plain;base64,AAAA').success).toBe(false)
    expect(avatarDataSchema.safeParse('https://example.com/a.png').success).toBe(false)
  })

  it('rejects data larger than the limit', () => {
    const tooBig = 'data:image/png;base64,' + 'A'.repeat(MAX_AVATAR_DATA_LENGTH)
    expect(avatarDataSchema.safeParse(tooBig).success).toBe(false)
  })
})

describe('updateProfileSchema', () => {
  it('accepts a partial avatar update', () => {
    const result = updateProfileSchema.safeParse({ avatarType: 'dicebear', avatarDicebear: 'https://api.dicebear.com/9.x/bottts/svg?seed=x' })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid avatar colour', () => {
    expect(updateProfileSchema.safeParse({ avatarColor: 'blue' }).success).toBe(false)
  })
})

// ─── UserService.updateProfile field-preservation (R1.1) ─────────────────────

function createTestUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    userId: 'u1',
    username: 'tester',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
    role: 'user',
    displayName: 'Tester',
    email: '',
    avatarUrl: '',
    avatarType: 'initials',
    avatarColor: '',
    avatarData: '',
    avatarDicebear: '',
    preferredLanguage: 'en',
    colorScheme: 'system',
    suspended: false,
    mustChangePassword: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function createMockRepo(initial: UserRecord): { repo: IUserRepository; saved: () => UserRecord } {
  let current = initial
  const repo: IUserRepository = {
    findById: async (id) => (id === current.userId ? current : null),
    findByUsername: async () => null,
    searchByUsernamePrefix: async () => [],
    findAll: async () => ({ items: [current], total: 1, page: 1, pageSize: 100, totalPages: 1 }),
    save: async (u) => { current = u },
    delete: async () => {},
    count: async () => 1,
    countByRole: async () => 0,
  }
  return { repo, saved: () => current }
}

const noopLogger: ILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as ILogger

const noopSessionStore = {} as unknown as ISessionStore

describe('UserService.updateProfile avatar handling', () => {
  it('preserves the other avatar fields when only the type changes (R1.1)', async () => {
    const start = createTestUser({
      avatarType: 'image',
      avatarData: 'data:image/png;base64,AAAA',
      avatarColor: '#112233',
      avatarDicebear: 'https://api.dicebear.com/9.x/bottts/svg?seed=x',
    })
    const { repo, saved } = createMockRepo(start)
    const service = new UserService(repo, noopSessionStore, noopLogger)

    await service.updateProfile('u1', { avatarType: 'initials' })

    const after = saved()
    expect(after.avatarType).toBe('initials')
    // The image / dicebear the user picked earlier survive the switch.
    expect(after.avatarData).toBe('data:image/png;base64,AAAA')
    expect(after.avatarColor).toBe('#112233')
    expect(after.avatarDicebear).toBe('https://api.dicebear.com/9.x/bottts/svg?seed=x')
  })

  it('rejects an invalid dicebear host at the business layer', async () => {
    const { repo } = createMockRepo(createTestUser())
    const service = new UserService(repo, noopSessionStore, noopLogger)

    await expect(
      service.updateProfile('u1', { avatarType: 'dicebear', avatarDicebear: 'https://evil.example.com/x.svg' }),
    ).rejects.toBeInstanceOf(UserValidationError)
  })

  it('rejects oversized image data at the business layer', async () => {
    const { repo } = createMockRepo(createTestUser())
    const service = new UserService(repo, noopSessionStore, noopLogger)
    const tooBig = 'data:image/png;base64,' + 'A'.repeat(MAX_AVATAR_DATA_LENGTH)

    await expect(
      service.updateProfile('u1', { avatarType: 'image', avatarData: tooBig }),
    ).rejects.toBeInstanceOf(UserValidationError)
  })
})
