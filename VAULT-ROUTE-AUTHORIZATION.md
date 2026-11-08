# Vault Route Authorization Inventory

Inventory of every vault-related HTTP route, the access level it enforces **today**
(before the default-deny middleware from AP13), and where that enforcement lives. This is
the source-of-truth document for:

- The exception table in `backend/src/api/vault-authorization-middleware.ts`
  (`VAULT_ROUTE_LEVEL_EXCEPTIONS`) — every row below marked **Exception** must have a
  matching entry there.
- The table-driven test (`backend/src/api/vault-authorization-middleware.test.ts`), which
  pulls its route list from the live `Hono.routes` of the wired app rather than a second
  copy of this table.
- PR 2 (handler cleanup): for each route, whether the handler-level check becomes
  redundant once the middleware enforces the same level.

Verified against `origin/master` @ `ef82dbc` (v0.78.0, 2026-11-08). The "Level today"/"before the middleware"
wording and the PR 1/PR 2 notes are historical (2026-09); the current levels are in "Current state". The table sections 1–19 were
built against `010785d` and their line numbers are **not** re-verified — re-verify rather than trust
them blindly. The levels, however, were re-checked on 2026-11-08 against
`VAULT_ROUTE_LEVEL_EXCEPTIONS` and the live route list; where they changed since the original
inventory, the sections below are corrected (§3, §16–18) and the "Current state" section at the end
is the reference.

**PR 2 status (2026-09-12, verified against `8e61aee`): done.** The handler-level checks
for every row below have been removed except the six structurally-excluded routes (§19's
list) and the findings F1–F4 (unchanged by design). See "PR 2 — handler-check removal"
below for the per-section breakdown and the exact lines each removal is justified against.
This document is now the reference for **where** authorization happens — keep it current
when a route's enforcement moves again.

**Default rule:** `GET`/`HEAD` → `read`. `POST`/`PUT`/`DELETE`/`PATCH` → `write`. Every row
where the "Level today" column differs from that default is flagged **Exception** and must
appear verbatim in the middleware's exception table — the whole point of this document is
that PR 1 changes zero behavior, only where the decision is made.

## Legend

- **Level today** — the access level actually enforced by the current handler, verified by
  reading the code (not inferred from the HTTP method).
- **Check source** — the call that enforces it.
- 404/403 note: `checkVaultReadAccess()` (`access-check.ts`) and the two owner-check call
  sites (`vaultConfigRoutes.ts`, `vaultShareRoutes.ts`) all return **404** for an unknown
  vault and **403** for a known vault without the required access. `DELETE /vaults/:vaultId`
  returns **404** for both an unknown vault *and* a known vault owned by someone else
  (see finding F3). This inconsistency is intentional to preserve in PR 1 (see Findings).

---

## 1. `backend/src/api/index.ts` — `VaultRouteModule` (core vault CRUD)

Registered via `routeModules` → `createRouter()` → `app.route('/api/v1', router)`
(`index.ts:493-510,622`).

| Method | Full path | Registered at | Level today | Check source | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/vaults` | `index.ts:910` | — (not vault-scoped) | n/a | Filters by `session.userId`; no `:vaultId`. Out of middleware pattern. |
| GET | `/api/v1/vaults/:vaultId/tree` | `index.ts:911` | read | `index.ts:220` | |
| GET | `/api/v1/vaults/:vaultId/files` | `index.ts:912` | read | `index.ts:259` | |
| PUT | `/api/v1/vaults/:vaultId/files` | `index.ts:915` | write | `index.ts:312` | |
| PUT | `/api/v1/vaults/:vaultId/move` | `index.ts:916` | write | `index.ts:583` | |
| PUT | `/api/v1/vaults/:vaultId/rename` | `index.ts:917` | write | `index.ts:644` | |
| POST | `/api/v1/vaults` | `index.ts:920` | — (not vault-scoped) | n/a | Creates a new vault; no existing vault to check. Out of middleware pattern. |
| POST | `/api/v1/vaults/:vaultId/import/file` | `index.ts:921` | write | `index.ts:418` | |
| POST | `/api/v1/vaults/:vaultId/import/folder` | `index.ts:922` | write | `index.ts:465` | |
| DELETE | `/api/v1/vaults/:vaultId` | `index.ts:925` | **owner** — Exception | `business/index.ts:801-820` via `index.ts:387` | `deleteVaultWithChecks()` compares `entry.ownerId !== ownerId`, throws `VaultNotFoundError` (404) for both unknown vault and non-owner — see finding F3. |
| DELETE | `/api/v1/vaults/:vaultId/content` | `index.ts:926` | write | `index.ts:547` | |

## 2. `backend/src/api/vaultShareRoutes.ts` — `VaultShareRouteModule`

All 5 routes use the inline `checkOwnership()` helper (`vaultShareRoutes.ts:108-131`):
`entry.ownerId !== session.userId` (line 125), 404 for unknown vault, 403 for known vault
non-owner. PR 1 consolidates this into `accessControl.checkOwnerAccess()` (same status
codes/messages preserved, see plan Schritt 2).

| Method | Full path | Registered at | Level today | Check source | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/vaults/:vaultId/shares` | `vaultShareRoutes.ts:206` | **owner** — Exception | `vaultShareRoutes.ts:233` → `125` | GET normally defaults to `read`; here it's `owner`. |
| POST | `/api/v1/vaults/:vaultId/shares` | `vaultShareRoutes.ts:209` | **owner** — Exception | `vaultShareRoutes.ts:279` → `125` | |
| DELETE | `/api/v1/vaults/:vaultId/shares/:userId` | `vaultShareRoutes.ts:212` | **owner** — Exception | `vaultShareRoutes.ts:322` → `125` | |
| PUT | `/api/v1/vaults/:vaultId/shares/:userId` | `vaultShareRoutes.ts:215` | **owner** — Exception | `vaultShareRoutes.ts:350` → `125` | |
| POST | `/api/v1/vaults/:vaultId/transfer` | `vaultShareRoutes.ts:218` | **owner** — Exception | `vaultShareRoutes.ts:391` → `125` | |

## 3. `backend/src/api/graphRoutes.ts` — `createGraphRoutes`

All routes are GET and `read` — matches the method default, no exceptions. (Originally 4 routes;
`GET /vaults/:vaultId/aliases` was added later and is listed last, `graphRoutes.ts:87`.)

| Method | Full path | Registered at | Level today | Check source |
|---|---|---|---|---|
| GET | `/api/v1/vaults/:vaultId/graph` | `graphRoutes.ts:88` | read | `graphRoutes.ts:108` |
| GET | `/api/v1/vaults/:vaultId/graph/meta` | `graphRoutes.ts:89` | read | `graphRoutes.ts:151` |
| GET | `/api/v1/vaults/:vaultId/backlinks` | `graphRoutes.ts:90` | read | `graphRoutes.ts:179` |
| GET | `/api/v1/vaults/:vaultId/tags` | `graphRoutes.ts:91` | read | `graphRoutes.ts:221` |
| GET | `/api/v1/vaults/:vaultId/aliases` | `graphRoutes.ts:87` | read | middleware default |

## 4. `backend/src/api/vaultConfigRoutes.ts` — `createVaultConfigRoutes`

| Method | Full path | Registered at | Level today | Check source | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/vaults/:vaultId/config` | `vaultConfigRoutes.ts:52` | read | `vaultConfigRoutes.ts:58` | |
| PUT | `/api/v1/vaults/:vaultId/config` | `vaultConfigRoutes.ts:71` | **owner** — Exception | `vaultConfigRoutes.ts:76-82` (inline, line 80) | PR 1 moves this to `accessControl.checkOwnerAccess()`, same 403 `FORBIDDEN`/message. |

## 5. `backend/src/api/propertyRoutes.ts` — `createPropertyRoutes`

| Method | Full path | Registered at | Level today | Check source | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/vaults/:vaultId/properties` | `propertyRoutes.ts:66` | read | `propertyRoutes.ts:71` | |
| GET | `/api/v1/vaults/:vaultId/properties/:key/values` | `propertyRoutes.ts:104` | read | `propertyRoutes.ts:110` | |
| POST | `/api/v1/vaults/:vaultId/properties/query` | `propertyRoutes.ts:143` | **read** — Exception | `propertyRoutes.ts:148` | Read-only filter/query despite POST verb. Must stay `read` — a read-share user needs it. |

## 6. `backend/src/api/propertyTypeRoutes.ts` — `createPropertyTypeRoutes`

| Method | Full path | Registered at | Level today | Check source |
|---|---|---|---|---|
| GET | `/api/v1/vaults/:vaultId/property-types` | `propertyTypeRoutes.ts:54` | read | `propertyTypeRoutes.ts:59` |
| PUT | `/api/v1/vaults/:vaultId/property-types` | `propertyTypeRoutes.ts:72` | write | `propertyTypeRoutes.ts:83` |
| PUT | `/api/v1/vaults/:vaultId/property-types/:key` | `propertyTypeRoutes.ts:118` | write | `propertyTypeRoutes.ts:130` |

## 7. `backend/src/api/searchRoutes.ts`

| Method | Full path | Registered at | Level today | Check source | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/vaults/:vaultId/search` | `searchRoutes.ts:98` | read | `searchRoutes.ts:125` | |
| GET | `/api/v1/search` | `searchRoutes.ts:137` | — (not vault-scoped) | delegated to `SearchService.searchMultiVault` (per-vault filtering inside the service, not this route) | `vaultIds` passed via query, not `:vaultId` path param — outside the middleware pattern by construction. |
| POST | `/api/v1/vaults/:vaultId/replace` | `searchRoutes.ts:180` | write | `searchRoutes.ts:206` | |

## 8. `backend/src/api/uploadRoutes.ts`

| Method | Full path | Registered at | Level today | Check source |
|---|---|---|---|---|
| POST | `/api/v1/vaults/:vaultId/upload` | `uploadRoutes.ts:129` | write | `uploadRoutes.ts:166` |

## 9. `backend/src/api/trashRoutes.ts`

| Method | Full path | Registered at | Level today | Check source |
|---|---|---|---|---|
| GET | `/api/v1/vaults/:vaultId/trash` | `trashRoutes.ts:91` | read | `trashRoutes.ts:119` |
| POST | `/api/v1/vaults/:vaultId/trash/:entryId/restore` | `trashRoutes.ts:154` | write | `trashRoutes.ts:185` |
| DELETE | `/api/v1/vaults/:vaultId/trash/:entryId` | `trashRoutes.ts:251` | write | `trashRoutes.ts:282` |

## 10. `backend/src/api/gitSyncRoutes.ts` (feature-gated: `git-sync`)

Uses local `requireVaultAccess(c, vaultId, level)` helper (`gitSyncRoutes.ts:61-93`), itself
calling `accessControl.checkReadAccess`/`checkWriteAccess`.

| Method | Full path | Registered at | Level today | Check source |
|---|---|---|---|---|
| GET | `/api/v1/vaults/:vaultId/git-sync` | `gitSyncRoutes.ts:96` | read | `gitSyncRoutes.ts:103` |
| PATCH | `/api/v1/vaults/:vaultId/git-sync/branch` | `gitSyncRoutes.ts:111` | write | `gitSyncRoutes.ts:118` |
| POST | `/api/v1/vaults/:vaultId/git-sync/generate-ssh-key` | `gitSyncRoutes.ts:138` | write | `gitSyncRoutes.ts:145` |
| POST | `/api/v1/vaults/:vaultId/git-sync/remotes` | `gitSyncRoutes.ts:153` | write | `gitSyncRoutes.ts:160` |
| PATCH | `/api/v1/vaults/:vaultId/git-sync/remotes/:remoteId` | `gitSyncRoutes.ts:200` | write | `gitSyncRoutes.ts:210` |
| DELETE | `/api/v1/vaults/:vaultId/git-sync/remotes/:remoteId` | `gitSyncRoutes.ts:265` | write | `gitSyncRoutes.ts:275` |
| POST | `/api/v1/vaults/:vaultId/git-sync/remotes/:remoteId/sync-now` | `gitSyncRoutes.ts:292` | write | `gitSyncRoutes.ts:302` |
| GET | `/api/v1/vaults/:vaultId/git-sync/remotes/:remoteId/status` | `gitSyncRoutes.ts:320` | read | `gitSyncRoutes.ts:330` |

## 11. `backend/src/api/mailImportRoutes.ts` (feature-gated: `mail-import`)

Same `requireVaultAccess` pattern (`mailImportRoutes.ts:59-91`).

| Method | Full path | Registered at | Level today | Check source | Notes |
|---|---|---|---|---|---|
| GET | `/api/v1/vaults/:vaultId/mail-import` | `mailImportRoutes.ts:94` | read | `mailImportRoutes.ts:101` | |
| POST | `/api/v1/vaults/:vaultId/mail-import` | `mailImportRoutes.ts:109` | write | `mailImportRoutes.ts:116` | |
| PATCH | `/api/v1/vaults/:vaultId/mail-import/:configId` | `mailImportRoutes.ts:144` | write | `mailImportRoutes.ts:154` | |
| DELETE | `/api/v1/vaults/:vaultId/mail-import/:configId` | `mailImportRoutes.ts:184` | write | `mailImportRoutes.ts:194` | |
| POST | `/api/v1/vaults/:vaultId/mail-import/:configId/import-now` | `mailImportRoutes.ts:211` | write | `mailImportRoutes.ts:221` | |
| GET | `/api/v1/vaults/:vaultId/mail-import/:configId/mailbox-tree` | `mailImportRoutes.ts:242` | read | `mailImportRoutes.ts:252` | Matches GET default, **not** an authorization exception. Flagged separately as finding F1 — decrypts and uses the stored IMAP password on a read-level route. Not changed in this PR. |
| GET | `/api/v1/vaults/:vaultId/mail-import/:configId/status` | `mailImportRoutes.ts:282` | read | `mailImportRoutes.ts:292` | |

## 12. `backend/src/api/transcriptionRoutes.ts` (feature-gated: `voice-transcription`)

| Method | Full path | Registered at | Level today | Check source |
|---|---|---|---|---|
| POST | `/api/v1/vaults/:vaultId/transcribe` | `transcriptionRoutes.ts:61` | write | `transcriptionRoutes.ts:79` |

## 13. `backend/src/api/templateRoutes.ts`

| Method | Full path | Registered at | Level today | Check source |
|---|---|---|---|---|
| GET | `/api/v1/vaults/:vaultId/templates` | `templateRoutes.ts:81` | read | `templateRoutes.ts:99` |
| POST | `/api/v1/vaults/:vaultId/templates/create` | `templateRoutes.ts:139` | write | `templateRoutes.ts:157` |

## 14. `backend/src/api/statisticsRoutes.ts`

| Method | Full path | Registered at | Level today | Check source |
|---|---|---|---|---|
| GET | `/api/v1/vaults/:vaultId/statistics` | `statisticsRoutes.ts:68` | read | `statisticsRoutes.ts:87` |

## 15. `backend/src/api/fileVersionRoutes.ts`

| Method | Full path | Registered at | Level today | Check source |
|---|---|---|---|---|
| GET | `/api/v1/vaults/:vaultId/versions` | `fileVersionRoutes.ts:100` | read | `fileVersionRoutes.ts:118` |
| GET | `/api/v1/vaults/:vaultId/versions/content` | `fileVersionRoutes.ts:180` | read | `fileVersionRoutes.ts:198` |
| POST | `/api/v1/vaults/:vaultId/versions/restore` | `fileVersionRoutes.ts:266` | write | `fileVersionRoutes.ts:284` |

## 16. `backend/src/api/pluginRoutes.ts` (feature-gated: `obsidian-plugin-compat`)

*Corrected 2026-11-08 (levels re-checked against `ef82dbc`; the original inventory listed 7 mutating
routes at `read`, since tightened).* Mounted via `app.route('/api/v1/vaults/:vaultId/plugins', pluginRoutes)`.
Plugin code and activation live in the vault (`.obsidian/plugins/`, `community-plugins.json`) and run in
every user's browser, so installing, uninstalling and activating need **write** (method default). The one
remaining **Exception** is a plugin's own settings (`data.json`), which plugins write while they run — a
read-only collaborator's plugin would otherwise fail on every save. The former `/detected` routes no longer exist.

| Method | Path in sub-app | Full effective path | Level now | Notes |
|---|---|---|---|---|
| PUT | `/registry` | `.../plugins/registry` | write | was read |
| GET | `/registry` | `.../plugins/registry` | read | |
| GET | `/` | `.../plugins` | read | |
| POST | `/` (ZIP upload/install) | `.../plugins` | write | was read |
| GET | `/:pluginId` | `.../plugins/:pluginId` | read | |
| DELETE | `/:pluginId` (uninstall) | `.../plugins/:pluginId` | write | was read |
| GET | `/:pluginId/bundle` | `.../plugins/:pluginId/bundle` | read | |
| GET | `/:pluginId/styles` | `.../plugins/:pluginId/styles` | read | |
| GET | `/:pluginId/settings` | `.../plugins/:pluginId/settings` | read | |
| PUT | `/:pluginId/settings` | `.../plugins/:pluginId/settings` | **read** — Exception | only remaining plugin exception |

## 17. `backend/src/api/snippetRoutes.ts`

*Corrected 2026-11-08.* Mounted via `app.route('/api/v1/vaults/:vaultId/snippets', snippetRoutes)`.
Snippets are vault content (`.obsidian/snippets/`) that applies to every user of the vault: reads need
`read`, every mutating route needs **write**. No exception in `VAULT_ROUTE_LEVEL_EXCEPTIONS` (the
originally documented 4 `read` exceptions were removed).

| Method | Path in sub-app | Full effective path | Level now |
|---|---|---|---|
| PUT | `/registry` | `.../snippets/registry` | write |
| GET | `/registry` | `.../snippets/registry` | read |
| GET | `/` | `.../snippets` | read |
| POST | `/` (create) | `.../snippets` | write |
| GET | `/:snippetId` | `.../snippets/:snippetId` | read |
| PUT | `/:snippetId` (overwrite) | `.../snippets/:snippetId` | write |
| DELETE | `/:snippetId` | `.../snippets/:snippetId` | write |

## 18. `backend/src/api/pluginStoreRoutes.ts` — two factories

### 18a. `createVaultPluginStoreRoutes` — mounted at `/api/v1/vaults/:vaultId/plugins` (same prefix as pluginRoutes, non-overlapping paths)

*Corrected 2026-11-08.* Installing and updating write plugin code into the vault, so they need **write**
(method default); finding F2 is resolved. Only the update check, which changes nothing, stays at read.

| Method | Path in sub-app | Full effective path | Level now | Notes |
|---|---|---|---|---|
| POST | `/store-install` | `.../plugins/store-install` | write | was read |
| POST | `/check-updates` | `.../plugins/check-updates` | **read** — Exception | POST verb, read-only |
| POST | `/update-all` | `.../plugins/update-all` | write | was read |
| POST | `/:pluginId/update` | `.../plugins/:pluginId/update` | write | was read |

### 18b. `createPluginStoreRoutes` — mounted at `/api/v1/plugin-store` (`index.ts:665`), **not vault-scoped**

| Method | Full path | Registered at | Level today | Notes |
|---|---|---|---|---|
| GET | `/api/v1/plugin-store/plugins` | `pluginStoreRoutes.ts:71` | session-only | No `:vaultId` anywhere — community catalog browse, not vault content. Out of middleware pattern. |
| GET | `/api/v1/plugin-store/plugins/stats` | `pluginStoreRoutes.ts:91` | session-only | Same. |
| GET | `/api/v1/plugin-store/plugins/:pluginId/manifest` | `pluginStoreRoutes.ts:106` | session-only | Same. `accessControl`/`vaultRegistry` are on `PluginStoreRouteDependencies` but this factory (`pluginStoreRoutes.ts:67`) never destructures them — confirmed no vaultId is taken via query/body either. |

## 19. Not under `/vaults/` at all

| Method | Full path | Registered at | Level today | Notes |
|---|---|---|---|---|
| GET | `/api/v1/users/me/vault-settings/:vaultId` | `preferencesRoutes.ts:255` | **none** | Has a `:vaultId`-shaped param but is a per-user preferences record, not vault content. No `vaultRegistry`/`accessControl` even wired into this module. Deliberately out of scope (writes only the caller's own preferences, keyed by `session.userId`) — see finding F4. |
| PATCH | `/api/v1/users/me/vault-settings/:vaultId` | `preferencesRoutes.ts:267` | **none** | Same as above — this is the one route the original brief explicitly calls out as "not under `/vaults/`". Its GET sibling has the identical gap and is documented here too rather than silently. |
| POST | `/api/v1/welcome-vault` | `welcomeVaultRoutes.ts:158` | — (not vault-scoped) | Creates a brand-new vault for the caller; no existing vault to check against. Session + per-user rate limit only. |

---

## PR 2 — handler-check removal (2026-09-12)

> **Historical, as of `8e61aee` (2026-09-12).** This section records what PR 2 removed and the levels
> that were enforced at that time. Levels have changed since (plugin/snippet/plugin-store mutations,
> `/detected*` routes gone, `store-install`/`update-all`/`:pluginId/update` now `write`): the tables in
> §1–19 and "Current state" at the end are authoritative, not the level statements below.

For every route below, the handler-level check was **removed** because §-referenced row
above shows the middleware now enforces the identical level — removal is belegt
(evidenced) by that row, not a fresh decision. Routes not listed here either kept their
check (it checked more than the middleware) or are one of the six structurally-excluded
routes / F1–F4 findings, both untouched.

- **§1 `index.ts` core CRUD** — `getVaultTree`, `getFileContent`, `saveFile`, `importFile`,
  `importFolder`, `deleteContent`, `moveContent`, `renameContent` all dropped their
  `this.accessControl.checkReadAccess`/`checkWriteAccess` call (previously guarded by
  `if (this.accessControl)` — see Finding F5 below for why that guard itself is gone too).
  `DELETE /vaultId`'s ownership check in `business/index.ts` (`deleteVaultWithChecks`) is
  untouched — it's not an `accessControl.check*` call, see Finding F3.
- **§2 `vaultShareRoutes.ts`** — all 5 routes' `checkOwnership()` helper no longer calls
  `accessControl.checkOwnerAccess()`; renamed to `requireSession()`, now only extracts the
  session (401 if missing).
- **§3 `graphRoutes.ts`** — all 4 routes dropped their `checkVaultReadAccess()` call; the
  now-unused `accessControl`/`vaultRegistry` constructor fields were removed from the class.
- **§4 `vaultConfigRoutes.ts`** — both GET (read) and PUT (owner) dropped their check.
- **§5 `propertyRoutes.ts`** — all 3 routes dropped their `checkReadAccess()` call.
- **§6 `propertyTypeRoutes.ts`** — GET and both PUT routes dropped their check.
- **§7 `searchRoutes.ts`** — only the vault-scoped `GET /vaults/:vaultId/search` and
  `POST /vaults/:vaultId/replace` dropped their check. `GET /search` (global, §19 list) is
  untouched — it has no handler-level check to remove; its per-vault filtering inside
  `SearchService.searchMultiVault` is exactly what makes it safe and was not touched.
- **§8 `uploadRoutes.ts`** — the one route dropped its check.
- **§9 `trashRoutes.ts`** — all 3 routes dropped their check.
- **§10 `gitSyncRoutes.ts`** — all 8 routes' local `requireVaultAccess(c, vaultId, level)`
  helper no longer calls `accessControl.check*`; renamed to `requireVaultContext(c, vaultId)`
  (session + vault-existence only, no `level` param).
- **§11 `mailImportRoutes.ts`** — same pattern as gitSyncRoutes.ts, all 7 routes.
  `mailbox-tree`'s check removal is covered by this row too — Finding F1 (spending a
  write-tier credential on a read-level route) is about the route's *policy*, not this
  check's redundancy with the middleware, and is otherwise unchanged.
- **§12 `transcriptionRoutes.ts`** — the one route dropped its check.
- **§13 `templateRoutes.ts`** — both routes dropped their check.
- **§14 `statisticsRoutes.ts`** — the one route dropped its check.
- **§15 `fileVersionRoutes.ts`** — all 3 routes dropped their check.
- **§16 `pluginRoutes.ts`** — all 16 routes (including the 7 **Exception** rows) dropped
  their `checkVaultReadAccess()` call — the middleware's exception table enforces the same
  `read` level via `VAULT_ROUTE_LEVEL_EXCEPTIONS`.
- **§17 `snippetRoutes.ts`** — all 7 routes (including the 4 **Exception** rows), same as
  pluginRoutes.ts.
- **§18a `pluginStoreRoutes.ts` (vault-scoped)** — all 4 routes (all **Exception** rows,
  `read` per F2) dropped their check. Finding F2 (arguably too weak) is unchanged — the
  level itself was not tightened, only where it's enforced moved.
- **§18b `pluginStoreRoutes.ts` (global `/plugin-store`)** — untouched; never had a
  vault-scoped check to remove (confirmed: `accessControl`/`vaultRegistry` are on
  `PluginStoreRouteDependencies` but this factory never destructures them).

**Not touched, by design:**
- The six structurally-excluded routes in §19's summary (`GET`/`POST /vaults`, `GET
  /search`, `GET`/`PATCH /users/me/vault-settings/:vaultId`, `POST /welcome-vault`).
- Findings F1–F4 (policy decisions, not this PR's scope).
- `mcp/tool-handlers.ts`, `mcp/handlers.ts`, `search/search-service.ts` — these call
  `accessControl.check*` too, but over MCP's own transport or as search's internal
  per-vault filtering, neither of which the Hono vault-authorization-middleware covers.

**Finding F5 resolved.** `VaultController`'s `accessControl` constructor parameter is no
longer optional (`api/index.ts`) — every construction site must now pass a real
`IVaultAccessControl`. `vault-controller-access.test.ts`'s back-compat "skips the access
check when no accessControl is wired" test was deleted along with the rest of that file's
now-obsolete handler-level 403 assertions (equivalent coverage already existed at the
correct layer in `vault-authorization-middleware.test.ts`/`integration.test.ts`); the file
keeps only the success-path and `VaultNotFoundError` 404-mapping tests, which are unrelated
to access control and still valid. `publishVaultChange()`'s broadcast fallback for an
unwired `accessControl` was removed accordingly — it can no longer be unwired.

---

## Findings (documentation only — not changed in this PR)

**F1 — `GET /vaults/:vaultId/mail-import/:configId/mailbox-tree` exercises a stored secret on read access.**
`mailImportRoutes.ts:242-268`. The route only requires `read`, matching the GET default —
not an authorization-level exception — but the handler decrypts the vault's stored IMAP
password and opens an outbound connection to the mail server with it. No local write occurs,
but it's a read-level route that spends a write-tier credential. Worth a policy decision
outside this PR (e.g. whether "connect using stored credentials" deserves its own tier).

**F2 — A fourth plugin-store route shares the anomaly the original brief flagged for three.** *(Resolved: `store-install`, `update-all` and `:pluginId/update` now require write; only `check-updates` stays at read — see §18a. Text below is the original 2026-09 finding.)*
`POST /vaults/:vaultId/plugins/:pluginId/update` (`pluginStoreRoutes.ts:219-223`) was not in
the original list of "too-weak" plugin-store routes (`store-install`, `check-updates`,
`update-all`) but has the identical shape: it mutates plugin state behind only a
`checkVaultReadAccess()` call. Same disposition as the other three — documented as `read` in
the exception table, not tightened in this PR, since any authorization tightening bundled
into a default-deny refactor is no longer safely revertible if it breaks something.

**F3 — `DELETE /vaults/:vaultId` has a third, independent 404-vs-403 pattern.**
Unlike `checkVaultReadAccess()` and the two owner-check call sites (404 unknown vault, 403
known-vault-no-access), `deleteVaultWithChecks()` (`business/index.ts:801-820`) returns
**404** (`VaultNotFoundError`) for *both* an unknown vault and a known vault the caller
doesn't own (line 818-820: `if (!entry || entry.ownerId !== ownerId) throw new
VaultNotFoundError(vaultId)`). This is preserved as-is in PR 1 — no cross-route 404/403
unification is attempted (see the brief's explicit instruction not to change this
behavior).

**F4 — `GET /users/me/vault-settings/:vaultId` has the same scope gap as its documented PATCH sibling.**
The original brief calls out only the PATCH route as "not under `/vaults/`, decide
deliberately whether in scope." Its GET sibling (`preferencesRoutes.ts:255`) has the
identical shape and the identical answer: out of scope, since it's a per-user preferences
record (not vault content) with no vault-existence or vault-access check at all today. Both
are documented here rather than only the one the brief named.

**F5 — `VaultController`'s `accessControl` dependency is optional, making today's enforcement
opt-in per wiring rather than structural.** `index.ts:143-150` (constructor),
`vault-controller-access.test.ts:106-113` (an existing test explicitly asserts the
back-compat skip-when-unwired behavior). Always correctly wired in production
(`index.ts:470`), so not a live gap — but it's the exact failure mode this AP's middleware
eliminates: enforcement no longer depends on every call site remembering to pass
`accessControl` in. **Resolved in PR 2** — see "PR 2 — handler-check removal" above.

---

## Summary counts

*Original counts (2026-09, superseded — the current ones are in "Current state" at the end):*

- **83** routes matched by the `/api/v1/vaults/:vaultId/*` middleware pattern.
- **23** exceptions where the enforced level differs from the HTTP-method default (16×
  `read` instead of `write`, 7× `owner` instead of `read`/`write`) — see rows marked
  **Exception** above.
- **6** vault-related routes structurally outside the middleware pattern (`GET`/`POST
  /vaults`, `GET /search`, `GET`/`PATCH /users/me/vault-settings/:vaultId`, `POST
  /welcome-vault`), each with its own documented reason above.
- **5** findings (F1-F5) reported for awareness, none changed in this PR.

## Addendum — `backend/src/api/themeRoutes.ts` (Obsidian themes, 2026-10-19)

Added after the inventory above, so the counts above do not include it. Mounted via
`app.route('/api/v1/vaults/:vaultId/themes', themeRoutes)` (`index.ts`). The routes contain no access
checks of their own: the middleware default applies, and **no exception was added** — unlike the snippet and plugin routes as they were originally documented (since tightened to write, see §16–17)
and plugins, mutating theme routes require **write** access, because a theme is a file in the vault
(`.obsidian/themes/`) and the selection (`.obsidian/appearance.json`) applies to every user of the vault.

| Method | Path | Level |
|---|---|---|
| GET | `.../themes`, `.../themes/active`, `.../themes/:themeId` | read |
| PUT | `.../themes/active`, `.../themes/:themeId` | write |
| DELETE | `.../themes/:themeId` | write |

## Addendum — `backend/src/api/themeStoreRoutes.ts` (Community theme store, 2026-10-21)

Mounted via `app.route('/api/v1/vaults/:vaultId/theme-store', …)` and `app.route('/api/v1/theme-store', …)`
(`index.ts`), both behind the `obsidian-theme-store` feature guard. As with themes, the routes contain no access checks
of their own and **no exception was added**: the update check is a GET (read); installing writes theme files that apply
to everyone who opens the vault, so it needs **write**. `/theme-store/themes` and `/theme-store/screenshot` involve no
vault and only need a session.

| Method | Path | Level |
|---|---|---|
| GET | `.../theme-store/updates` | read |
| POST | `.../theme-store/install` | write |
| GET | `/api/v1/theme-store/themes`, `/api/v1/theme-store/screenshot` | session only (no vault) |

## Addendum — `backend/src/api/publicShareRoutes.ts` (Public share links, 2026-10-23)

Management routes are mounted via `app.route('/api/v1', …)` (`index.ts`) behind the `public-shares` feature guard (default
**off**). A public link publishes note content outside the server, so even the two GETs get an **exception to `write`**
(`VAULT_ROUTE_LEVEL_EXCEPTIONS`). The handlers additionally check that a link ID belongs to the vault in the URL, so write
access to one vault never reaches another vault's links.

| Method | Path | Level |
|---|---|---|
| POST | `.../public-shares` | write |
| GET | `.../public-shares`, `.../public-shares/preview` | write (exception) |
| PUT, DELETE | `.../public-shares/:id` | write |
| GET | `/api/v1/public-shares` | session only (own links) |
| DELETE | `/api/v1/public-shares/:id` | session only, creator only |

The anonymous reader routes `GET /api/v1/public/s/:token`, `POST …/unlock`, `GET …/asset` are **not** vault-scoped and
bypass session auth and CSRF in `auth/middleware.ts` (`isPublicSharePath`: strict token pattern, only those three
method/path combinations). The link token is the credential; the routes have their own rate limits and answer 404 for
unknown, expired and revoked links alike (and for everything while the feature is off).

## Addendum — `backend/src/api/keychainRoutes.ts` (Vault keychain, 2026-10-29)

Mounted at `/api/v1/vaults/:vaultId/keychain`. The keychain is shared by every plugin of the vault, so unlike the old
per-plugin secrets (read-level `PUT`/`DELETE`) reading a value and every change need **write** access; listing the entry
IDs stays at read and reveals no values. `GET .../keychain/:secretId` is an exception to `write` in
`VAULT_ROUTE_LEVEL_EXCEPTIONS` (the method default would be read).

| Method | Path | Level |
|---|---|---|
| GET | `.../keychain` | read (IDs only) |
| GET | `.../keychain/:secretId` | write (exception) |
| PUT, DELETE | `.../keychain/:secretId` | write |

## Addendum — `backend/src/api/appConfigRoutes.ts` (Vault `app.json`, 2026-10-29)

Mounted at `/api/v1/vaults/:vaultId/app-config`. The file is `.obsidian/app.json` and applies to every user of the vault,
so it follows the method default: no exception in `VAULT_ROUTE_LEVEL_EXCEPTIONS`.

| Method | Path | Level |
|---|---|---|
| GET | `.../app-config` | read |
| PATCH | `.../app-config` | write |

## Addendum — `backend/src/api/appearanceConfigRoutes.ts` (Vault `appearance.json`, 2026-10-31)

Mounted at `/api/v1/vaults/:vaultId/appearance-config`. The file is `.obsidian/appearance.json`; like app.json it applies to
every user of the vault and follows the method default: no exception in `VAULT_ROUTE_LEVEL_EXCEPTIONS`.

| Method | Path | Level |
|---|---|---|
| GET | `.../appearance-config` | read |
| PATCH | `.../appearance-config` | write |

## Addendum — `graphConfigRoutes.ts` and `bookmarksConfigRoutes.ts` (2026-10-31)

Mounted at `/api/v1/vaults/:vaultId/graph-config` (`.obsidian/graph.json`) and `/api/v1/vaults/:vaultId/bookmarks-config`
(`.obsidian/bookmarks.json`). Both files apply to every user of the vault and follow the method default: no exception in
`VAULT_ROUTE_LEVEL_EXCEPTIONS`.

| Method | Path | Level |
|---|---|---|
| GET | `.../graph-config`, `.../bookmarks-config` | read |
| PATCH | `.../graph-config`, `.../bookmarks-config` | write |

## Addendum — `hotkeysConfigRoutes.ts` (2026-10-31)

Mounted at `/api/v1/vaults/:vaultId/hotkeys-config` (`.obsidian/hotkeys.json`). The file applies to every user of the
vault and follows the method default: no exception in `VAULT_ROUTE_LEVEL_EXCEPTIONS`.

| Method | Path | Level |
|---|---|---|
| GET | `.../hotkeys-config` | read |
| PATCH | `.../hotkeys-config` | write |

## Addendum — `workspacesConfigRoutes.ts` (2026-11-01)

Mounted at `/api/v1/vaults/:vaultId/workspaces-config` (`.obsidian/workspaces.json`). The saved layouts apply to every
user of the vault and follow the method default: no exception in `VAULT_ROUTE_LEVEL_EXCEPTIONS`. (`workspace.json`, the
open tabs of one user, is not served and not written.)

| Method | Path | Level |
|---|---|---|
| GET | `.../workspaces-config` | read |
| PATCH | `.../workspaces-config` | write |

## Addendum — `obsidianConfigRoutes.ts` (shared factory, 2026-11-08)

Not a route set of its own: `createObsidianConfigRoutes()` builds the `GET /` + `PATCH /` pair that
`appConfigRoutes`, `appearanceConfigRoutes`, `graphConfigRoutes`, `bookmarksConfigRoutes`,
`hotkeysConfigRoutes` and `workspacesConfigRoutes` mount under `/api/v1/vaults/:vaultId/<name>-config`.
All six follow the method default (GET `read`, PATCH `write`) and have **no entry** in
`VAULT_ROUTE_LEVEL_EXCEPTIONS`; the handlers perform no access check of their own. Each PATCH publishes
`vault:change` for the file. The six sets are listed in the addenda above.

## Addendum — `backend/src/api/activityRoutes.ts` (Activity timeline, 2026-11-08)

Mounted via `app.route('/api/v1', activityRoutes)`, behind the `activity-timeline` feature guard (default **off**,
`app.use('/api/v1/vaults/:vaultId/activity', …)`). The handler has no access check of its own; the middleware default
applies and **no exception** exists. The route returns event types, file paths and acting users of the whole vault,
which every reader of the vault can see anyway in the tree and the file versions.

| Method | Path | Level |
|---|---|---|
| GET | `.../activity` | read |

## Addendum — `backend/src/api/basesRoutes.ts` (Bases query, 2026-11-08)

Mounted via `app.route('/api/v1', basesRoutes)`, behind the `bases` feature guard (`.../bases/*`). No access check in
the handler, and — unlike `POST .../properties/query` — **no exception**: the query is read-only, but the POST verb
makes the middleware default `write`. Effect: a collaborator with only a read share is answered 403 and cannot open a
`.base` view (finding F6 below). Not a leak; the restriction is stricter than necessary.

| Method | Path | Level |
|---|---|---|
| POST | `.../bases/query` | write (method default; read would suffice, see F6) |

## Addendum — `backend/src/api/spellcheckDictionaryRoutes.ts` (personal spellcheck words, 2026-11-08)

Mounted via `app.route('/api/v1', …)`, no feature guard. The words live in `<vault>/.slatebase/spellcheck-words.json`
and are shared by everyone who opens the vault (and travel with Git Sync). No access check in the handlers, no
exception: reading is `read`, adding and removing need `write`. Removal is a POST with the word in the body, so it
falls under the write default too.

| Method | Path | Level |
|---|---|---|
| GET | `.../spellcheck/words` | read |
| POST | `.../spellcheck/words` | write |
| POST | `.../spellcheck/words/remove` | write |

## Addendum — `publicShareRoutes.ts`, completion (2026-11-08)

The table in the 2026-10-23 addendum omits one route: `POST .../public-shares/:id/regenerate` (new link token for an
existing share). Method default, **write**; the handler checks that the link ID belongs to the vault in the URL like
the PUT/DELETE siblings.

## Routes outside the vault middleware (2026-11-08)

Not under `/api/v1/vaults/:vaultId/*`, listed so the inventory is complete. None of them reads vault content.

| Method | Path | Source | Auth |
|---|---|---|---|
| GET | `/healthz`, `/readyz` | `healthRoutes.ts` | none (mounted at the app root, outside `/api/v1/*`; liveness/readiness only) |
| GET | `/api/v1/version` | `versionRoutes.ts` | none (explicitly skipped in `auth/middleware.ts`) |
| GET | `/api/v1/map-config` | `mapConfigRoutes.ts` | session. The handler comment says "Public, no authentication", but the route is registered under `/api/v1/*` and only `/api/v1/version` and the public-share reader paths bypass the auth middleware — the comment is wrong (finding F7). Returns only the operator's tile URL and attribution |
| GET | `/api/v1/releases` | `releaseRoutes.ts` | session (GitHub release list, cached by `release-info/`) |
| GET | `/api/v1/theme-store/themes`, `/theme-store/screenshot` | `themeStoreRoutes.ts` | session, feature `obsidian-theme-store` |
| GET | `/api/v1/public-shares`, DELETE `/api/v1/public-shares/:id` | `publicShareRoutes.ts` | session, own links only |
| GET | `/api/v1/public/s/:token`, POST `…/unlock`, GET `…/asset` | `publicShareRoutes.ts` (reader) | anonymous, link token is the credential |

## New findings (2026-11-08, documentation only — nothing changed)

**F6 — `POST .../bases/query` requires write for a read-only operation.** `basesRoutes.ts:101`, no entry in
`VAULT_ROUTE_LEVEL_EXCEPTIONS`. Read-only collaborators get 403 on every Bases view. Fix would be one exception row
(`POST /bases/query` → `read`), the same as `/properties/query`. Left open: it is a policy/behavior change, not a doc fix.

**F7 — `mapConfigRoutes.ts:35` documents the route as public, but it needs a session.** Code behavior is the safer
one (see the table above); only the comment is misleading.

**F8 — The table-driven test does not cover every vault route.** `vault-authorization-middleware.test.ts` wires
`app` by hand; it does not mount the theme routes, theme-store vault routes, `hotkeys-config`, `workspaces-config`,
activity, bases or spellcheck routes (17 routes), so the 403 sweep cannot detect a missing guard on them. The
default-deny middleware itself is mounted in `index.ts` for all of them, so this is a test-coverage gap, not an
access gap. The test does **not** parse this document either (it only shares `resolveRequiredLevel` with the
middleware), so the document cannot be checked against the code mechanically.

## Current state (2026-11-08, `ef82dbc`)

- **111** routes match `/api/v1/vaults/:vaultId/*` (94 mounted in the test harness, 17 not: themes 6, theme-store 2,
  hotkeys-config 2, workspaces-config 2, activity 1, bases 1, spellcheck 3). Counting method: the harness figure is
  the number of entries in `app.routes` with a method other than `ALL` whose path matches
  `^/api/v1/vaults/:vaultId(/|$)` (the same filter as the test, dumped once with a temporary test); the 17 are
  counted from the route registrations of the unmounted modules. An earlier count of 112/95 wrongly included the
  one `ALL` entry, the authorization middleware itself (`app.use('/api/v1/vaults/:vaultId/*')`).
- **13** entries in `VAULT_ROUTE_LEVEL_EXCEPTIONS`: 3× `read` instead of `write` (`POST /properties/query`,
  `PUT /plugins/:pluginId/settings`, `POST /plugins/check-updates`), 3× `write` instead of `read`
  (`GET /public-shares`, `GET /public-shares/preview`, `GET /keychain/:secretId`), 7× `owner` (`GET`/`POST /shares`,
  `PUT`/`DELETE /shares/:userId`, `POST /transfer`, `PUT /config`, `DELETE` of the vault itself).
- Unchanged: routes outside the middleware pattern (§19 and the "Routes outside the vault middleware" table above).
- Open findings: F1, F3, F4, F6, F7, F8 (F2 and F5 resolved).
