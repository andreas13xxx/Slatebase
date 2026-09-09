// Table-driven authorization test — walks every vault-scoped route actually registered on
// the wired app (via Hono's own `app.routes`, not a hand-copied list) and verifies the
// default-deny middleware blocks a no-access user (403 on a known vault, 404 on an unknown
// one) and a read-only-share user (403 on every write/owner-level route). The expected
// level for each route comes from `resolveRequiredLevel()` — the same function the
// middleware itself uses — so this test and the middleware cannot drift apart, and a newly
// registered route with no exception-table entry is exercised with the method default
// instead of silently skipped.
//
// Every dependency below is either the real access-control stack (accessControl,
// vaultRegistry, vaultShareRegistry — the parts this test actually verifies) or a stub that
// throws if called. That's intentional: every scenario this file exercises is a denial, and
// the authorization middleware always runs before a route handler — so no handler body,
// and therefore none of the business-logic services behind it, is ever reached. If a stub
// method fires, either the middleware failed to block a request that should have been
// denied, or this test's own setup is wrong — both are bugs worth surfacing loudly.

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { RouterRoute } from 'hono/types'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IUserRepository, UserRecord } from '../user/index.js'
import type { IVaultRegistry, IVaultShareRegistry, VaultRegistryEntry, VaultShareEntry } from '../vault/registry.js'
import type { IVaultService, IVaultAccessControl } from '../business/index.js'
import { VaultAccessControlService } from '../business/index.js'
import type { IImportService } from '../import/index.js'
import type { IPluginService, IPluginSecretStore } from '../plugin/index.js'
import type { ISnippetStore } from '../snippets/index.js'
import type { IPluginStoreService } from '../plugin-store/index.js'
import type { ISearchService, IReplaceService } from '../search/index.js'
import type { IEventBus } from '../realtime/index.js'
import type { ITrashService } from '../trash/index.js'
import type { IGitSyncConfigStore, IGitSyncStatusStore, IGitSyncEngine, ISshKeyGenerator } from '../git-sync/index.js'
import type { IModuleSecretStore } from '../shared-secrets/index.js'
import type { IMailImportConfigStore, IMailImportStatusStore, IMailImportEngine, IImapClient } from '../mail-import/index.js'
import type { ITranscriptionService } from '../transcription/index.js'
import type { ITemplateService } from '../template/index.js'
import type { IVaultStatisticsService } from '../statistics/index.js'
import type { IVersionService } from '../version/index.js'
import type { IVaultConfigService } from '../vault-config/index.js'
import type { IPropertyTypeService } from '../property-type/index.js'
import type { ILinkIndex } from '../link-index/index.js'
import { SlidingWindowRateLimiter } from '../shared/sliding-window-rate-limiter.js'

import { VaultController, VaultRouteModule, createRouter } from './index.js'
import { VaultShareRouteModule } from './vaultShareRoutes.js'
import { createGraphRoutes } from './graphRoutes.js'
import { createPluginRoutes } from './pluginRoutes.js'
import { createSnippetRoutes } from './snippetRoutes.js'
import { createVaultPluginStoreRoutes } from './pluginStoreRoutes.js'
import { createSearchRoutes } from './searchRoutes.js'
import { createUploadRoutes } from './uploadRoutes.js'
import { createTrashRoutes } from './trashRoutes.js'
import { createGitSyncRoutes } from './gitSyncRoutes.js'
import { createMailImportRoutes } from './mailImportRoutes.js'
import { createTranscriptionRoutes } from './transcriptionRoutes.js'
import { createTemplateRoutes } from './templateRoutes.js'
import { createStatisticsRoutes } from './statisticsRoutes.js'
import { createFileVersionRoutes } from './fileVersionRoutes.js'
import { createVaultConfigRoutes } from './vaultConfigRoutes.js'
import { createPropertyTypeRoutes } from './propertyTypeRoutes.js'
import { createPropertyRoutes } from './propertyRoutes.js'
import { createVaultAuthorizationMiddleware, resolveRequiredLevel } from './vault-authorization-middleware.js'

// ─── Stub helper ────────────────────────────────────────────────────────────
// Returns an object whose every property access yields a function that throws. Used for
// every dependency this test never expects to be called (see file header).

function stub<T extends object>(name: string): T {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        return (..._args: unknown[]) => {
          throw new Error(`Unexpected call to stubbed ${name}.${String(prop)} — the authorization middleware should have blocked this request first`)
        }
      },
    },
  ) as unknown as T
}

// ─── In-memory access-control fixtures ─────────────────────────────────────

const silentLogger: ILogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

const VAULT_ID = 'authz-test-vault1'
const OWNER_ID = 'authz-owner'
const READER_ID = 'authz-reader'
const STRANGER_ID = 'authz-stranger'
const UNKNOWN_VAULT_ID = 'authz-no-such-vault'

const readerSession: SessionContext = { userId: READER_ID, username: 'reader', role: 'user', sessionId: 'sess-reader' }
const strangerSession: SessionContext = { userId: STRANGER_ID, username: 'stranger', role: 'user', sessionId: 'sess-stranger' }

function createVaultRegistry(entries: VaultRegistryEntry[]): IVaultRegistry {
  return {
    load: async () => [...entries],
    save: async () => {},
    addEntry: async (entry) => { entries.push(entry) },
    removeEntry: async (id) => {
      const idx = entries.findIndex((e) => e.id === id)
      if (idx !== -1) entries.splice(idx, 1)
    },
    findById: (id) => entries.find((e) => e.id === id) ?? null,
    findByName: (name) => entries.find((e) => e.name === name) ?? null,
    updateEntries: async (mutator) => mutator(entries),
  }
}

function createShareRegistry(shares: VaultShareEntry[]): IVaultShareRegistry {
  return {
    getSharesForVault: async (vaultId) => shares.filter((s) => s.vaultId === vaultId),
    getSharesForUser: async (userId) => shares.filter((s) => s.userId === userId),
    addShare: async (share) => { shares.push(share) },
    removeShare: async (vaultId, userId) => {
      const idx = shares.findIndex((s) => s.vaultId === vaultId && s.userId === userId)
      if (idx !== -1) shares.splice(idx, 1)
    },
    removeAllSharesForVault: async (vaultId) => {
      for (let i = shares.length - 1; i >= 0; i--) {
        if (shares[i]?.vaultId === vaultId) shares.splice(i, 1)
      }
    },
    updatePermission: async (vaultId, userId, permission) => {
      const share = shares.find((s) => s.vaultId === vaultId && s.userId === userId)
      if (share) share.permission = permission
    },
  }
}

function createUserRepository(users: UserRecord[]): IUserRepository {
  return {
    findById: async (userId) => users.find((u) => u.userId === userId) ?? null,
    findByUsername: async (username) => users.find((u) => u.username === username) ?? null,
    searchByUsernamePrefix: async () => [],
    findAll: async () => ({ items: users, total: users.length, page: 1, pageSize: users.length, totalPages: 1 }),
    save: async () => {},
    delete: async () => {},
    count: async () => users.length,
    countByRole: async () => 0,
  }
}

function createUser(userId: string, username: string): UserRecord {
  return {
    userId,
    username,
    passwordHash: 'hashed',
    role: 'user',
    displayName: username,
    email: '',
    avatarUrl: '',
    preferredLanguage: 'de',
    colorScheme: 'system',
    suspended: false,
    mustChangePassword: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }
}

const vaultEntries: VaultRegistryEntry[] = [
  { id: VAULT_ID, name: 'Authz Test Vault', storagePath: `/data/vaults/${VAULT_ID}`, createdAt: '2025-01-01T00:00:00.000Z', ownerId: OWNER_ID },
]
// Reader's read share is seeded directly into the backing array — synchronous, so it's
// ready before the module-level `app.routes` walk below (describe.each needs the route
// list at collection time, before any beforeAll/async setup would run).
const shareEntries: VaultShareEntry[] = [
  { vaultId: VAULT_ID, userId: READER_ID, permission: 'read', grantedBy: OWNER_ID, grantedAt: '2025-01-01T00:00:00.000Z' },
]
const users: UserRecord[] = [createUser(OWNER_ID, 'owner'), createUser(READER_ID, 'reader'), createUser(STRANGER_ID, 'stranger')]

const vaultRegistry = createVaultRegistry(vaultEntries)
const vaultShareRegistry = createShareRegistry(shareEntries)
const userRepository = createUserRepository(users)
const accessControl: IVaultAccessControl = new VaultAccessControlService(vaultRegistry, vaultShareRegistry, userRepository, silentLogger)

// ─── App wiring — mirrors index.ts's registration, stubbing everything but access control ───

const app = new Hono()

let currentSession: SessionContext | undefined
app.use('*', async (c, next) => {
  if (currentSession !== undefined) {
    c.set('session' as never, currentSession as never)
  }
  await next()
})

app.use('/api/v1/vaults/:vaultId/*', createVaultAuthorizationMiddleware({ vaultRegistry, accessControl }))

const vaultController = new VaultController(stub<IVaultService>('vaultService'), silentLogger, stub<IImportService>('importService'), userRepository, accessControl, vaultShareRegistry)
const routeModules = [
  new VaultRouteModule(vaultController),
  new VaultShareRouteModule(accessControl, stub<IVaultService>('vaultService'), silentLogger, vaultShareRegistry, userRepository),
  createGraphRoutes({ getLinkIndex: () => undefined, accessControl, vaultRegistry, logger: silentLogger }),
]
const router = createRouter(routeModules)
app.route('/api/v1', router)

const pluginRoutes = createPluginRoutes({ pluginService: stub<IPluginService>('pluginService'), accessControl, vaultRegistry, logger: silentLogger, secretStore: stub<IPluginSecretStore>('pluginSecretStore') })
app.route('/api/v1/vaults/:vaultId/plugins', pluginRoutes)

const snippetRoutes = createSnippetRoutes({ snippetStore: stub<ISnippetStore>('snippetStore'), accessControl, vaultRegistry, logger: silentLogger })
app.route('/api/v1/vaults/:vaultId/snippets', snippetRoutes)

const vaultPluginStoreRoutes = createVaultPluginStoreRoutes({ pluginStoreService: stub<IPluginStoreService>('pluginStoreService'), accessControl, vaultRegistry, logger: silentLogger })
app.route('/api/v1/vaults/:vaultId/plugins', vaultPluginStoreRoutes)

const searchRoutes = createSearchRoutes({ searchService: stub<ISearchService>('searchService'), replaceService: stub<IReplaceService>('replaceService'), vaultAccessControl: accessControl, logger: silentLogger })
app.route('/api/v1', searchRoutes)

const uploadRoutes = createUploadRoutes({
  accessControl,
  vaultRegistry,
  uploadConfig: { maxFileSizeBytes: 104857600, maxFilesPerDrop: 50, maxImagePasteSize: 10485760 },
  eventBus: stub<IEventBus>('eventBus'),
  logger: silentLogger,
})
app.route('/api/v1', uploadRoutes)

const trashRoutes = createTrashRoutes({ trashService: stub<ITrashService>('trashService'), accessControl, vaultRegistry, eventBus: stub<IEventBus>('eventBus'), logger: silentLogger })
app.route('/api/v1', trashRoutes)

const gitSyncRoutes = createGitSyncRoutes({
  configStore: stub<IGitSyncConfigStore>('gitSyncConfigStore'),
  statusStore: stub<IGitSyncStatusStore>('gitSyncStatusStore'),
  secretStore: stub<IModuleSecretStore>('moduleSecretStore'),
  syncEngine: stub<IGitSyncEngine>('gitSyncEngine'),
  sshKeyGenerator: stub<ISshKeyGenerator>('sshKeyGenerator'),
  accessControl,
  vaultRegistry,
  logger: silentLogger,
})
app.route('/api/v1', gitSyncRoutes)

const mailImportRoutes = createMailImportRoutes({
  configStore: stub<IMailImportConfigStore>('mailImportConfigStore'),
  statusStore: stub<IMailImportStatusStore>('mailImportStatusStore'),
  secretStore: stub<IModuleSecretStore>('moduleSecretStore'),
  importEngine: stub<IMailImportEngine>('mailImportEngine'),
  imapClient: stub<IImapClient>('imapClient'),
  accessControl,
  vaultRegistry,
  logger: silentLogger,
})
app.route('/api/v1', mailImportRoutes)

const transcriptionRoutes = createTranscriptionRoutes({
  transcriptionService: stub<ITranscriptionService>('transcriptionService'),
  accessControl,
  vaultRegistry,
  rateLimiter: new SlidingWindowRateLimiter(10, 60_000),
  logger: silentLogger,
})
app.route('/api/v1', transcriptionRoutes)

const templateRoutes = createTemplateRoutes({ templateService: stub<ITemplateService>('templateService'), accessControl, vaultRegistry, eventBus: stub<IEventBus>('eventBus'), logger: silentLogger })
app.route('/api/v1', templateRoutes)

const statisticsRoutes = createStatisticsRoutes({ accessControl, vaultRegistry, statisticsService: stub<IVaultStatisticsService>('statisticsService'), logger: silentLogger })
app.route('/api/v1', statisticsRoutes)

const fileVersionRoutes = createFileVersionRoutes({ versionService: stub<IVersionService>('versionService'), accessControl, vaultRegistry, eventBus: stub<IEventBus>('eventBus'), logger: silentLogger })
app.route('/api/v1', fileVersionRoutes)

const vaultConfigRoutes = createVaultConfigRoutes({ vaultConfigService: stub<IVaultConfigService>('vaultConfigService'), accessControl, logger: silentLogger })
app.route('/api/v1', vaultConfigRoutes)

const propertyTypeRoutes = createPropertyTypeRoutes({ propertyTypeService: stub<IPropertyTypeService>('propertyTypeService'), accessControl, vaultRegistry, logger: silentLogger })
app.route('/api/v1', propertyTypeRoutes)

const propertyRoutes = createPropertyRoutes({ linkIndexResolver: () => undefined as ILinkIndex | undefined, propertyTypeService: stub<IPropertyTypeService>('propertyTypeService'), accessControl, logger: silentLogger })
app.route('/api/v1', propertyRoutes)

// ─── Route discovery — the single source of truth, shared with the middleware ─────────────

function subPathFromRoutePattern(routePath: string): string {
  const marker = '/vaults/:vaultId'
  const idx = routePath.indexOf(marker)
  return idx === -1 ? routePath : routePath.slice(idx + marker.length)
}

function buildRequestPath(routePath: string, testVaultId: string): string {
  return routePath.replace(':vaultId', testVaultId).replace(/:[a-zA-Z0-9_]+/g, 'x')
}

interface DiscoveredRoute {
  method: string
  path: string
  subPath: string
  level: 'read' | 'write' | 'owner'
}

const vaultScopedRoutes: DiscoveredRoute[] = (app.routes as RouterRoute[])
  .filter((r) => r.method !== 'ALL' && /^\/api\/v1\/vaults\/:vaultId(\/|$)/.test(r.path))
  .map((r) => {
    const subPath = subPathFromRoutePattern(r.path)
    return { method: r.method, path: r.path, subPath, level: resolveRequiredLevel(r.method, subPath) }
  })

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Vault authorization middleware — table-driven route sweep', () => {
  it('discovered at least the routes this suite was built to cover', () => {
    // Guards against the filter regex silently matching nothing, which would make every
    // test below vacuously pass without exercising anything.
    expect(vaultScopedRoutes.length).toBeGreaterThan(50)
  })

  it('returns 404 for a vault that does not exist, regardless of caller', async () => {
    currentSession = strangerSession
    const res = await app.request(`/api/v1/vaults/${UNKNOWN_VAULT_ID}/tree`)
    expect(res.status).toBe(404)
  })

  describe.each(vaultScopedRoutes)('$method $path (level: $level)', (route) => {
    it('denies a user with no access to the vault (403)', async () => {
      currentSession = strangerSession
      const res = await app.request(buildRequestPath(route.path, VAULT_ID), { method: route.method })
      expect(res.status).toBe(403)
    })

    if (route.level === 'write' || route.level === 'owner') {
      it(`denies a read-only-share user (requires ${route.level}, 403)`, async () => {
        currentSession = readerSession
        const res = await app.request(buildRequestPath(route.path, VAULT_ID), { method: route.method })
        expect(res.status).toBe(403)
      })
    }
  })
})
