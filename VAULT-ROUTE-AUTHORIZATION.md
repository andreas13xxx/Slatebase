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

Verified against `origin/master` @ `010785d` (2026-09-09). Line numbers reference that
commit — if drifted, re-verify rather than trust this file blindly.

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

All 4 routes use `checkVaultReadAccess()` (`access-check.ts:22-57`). All GET, all `read` —
matches the method default, no exceptions.

| Method | Full path | Registered at | Level today | Check source |
|---|---|---|---|---|
| GET | `/api/v1/vaults/:vaultId/graph` | `graphRoutes.ts:88` | read | `graphRoutes.ts:108` |
| GET | `/api/v1/vaults/:vaultId/graph/meta` | `graphRoutes.ts:89` | read | `graphRoutes.ts:151` |
| GET | `/api/v1/vaults/:vaultId/backlinks` | `graphRoutes.ts:90` | read | `graphRoutes.ts:179` |
| GET | `/api/v1/vaults/:vaultId/tags` | `graphRoutes.ts:91` | read | `graphRoutes.ts:221` |

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

Mounted via `app.route('/api/v1/vaults/:vaultId/plugins', pluginRoutes)` (`index.ts:651`).
**Every route in this file — including all 7 mutating ones — uses `checkVaultReadAccess()`
only.** This is a deliberate design choice per `.kiro/steering/structure.md` and
`snippetRoutes.ts:84-86`'s doc comment (collaborators are trusted to manage vault-scoped
customization, not just content), not an oversight. All 7 mutating routes are therefore
**Exceptions** — verhaltensneutral means preserving `read` for each.

| Method | Path in sub-app | Full effective path | Registered at | Level today | Check source |
|---|---|---|---|---|---|
| GET | `/detected` | `/api/v1/vaults/:vaultId/plugins/detected` | `pluginRoutes.ts:121` | read | `pluginRoutes.ts:127` |
| POST | `/detected/:pluginId/install` | `.../plugins/detected/:pluginId/install` | `pluginRoutes.ts:146` | **read** — Exception | `pluginRoutes.ts:161` |
| PUT | `/registry` | `.../plugins/registry` | `pluginRoutes.ts:213` | **read** — Exception | `pluginRoutes.ts:219` |
| GET | `/registry` | `.../plugins/registry` | `pluginRoutes.ts:247` | read | `pluginRoutes.ts:253` |
| GET | `/` | `.../plugins` | `pluginRoutes.ts:272` | read | `pluginRoutes.ts:278` |
| POST | `/` (ZIP upload/install) | `.../plugins` | `pluginRoutes.ts:292` | **read** — Exception | `pluginRoutes.ts:298` |
| GET | `/:pluginId` | `.../plugins/:pluginId` | `pluginRoutes.ts:363` | read | `pluginRoutes.ts:378` |
| DELETE | `/:pluginId` (uninstall) | `.../plugins/:pluginId` | `pluginRoutes.ts:395` | **read** — Exception | `pluginRoutes.ts:410` |
| GET | `/:pluginId/bundle` | `.../plugins/:pluginId/bundle` | `pluginRoutes.ts:430` | read | `pluginRoutes.ts:445` |
| GET | `/:pluginId/styles` | `.../plugins/:pluginId/styles` | `pluginRoutes.ts:469` | read | `pluginRoutes.ts:484` |
| GET | `/:pluginId/settings` | `.../plugins/:pluginId/settings` | `pluginRoutes.ts:511` | read | `pluginRoutes.ts:526` |
| PUT | `/:pluginId/settings` | `.../plugins/:pluginId/settings` | `pluginRoutes.ts:550` | **read** — Exception | `pluginRoutes.ts:565` |
| GET | `/:pluginId/secrets` | `.../plugins/:pluginId/secrets` | `pluginRoutes.ts:600` | read | `pluginRoutes.ts:618` |
| GET | `/:pluginId/secrets/:secretId` | `.../plugins/:pluginId/secrets/:secretId` | `pluginRoutes.ts:632` | read | `pluginRoutes.ts:658` |
| PUT | `/:pluginId/secrets/:secretId` | `.../plugins/:pluginId/secrets/:secretId` | `pluginRoutes.ts:675` | **read** — Exception | `pluginRoutes.ts:701` |
| DELETE | `/:pluginId/secrets/:secretId` | `.../plugins/:pluginId/secrets/:secretId` | `pluginRoutes.ts:729` | **read** — Exception | `pluginRoutes.ts:755` |

## 17. `backend/src/api/snippetRoutes.ts`

Mounted via `app.route('/api/v1/vaults/:vaultId/snippets', snippetRoutes)` (`index.ts:660`).
Same model as pluginRoutes.ts (doc comment `snippetRoutes.ts:84-86`): every route uses
`checkVaultReadAccess()` only, including all 4 mutating ones.

| Method | Path in sub-app | Full effective path | Registered at | Level today | Check source |
|---|---|---|---|---|---|
| PUT | `/registry` | `.../snippets/registry` | `snippetRoutes.ts:95` | **read** — Exception | `snippetRoutes.ts:100` |
| GET | `/registry` | `.../snippets/registry` | `snippetRoutes.ts:126` | read | `snippetRoutes.ts:131` |
| GET | `/` | `.../snippets` | `snippetRoutes.ts:145` | read | `snippetRoutes.ts:150` |
| POST | `/` (create) | `.../snippets` | `snippetRoutes.ts:162` | **read** — Exception | `snippetRoutes.ts:167` |
| GET | `/:snippetId` | `.../snippets/:snippetId` | `snippetRoutes.ts:204` | read | `snippetRoutes.ts:212` |
| PUT | `/:snippetId` (overwrite) | `.../snippets/:snippetId` | `snippetRoutes.ts:230` | **read** — Exception | `snippetRoutes.ts:238` |
| DELETE | `/:snippetId` | `.../snippets/:snippetId` | `snippetRoutes.ts:264` | **read** — Exception | `snippetRoutes.ts:272` |

## 18. `backend/src/api/pluginStoreRoutes.ts` — two factories

### 18a. `createVaultPluginStoreRoutes` — mounted at `/api/v1/vaults/:vaultId/plugins` (`index.ts:666`, same prefix as pluginRoutes, non-overlapping paths)

| Method | Path in sub-app | Full effective path | Registered at | Level today | Check source | Notes |
|---|---|---|---|---|---|---|
| POST | `/store-install` | `.../plugins/store-install` | `pluginStoreRoutes.ts:152` | **read** — Exception | `pluginStoreRoutes.ts:155` | Flagged in the original brief as too weak (installs a plugin on read access). **Not changed in this PR** — see finding F2. |
| POST | `/check-updates` | `.../plugins/check-updates` | `pluginStoreRoutes.ts:185` | **read** — Exception | `pluginStoreRoutes.ts:188` | Same as above. |
| POST | `/update-all` | `.../plugins/update-all` | `pluginStoreRoutes.ts:202` | **read** — Exception | `pluginStoreRoutes.ts:205` | Same as above; bulk-mutates every plugin in the vault. |
| POST | `/:pluginId/update` | `.../plugins/:pluginId/update` | `pluginStoreRoutes.ts:219` | **read** — Exception | `pluginStoreRoutes.ts:223` | **Not in the original brief — found during this inventory.** Same anomaly as the three above (single-plugin update on read access). Reported as finding F2 alongside them. |

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

## Findings (documentation only — not changed in this PR)

**F1 — `GET /vaults/:vaultId/mail-import/:configId/mailbox-tree` exercises a stored secret on read access.**
`mailImportRoutes.ts:242-268`. The route only requires `read`, matching the GET default —
not an authorization-level exception — but the handler decrypts the vault's stored IMAP
password and opens an outbound connection to the mail server with it. No local write occurs,
but it's a read-level route that spends a write-tier credential. Worth a policy decision
outside this PR (e.g. whether "connect using stored credentials" deserves its own tier).

**F2 — A fourth plugin-store route shares the anomaly the original brief flagged for three.**
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
`accessControl` in.

---

## Summary counts

- **83** routes matched by the `/api/v1/vaults/:vaultId/*` middleware pattern.
- **23** exceptions where the enforced level differs from the HTTP-method default (16×
  `read` instead of `write`, 7× `owner` instead of `read`/`write`) — see rows marked
  **Exception** above.
- **6** vault-related routes structurally outside the middleware pattern (`GET`/`POST
  /vaults`, `GET /search`, `GET`/`PATCH /users/me/vault-settings/:vaultId`, `POST
  /welcome-vault`), each with its own documented reason above.
- **5** findings (F1-F5) reported for awareness, none changed in this PR.
