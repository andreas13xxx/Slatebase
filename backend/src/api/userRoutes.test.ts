import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { UserController, UserRouteModule } from './userRoutes.js'
import type {
  IUserService,
  PublicUserInfo,
  UpdateProfileData,
  AvatarType,
} from '../user/index.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }
}

function createPublicUser(overrides: Partial<PublicUserInfo> = {}): PublicUserInfo {
  return {
    userId: 'user-1',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    avatarUrl: '',
    avatarType: 'initials',
    avatarColor: '',
    avatarData: '',
    avatarDicebear: '',
    role: 'user',
    preferredLanguage: 'en',
    colorScheme: 'system',
    suspended: false,
    mustChangePassword: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/**
 * Captures the UpdateProfileData the route forwards to the service, and echoes
 * it back onto the returned PublicUserInfo so the response reflects exactly
 * what the route mapping produced. This is the seam the field-drop bug lived in.
 */
function createMockUserService(capture: { data?: UpdateProfileData }): IUserService {
  return {
    createUser: async () => createPublicUser(),
    deleteUser: async () => {},
    updateProfile: async (_userId: string, data: UpdateProfileData) => {
      capture.data = data
      return createPublicUser({
        avatarType: (data.avatarType as AvatarType | undefined) ?? 'initials',
        avatarColor: data.avatarColor ?? '',
        avatarData: data.avatarData ?? '',
        avatarDicebear: data.avatarDicebear ?? '',
        avatarUrl: data.avatarUrl ?? '',
      })
    },
    changePassword: async () => {},
    resetPassword: async () => 'temp-password',
    getUser: async () => createPublicUser(),
    listUsers: async () => ({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    searchUsers: async () => [],
    suspendUser: async () => {},
    unsuspendUser: async () => {},
    deleteSelf: async () => {},
  }
}

function createTestApp(service: IUserService) {
  const controller = new UserController(service, createMockLogger())
  const routeModule = new UserRouteModule(controller)
  const app = new Hono()
  const session: SessionContext = {
    userId: 'user-1',
    username: 'testuser',
    role: 'user',
    sessionId: 'session-1',
  }
  app.use('*', async (c, next) => {
    c.set('session' as never, session as never)
    return next()
  })
  routeModule.register(app)
  return app
}

async function putProfile(app: Hono, body: unknown): Promise<Response> {
  return app.request('/users/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('UserController PUT /users/me — avatar field mapping', () => {
  it('forwards avatarType=initials with avatarColor to the service and reflects it', async () => {
    const capture: { data?: UpdateProfileData } = {}
    const app = createTestApp(createMockUserService(capture))

    const res = await putProfile(app, { avatarType: 'initials', avatarColor: '#ff8800' })
    expect(res.status).toBe(200)

    expect(capture.data?.avatarType).toBe('initials')
    expect(capture.data?.avatarColor).toBe('#ff8800')

    const json = (await res.json()) as PublicUserInfo
    expect(json.avatarType).toBe('initials')
    expect(json.avatarColor).toBe('#ff8800')
  })

  it('forwards avatarType=dicebear with avatarDicebear', async () => {
    const capture: { data?: UpdateProfileData } = {}
    const app = createTestApp(createMockUserService(capture))

    const res = await putProfile(app, {
      avatarType: 'dicebear',
      avatarDicebear: 'https://api.dicebear.com/9.x/bottts/svg?seed=abc',
    })
    expect(res.status).toBe(200)

    expect(capture.data?.avatarType).toBe('dicebear')
    expect(capture.data?.avatarDicebear).toBe('https://api.dicebear.com/9.x/bottts/svg?seed=abc')

    const json = (await res.json()) as PublicUserInfo
    expect(json.avatarType).toBe('dicebear')
    expect(json.avatarDicebear).toBe('https://api.dicebear.com/9.x/bottts/svg?seed=abc')
  })

  it('forwards avatarType=image with avatarData', async () => {
    const capture: { data?: UpdateProfileData } = {}
    const app = createTestApp(createMockUserService(capture))

    const dataUrl = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='
    const res = await putProfile(app, { avatarType: 'image', avatarData: dataUrl })
    expect(res.status).toBe(200)

    expect(capture.data?.avatarType).toBe('image')
    expect(capture.data?.avatarData).toBe(dataUrl)

    const json = (await res.json()) as PublicUserInfo
    expect(json.avatarType).toBe('image')
    expect(json.avatarData).toBe(dataUrl)
  })

  it('forwards avatarType=url with avatarUrl', async () => {
    const capture: { data?: UpdateProfileData } = {}
    const app = createTestApp(createMockUserService(capture))

    const res = await putProfile(app, {
      avatarType: 'url',
      avatarUrl: 'https://example.com/a.png',
    })
    expect(res.status).toBe(200)

    expect(capture.data?.avatarType).toBe('url')
    expect(capture.data?.avatarUrl).toBe('https://example.com/a.png')
  })

  it('does not forward avatar fields that were omitted from the body', async () => {
    const capture: { data?: UpdateProfileData } = {}
    const app = createTestApp(createMockUserService(capture))

    const res = await putProfile(app, { displayName: 'New Name' })
    expect(res.status).toBe(200)

    expect(capture.data?.displayName).toBe('New Name')
    expect(capture.data?.avatarType).toBeUndefined()
    expect(capture.data?.avatarColor).toBeUndefined()
    expect(capture.data?.avatarData).toBeUndefined()
    expect(capture.data?.avatarDicebear).toBeUndefined()
  })
})
