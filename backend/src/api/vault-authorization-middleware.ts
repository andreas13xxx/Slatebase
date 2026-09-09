// Vault authorization middleware — default-deny access control for vault-scoped routes.
//
// Mounted once on `/api/v1/vaults/:vaultId/*` in the composition root, ahead of every
// vault-related route registration. The required access level is derived from the HTTP
// method (GET/HEAD -> read, everything else -> write) unless the route's sub-path matches
// an entry in VAULT_ROUTE_LEVEL_EXCEPTIONS, in which case that entry wins. A newly added
// route that isn't listed here defaults to `write` — never open — which is the point: this
// file is the one place a route's required level can be looked up, and both the middleware
// and the table-driven test (vault-authorization-middleware.test.ts) resolve levels through
// the same `resolveRequiredLevel` export, so they cannot drift apart.
//
// See VAULT-ROUTE-AUTHORIZATION.md for the full route inventory this table was built from,
// including why each exception preserves today's behavior rather than tightening it.

import type { MiddlewareHandler } from 'hono'
import type { IVaultAccessControl } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import { checkVaultAccess, type VaultAccessLevel } from './access-check.js'

export interface VaultRouteLevelException {
  /** HTTP method, upper-case (e.g. 'POST'). */
  method: string
  /** Path pattern relative to `/vaults/:vaultId`, e.g. '/shares/:userId'. Empty string matches the bare vault path. */
  pathPattern: string
  level: VaultAccessLevel
}

/**
 * Routes whose enforced level differs from the HTTP-method default.
 * Every entry here preserves an existing handler's actual behavior — verified route by
 * route in VAULT-ROUTE-AUTHORIZATION.md. Do not add an entry that changes behavior; if a
 * route needs a different level than it has today, that's a separate decision, not this table.
 */
export const VAULT_ROUTE_LEVEL_EXCEPTIONS: VaultRouteLevelException[] = [
  // --- read instead of the write/patch/delete default ---
  // propertyRoutes.ts:143 — read-only filter, POST verb used for the query body only.
  { method: 'POST', pathPattern: '/properties/query', level: 'read' },
  // pluginRoutes.ts — every route in this file (including these 7 mutating ones) checks
  // read access only; collaborators are trusted to manage vault-scoped plugin state, not
  // just vault content (see snippetRoutes.ts:84-86's doc comment for the same rationale).
  { method: 'POST', pathPattern: '/plugins/detected/:pluginId/install', level: 'read' },
  { method: 'PUT', pathPattern: '/plugins/registry', level: 'read' },
  { method: 'POST', pathPattern: '/plugins', level: 'read' },
  { method: 'DELETE', pathPattern: '/plugins/:pluginId', level: 'read' },
  { method: 'PUT', pathPattern: '/plugins/:pluginId/settings', level: 'read' },
  { method: 'PUT', pathPattern: '/plugins/:pluginId/secrets/:secretId', level: 'read' },
  { method: 'DELETE', pathPattern: '/plugins/:pluginId/secrets/:secretId', level: 'read' },
  // snippetRoutes.ts — same model as pluginRoutes.ts.
  { method: 'PUT', pathPattern: '/snippets/registry', level: 'read' },
  { method: 'POST', pathPattern: '/snippets', level: 'read' },
  { method: 'PUT', pathPattern: '/snippets/:snippetId', level: 'read' },
  { method: 'DELETE', pathPattern: '/snippets/:snippetId', level: 'read' },
  // pluginStoreRoutes.ts (vault-scoped) — flagged as arguably too weak (VAULT-ROUTE-AUTHORIZATION.md
  // finding F2), deliberately not tightened in this PR to keep the authorization refactor
  // behavior-neutral and safely revertible.
  { method: 'POST', pathPattern: '/plugins/store-install', level: 'read' },
  { method: 'POST', pathPattern: '/plugins/check-updates', level: 'read' },
  { method: 'POST', pathPattern: '/plugins/update-all', level: 'read' },
  { method: 'POST', pathPattern: '/plugins/:pluginId/update', level: 'read' },

  // --- owner instead of the read/write default ---
  // vaultShareRoutes.ts — share management is owner-only, including the GET listing.
  { method: 'GET', pathPattern: '/shares', level: 'owner' },
  { method: 'POST', pathPattern: '/shares', level: 'owner' },
  { method: 'PUT', pathPattern: '/shares/:userId', level: 'owner' },
  { method: 'DELETE', pathPattern: '/shares/:userId', level: 'owner' },
  { method: 'POST', pathPattern: '/transfer', level: 'owner' },
  // vaultConfigRoutes.ts:71 — only the owner may change vault configuration.
  { method: 'PUT', pathPattern: '/config', level: 'owner' },
  // index.ts:925 — deleteVaultWithChecks() requires ownership (business/index.ts:818).
  { method: 'DELETE', pathPattern: '', level: 'owner' },
]

interface CompiledException {
  method: string
  regex: RegExp
  level: VaultAccessLevel
}

function compilePattern(pathPattern: string): RegExp {
  const escaped = pathPattern
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/')
  return new RegExp(`^${escaped}$`)
}

const COMPILED_EXCEPTIONS: CompiledException[] = VAULT_ROUTE_LEVEL_EXCEPTIONS.map((exception) => ({
  method: exception.method,
  regex: compilePattern(exception.pathPattern),
  level: exception.level,
}))

/**
 * Resolves the access level required for a vault-scoped route.
 * `subPath` is the request path relative to `/vaults/:vaultId` (e.g. '/shares/user-1', or
 * '' for the bare vault path). Checks VAULT_ROUTE_LEVEL_EXCEPTIONS first; falls back to the
 * HTTP-method default (GET/HEAD -> read, everything else -> write) for anything not listed —
 * a newly added route is never open by default.
 */
export function resolveRequiredLevel(method: string, subPath: string): VaultAccessLevel {
  const upperMethod = method.toUpperCase()
  for (const exception of COMPILED_EXCEPTIONS) {
    if (exception.method === upperMethod && exception.regex.test(subPath)) {
      return exception.level
    }
  }
  return upperMethod === 'GET' || upperMethod === 'HEAD' ? 'read' : 'write'
}

/**
 * Computes the request path relative to `/vaults/:vaultId`, regardless of what the app is
 * mounted under (`/api/v1/vaults/:vaultId/...` in production, potentially a bare
 * `/vaults/:vaultId/...` in tests). Returns '' for the bare vault path.
 */
function subPathAfterVaultId(fullPath: string, vaultId: string): string {
  const marker = `/vaults/${vaultId}`
  const idx = fullPath.indexOf(marker)
  if (idx === -1) {
    return fullPath
  }
  return fullPath.slice(idx + marker.length)
}

export interface VaultAuthorizationMiddlewareDeps {
  vaultRegistry: IVaultRegistry
  accessControl: IVaultAccessControl
}

/**
 * Creates the default-deny authorization middleware for `/api/v1/vaults/:vaultId/*`.
 * Must be registered before every vault-related route mount (app.route/app.use only guard
 * requests registered after them in Hono) — see index.ts wiring next to the feature guards.
 */
export function createVaultAuthorizationMiddleware(deps: VaultAuthorizationMiddlewareDeps): MiddlewareHandler {
  const { vaultRegistry, accessControl } = deps
  return async (c, next) => {
    const vaultId = c.req.param('vaultId')
    if (vaultId === undefined) {
      await next()
      return
    }

    const subPath = subPathAfterVaultId(c.req.path, vaultId)
    const level = resolveRequiredLevel(c.req.method, subPath)

    const result = await checkVaultAccess(c, vaultId, level, vaultRegistry, accessControl)
    if (!result.authorized) {
      return result.response
    }

    await next()
    return
  }
}
