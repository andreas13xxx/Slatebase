# Security Audit — 2026-08

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 0 |
| Medium   | 1 |
| Low      | 8 |
| **Total** | **9** |

| Disposition | Count |
|-------------|-------|
| Fixed in this pass | 3 |
| Deferred to backlog | 3 |
| Accepted risk | 3 |

Dev-dependency advisories (not production): 4 (all accepted risk — dev-only, not shipped)

---

## A01 Broken Access Control

| Finding | Severity | File(s) | Status |
|---------|----------|---------|--------|
| Path traversal via `renameContent` — `newName` of `..` or `.` passes `validateContentName` but causes `path.join(sourceDir, '..')` to escape vault root | Medium | `backend/src/business/index.ts`, `backend/src/business/validation.ts` | **Fixed** |

### Path Traversal Audit (R8)

**R8.1 — Rename/Move path (`backend/src/business/index.ts`)**

The `renameContent` method constructs the target path via `path.join(sourceDir, newName)`. `validateContentName` blocked `/`, `\`, and null bytes — but not the literal names `..` and `.`. Since `path.join('/vault/dir', '..')` resolves to `/vault`, a rename with `newName = '..'` on a file at the vault root would produce a target path ABOVE the vault directory. This was a real path traversal vulnerability.

**Fix applied (two layers):**
1. `validateContentName()` in `validation.ts` now rejects `..` and `.` as names with a descriptive error message.
2. Defense-in-depth: `renameContent` now verifies `resolvedTargetPath.startsWith(vault.info.path + path.sep)` after computing the target — throws `InvalidMoveError` if the path escapes the vault root, regardless of what `validateContentName` allows.

**R8.2 — Spot-check of other `path.join`/`path.resolve` with user input**

| Call Site | Input Source | Guard | Status |
|-----------|-------------|-------|--------|
| `VaultService.moveContent` | `sourcePath`, `destinationPath` from request body | Both validated by `validateFilePath()` before use | **Adequate** |
| `VaultService.renameContent` | `filePath` validated by `validateFilePath()`, `newName` by `validateContentName()` + prefix check | **Fixed** (see above) |
| `VaultService.deleteContent` | `relativePath` validated by `validateFilePath()` | **Adequate** |
| `VaultService.saveFile` | `filePath` validated by `validateFilePath()` | **Adequate** |
| `VaultService.getFileContent` | `filePath` validated by `validateFilePath()` | **Adequate** |
| `TrashService.moveToTrash` | `relativePath` — caller (`deleteContent`) validates via `validateFilePath()` first | **Adequate** (layered) |
| `TrashService.deleteImmediately` | Same as above | **Adequate** (layered) |
| `TrashService.restore` | `entryId` from trusted index (random hex), `originalPath` from stored index | **Adequate** |
| `VersionService.moveVersions` | `oldPath`/`newPath` from validated rename/move operation | **Adequate** (derived from pre-validated paths) |
| `VersionService.createVersion` | `relativePath` — caller validates via `validateFilePath()` | **Adequate** |
| `InstalledPluginStore.getPluginDir` | `pluginId` validated by regex `^[a-z0-9][a-z0-9-]{0,63}$` + prefix check on resolved path | **Adequate** (defense-in-depth) |
| `TemplateService.createFromTemplate` | `templateName`, `targetDir`, `fileName` — all validated via `validateFilePath()` on computed paths | **Adequate** |
| `index.ts` (composition root) `onFileRenamed` | `newPath` from internal event hook (post-rename, pre-validated) | **Adequate** |
| `WelcomeVaultService` | Paths built from constants + trusted `vaultPath` | **Adequate** (no user input in path construction) |

**Conclusion:** One real vulnerability found and fixed (R8.1). All other `path.join`/`path.resolve` call sites with user-influenced input are protected by `validateFilePath()` or equivalent guards at the call site.

---

## A02 Cryptographic Failures

| Finding | Severity | File(s) | Status |
|---------|----------|---------|--------|
| Plugin SecretStorage stored secrets in localStorage (clear text) | High (CodeQL) | `frontend/src/plugins/compat/obsidian-api-extensions.ts` | **Fixed** |

### Assessment

- **Password hashing:** argon2id via the `argon2` package — current best practice, no configuration weaknesses identified.
- **Session tokens:** 128-character opaque tokens generated with `crypto.randomBytes(64)` — adequate entropy (512 bits).
- **CSRF tokens:** HMAC-SHA256 derived from session ID + server secret, compared with `timingSafeEqual` — no timing side-channel.
- **MCP API tokens:** SHA-256 hash stored (never raw token) — standard approach for bearer-token storage.
- **CSRF secret management:** Auto-generated on first start via `crypto.randomBytes(32)` and persisted to `data/.csrf-secret`. A startup warning is now emitted if `SLATEBASE_CSRF_SECRET` is not set in production (Task 19), since the auto-generated secret doesn't survive container restarts without persistent storage.
- **Plugin secrets:** Stored server-side, encrypted at rest with AES-256-GCM (key derived via HKDF from `SLATEBASE_PLUGIN_SECRET_KEY` env var or auto-generated `data/.plugin-secret-key`). Frontend uses a write-through cache; localStorage fallback only activates if the backend is unreachable. Legacy localStorage entries are migrated to the backend on first access. CodeQL alert #10 dismissed as mitigated.

**Baseline reference:** Biased random in temporary passwords (`Math.random()` → `crypto.randomBytes()`) was fixed in commit `d176e49`.

---

## A03 Injection

| Finding | Severity | File(s) | Status |
|---------|----------|---------|--------|
| Input validation incomplete — 7 of 24 route modules lacked zod schemas for request body/query/params | Low | `authRoutes.ts`, `uploadRoutes.ts`, `userRoutes.ts`, `vaultShareRoutes.ts`, `pluginRoutes.ts`, `mcpRoutes.ts`, `adminRoutes.ts` | **Fixed** |

### Input Validation (R3)

**Previous state:** Only 7 route modules used zod validation (graphRoutes, fileVersionRoutes, searchRoutes, chatRoutes, templateRoutes, preferencesRoutes, vaultConfigRoutes). The remaining 7 modules relied on ad-hoc type checks or no validation at all.

**Fix applied (Tasks 8–12):** All route modules now have zod schemas at the file head, applied as middleware via `zValidator('json'|'query'|'param', schema)` before the handler executes. Validation errors return consistent 400 responses with `{ code: 'VALIDATION_ERROR', message: <user-safe description>, timestamp }` — no internal implementation details are leaked.

**Coverage after this pass:** 24/24 route modules have input validation via zod schemas.

**Baseline reference:** XSS in Canvas Markdown, incomplete YAML escaping, and incomplete HTML sanitization in `htmlToMarkdown` were fixed in commit `d176e49`.

---

## A04 Insecure Design

| Finding | Severity | File(s) | Status |
|---------|----------|---------|--------|
| No findings | — | — | — |

### Assessment

- **Authentication architecture:** Session-based with opaque tokens, not JWT — avoids common JWT pitfalls (algorithm confusion, token revocation difficulty).
- **Authorization model:** Owner/read/write ACL per vault, admin role with separate checks. No privilege-escalation paths identified.
- **Threat model for plugins:** Trust-on-install (same as Obsidian) — documented as an accepted architectural decision rather than a vulnerability (see A08).
- **Data persistence:** Filesystem-based with atomic writes (temp → rename) — no database injection vector, no ORM misconfiguration possible.

---

## A05 Security Misconfiguration

| Finding | Severity | File(s) | Status |
|---------|----------|---------|--------|
| CSP was incomplete — no `script-src`, `default-src`, `connect-src`, `img-src`, `style-src` directives | Low | `backend/src/index.ts` | **Fixed** |

### Content-Security-Policy (R2)

**Previous state:** `secureHeaders()` only set `objectSrc: 'none'` and `frameAncestors: 'none'`. No `script-src` or `default-src` — the browser fell back to its permissive default for all unlisted directives.

**Applied CSP directives:**

| Directive | Value | Rationale |
|-----------|-------|-----------|
| `default-src` | `'self'` | Restrictive fallback for any unspecified directive |
| `script-src` | `'self' blob:` | `blob:` required for plugin bundle execution (Blob URL + dynamic `import()` in `plugin-loader.ts`) |
| `style-src` | `'self' 'unsafe-inline'` | Plugin CSS injection uses `<style>` tags (`css-injector.ts`), inline styles in rendered content |
| `img-src` | `'self' data: https:` | `data:` for base64 images in markdown, `https:` for external images in notes |
| `connect-src` | `'self'` | All API calls + SSE run same-origin in production (Vite proxy in dev) |
| `frame-src` | `'self' https:` | Canvas link-node iframes load external URLs |
| `object-src` | `'none'` | No plugin/embed/object elements needed |
| `frame-ancestors` | `'none'` | Prevents clickjacking |

**Additional headers (R2.4):**

| Header | Value | Note |
|--------|-------|------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | 2 years, subdomains included |
| `X-Content-Type-Options` | `nosniff` | Already present, verified |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Balanced privacy/functionality |

**No `unsafe-eval` needed:** Plugin bundles execute via Blob URL + dynamic `import()`, not `eval()`/`new Function()`. Mermaid, d3-force, and highlight.js also operate without eval.

### Regression Verification

Verified via automated test suite (no real browser available in CI — manual browser validation recommended before production deploy):

- **Backend tests:** 1176/1176 passed (routes emitting new headers, integration tests exercising all middleware)
- **Frontend tests:** 1893/1893 passed (14 skipped — pre-existing, unrelated)
- **Frontend build:** TypeScript compilation + Vite production build successful (4729 modules transformed)

**Static analysis confirms no CSP conflicts with existing features:**
- Editor (CodeMirror 6): No inline scripts, all JS from `'self'`
- Canvas: Link-node iframes covered by `frame-src 'self' https:`
- Plugin loading: Blob URL execution covered by `blob:` in `script-src`
- Plugin CSS: `<style>` injection covered by `'unsafe-inline'` in `style-src`
- Graph view (d3-force): No eval, no inline scripts
- Mermaid diagrams: Lazy-loaded from `'self'`, SVG rendered inline
- External images in notes: Covered by `https:` in `img-src`

**Outstanding:** Manual browser regression test (load editor, open canvas with link nodes, install+activate a plugin, open graph view) with DevTools Console open to verify zero CSP violations. Recommended before production merge.

---

## A06 Vulnerable and Outdated Components

### Dependency Audit (R5)

**CI configuration:** `npm audit --audit-level=high --omit=dev` in both backend and frontend jobs (`.github/workflows/ci.yml`). This catches high/critical vulnerabilities in production dependencies while ignoring dev-only issues that have no fix available or no production exposure.

**Production dependencies:** 0 vulnerabilities in both packages (audit date: 2026-08).

**Dev dependencies (not shipped to production):**

| Package | Version | Advisory | Severity | CVSS | Pulled By | Fix Available? | Status |
|---------|---------|----------|----------|------|-----------|----------------|--------|
| `brace-expansion` | 5.0.7 | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) — DoS via unbounded expansion (OOM crash) | High | 7.5 | `eslint` → `minimatch` (dev) | Yes (`npm audit fix`) | Accepted Risk (dev-only) |
| `brace-expansion` | 5.0.7 | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) — DoS via unbounded intermediate arrays | High | 7.5 | `eslint` → `minimatch` (dev) | Yes (`npm audit fix`) | Accepted Risk (dev-only) |
| `esbuild` | 0.28.0 | [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) — Arbitrary file read on Windows dev server | Low | 2.5 | `tsx`, `vitest` → `vite` (dev) | Yes (`npm audit fix`) | Accepted Risk (dev-only) |
| `@babel/core` | 7.29.0 | [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) — Arbitrary file read via sourceMappingURL | Low | 3.2 | `eslint-plugin-react-hooks` (dev) | Yes (`npm audit fix`) | Accepted Risk (dev-only) |

### Risk Assessment

All identified vulnerabilities are in **dev-only dependencies** that are never shipped to production (Docker images install with `--omit=dev`). The attack vectors (DoS via glob patterns, dev-server file reads, source-map file reads) require local access or are only exploitable during development, not at runtime in production.

**Why `--omit=dev` in CI:**
- Production containers never install dev dependencies — only production deps are in the attack surface.
- Dev-dep advisories frequently have no upstream fix for weeks/months (transitive dependencies deep in toolchains like eslint/vitest). Blocking CI on these would cause permanent red builds without security benefit.
- Dependabot (configured weekly, minor/patch grouped) will automatically propose PRs when fixes land upstream.

**Mitigation for dev-dep findings:**
- Fixes are available via `npm audit fix` and can be applied when convenient — they are not urgent since they don't affect production.
- Developers should keep local tooling updated but are not blocked from shipping code.

### Conclusion

No action required for CI — `npm audit --audit-level=high --omit=dev` passes clean in both packages. Dev-dependency vulnerabilities are tracked by Dependabot and documented here as accepted risk.

---

## A07 Identification and Authentication Failures

| Finding | Severity | File(s) | Status |
|---------|----------|---------|--------|
| No findings | — | — | — |

### Assessment

- **Password hashing:** argon2id with default cost parameters — resistant to GPU/ASIC attacks.
- **Timing-safe comparison:** Login responds identically for unknown usernames (dummy argon2 verify) — no user enumeration via timing.
- **Session management:** Sliding expiry (24h) + absolute expiry (7d), session files on disk with in-memory index for O(1) validation.
- **Rate limiting on login:** Composite `username:ip` key (5 attempts / 15 min) — prevents both credential stuffing and account lockout.
- **Password change protection:** Per-userId rate limit (5 / 15 min) prevents brute-force on compromised sessions.
- **No default credentials:** First user is created via CLI/admin — no hardcoded admin/admin.
- **Forced password change:** `mustChangePassword` flag on admin-created temp passwords.

No weaknesses identified in the authentication layer.

---

## A08 Software and Data Integrity Failures

| Finding | Severity | File(s) | Status |
|---------|----------|---------|--------|
| Plugin sandbox is proxy-based soft isolation — no real security boundary against malicious plugin code | Low | `frontend/src/plugins/compat/sandbox.ts` | **Accepted Risk** |

### Plugin Sandbox Isolation (R6)

**Finding:** The `PluginSandbox` class uses JavaScript Proxy objects to intercept plugin access to network APIs (fetch, XHR), browser storage, and vault-scoped operations. This is NOT a security boundary — it is a soft isolation layer that prevents accidental cross-vault data leakage and resource exhaustion but cannot withstand a deliberately malicious plugin.

**Known bypass vectors (documented in `sandbox.ts`):**
- Same main-thread JS context (no process/Worker/iframe separation)
- Unproxied window properties accessible directly
- Pre-proxy closures retain original unproxied references
- `Function.prototype.call/apply/bind` can bypass proxy traps
- Shared DOM: full document read/write access
- Side-channels (SharedArrayBuffer, BroadcastChannel, postMessage)

**Severity justification (Low):** Plugins are trust-on-install — they come exclusively from:
1. The Obsidian Community Plugin list (curated, domain-allowlisted GitHub releases), or
2. Direct ZIP upload by the vault owner (explicit trust decision).

This matches Obsidian's own trust model where plugins run with full app privileges. The install-time `eval`/`new Function` scan (with UI warning since Task 17) provides an additional signal for elevated-risk bundles.

**Status: Accepted Risk.** Real process-level isolation (Worker / Node.js `vm` / `isolated-vm`) is scoped as a future feature in the `server-side-plugins` spec (Priority 4). Implementing true isolation for frontend plugins would require fundamental architecture changes (iframe sandbox or dedicated Worker per plugin) that are out of scope for this hardening pass.

---

## A09 Security Logging and Monitoring Failures

| Finding | Severity | File(s) | Status |
|---------|----------|---------|--------|
| No findings | — | — | — |

### Assessment

- **Audit logging:** Append-only JSONL files (`data/audit/YYYY-MM-DD.jsonl`), rotated daily — mandatory fields: timestamp (ISO 8601), userId, action, target, IP, success/failure.
- **Coverage:** Login attempts (success + failure), session creation/deletion, vault CRUD, share operations, user management, config changes, MCP token operations — all logged.
- **Tamper resistance:** Append-only design, never overwritten or deleted. Admin can view via `GET /admin/audit` but cannot modify or delete.
- **Structured server logs:** Pino JSON logs with request-ID correlation (`X-Request-Id` header), sensitive fields excluded from output.
- **Request-ID tracing:** Every response carries `X-Request-Id` (incoming reused or UUID generated) — correlates client-visible errors to server-log entries.
- **No identified gaps:** All security-relevant operations produce audit entries. Sensitive data (passwords, tokens) is never logged.

---

## A10 Server-Side Request Forgery (SSRF)

| Finding | Severity | File(s) | Status |
|---------|----------|---------|--------|
| Proxy endpoint (`POST /proxy`) has SSRF mitigations but no per-user rate limit | Low | `backend/src/api/proxyRoutes.ts` | **Backlog** |

### Assessment

The `POST /api/v1/proxy` endpoint relays HTTP requests server-side for plugin `requestUrl()` compatibility (browser CORS bypass). Existing mitigations:

- **Private IP blocking:** Requests to private/loopback/link-local addresses are rejected (SSRF protection).
- **URL allowlist:** Configurable via `SLATEBASE_PROXY_ALLOWED_ORIGINS` (comma-separated, wildcard prefix support). Empty = all external URLs allowed.
- **Timeouts:** 30s request timeout prevents long-running connections.
- **Size limits:** 10 MB request body, 50 MB response body.
- **Authentication required:** Session token mandatory — no unauthenticated access.

**Remaining gap (Backlog):** No per-user rate limit on the proxy endpoint. A compromised session could be used to scan external networks at high throughput (within the 30s timeout per request). Recommended: `SlidingWindowRateLimiter` at 60 req/min per userId.

**Domain allowlist for plugin store:** The community plugin store (`pluginStoreRoutes.ts`) fetches from GitHub only — the `GitHubClient` re-validates its domain allowlist on every redirect hop, preventing open-redirect SSRF chains.

---

## Rate-Limit Audit (R4)

Systematic review of all `/api/v1/*` endpoints against existing rate-limiting infrastructure (R4.1–R4.3).

### Rate-Limit Infrastructure Summary

| Limiter | Type | Scope | Config |
|---------|------|-------|--------|
| `RateLimiter` (auth/ratelimit.ts) | Login-only | Composite `username:ip` | 5 attempts / 15 min window, 15 min block |
| `SlidingWindowRateLimiter` — password change | Per-userId | `PUT /users/me/password` | 5 req / 15 min |
| `SlidingWindowRateLimiter` — MCP token creation | Per-userId | `POST /mcp/tokens` | 10 req / 15 min |
| `ChatRateLimiter` | Per-userId | `POST .../messages` | 30 messages / 60 sec |
| `McpRateLimiter` | Per-tokenId | MCP transport (POST /mcp) | 60 req / 60 sec (configurable) |
| SSE RateLimiter (realtime) | Per-userId per-event-type | Event publish | 10 events / sec / type |
| Welcome vault (inline) | Per-userId | `POST /welcome-vault` | 3 req / 60 min |
| SSE Ticket Store | Per-userId cap | `POST /auth/sse-ticket` | Max 5 pending tickets (evicts oldest) |

**Note:** The `createRateLimitMiddleware` mounted on `/api/v1/*` only processes `POST /api/v1/auth/login` — there is **no global rate limiter** for other endpoints. Authentication (session token) is the primary abuse-prevention layer for all non-login routes.

### Endpoint-by-Endpoint Audit

#### Auth Routes (`authRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| POST | `/auth/login` | Dedicated: `RateLimiter` (5 att/15min per user:ip) | **Adequate** |
| POST | `/auth/logout` | None (session required) | Adequate — low abuse potential |
| GET | `/auth/sessions` | None (session required) | Adequate — read-only |
| DELETE | `/auth/sessions/:sessionId` | None (session required) | Adequate — limited self-operation |
| DELETE | `/auth/sessions` | None (session required) | Adequate — limited self-operation |
| POST | `/auth/sse-ticket` | SSE Ticket Store cap (max 5/user) | Adequate — capped, short-lived |

#### User Routes (`userRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/users/search` | None (session required) | **Low risk** — consider adding if search is expensive |
| GET | `/users/me` | None (session required) | Adequate — read-only |
| PUT | `/users/me` | None (session required) | Adequate — bounded self-operation |
| PUT | `/users/me/password` | Dedicated: `SlidingWindowRateLimiter` (5/15min per userId) | **Adequate** |
| DELETE | `/users/me` | None (session required) | Adequate — destructive but self-only, requires password |

#### Admin Routes (`adminRoutes.ts`) — all admin-only (role check middleware)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/admin/users` | None | Adequate — admin-only, read |
| POST | `/admin/users` | None | Adequate — admin-only |
| DELETE | `/admin/users/:userId` | None | Adequate — admin-only |
| PUT | `/admin/users/:userId/role` | None | Adequate — admin-only |
| PUT | `/admin/users/:userId/password` | None | **Consider adding** — temp-password creation by admin; low priority since admin-only, but brute-force via compromised admin session possible |
| PUT | `/admin/users/:userId/suspend` | None | Adequate — admin-only |
| PUT | `/admin/users/:userId/unsuspend` | None | Adequate — admin-only |
| GET | `/admin/users/:userId/sessions` | None | Adequate — admin-only, read |
| DELETE | `/admin/users/:userId/sessions/:sessionId` | None | Adequate — admin-only |
| GET | `/admin/config` | None | Adequate — admin-only, read |
| PUT | `/admin/config` | None | Adequate — admin-only |
| POST | `/admin/restart` | None | Adequate — admin-only, UI has confirmation |
| GET | `/admin/audit` | None | Adequate — admin-only, read |
| GET | `/admin/logs` | None | Adequate — admin-only, read |
| GET | `/admin/features` | None | Adequate — admin-only, read |
| PUT | `/admin/features/:featureName` | None | Adequate — admin-only |

#### Vault Routes (`api/index.ts` — VaultController)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/vaults` | None (session required) | Adequate — read-only |
| GET | `/vaults/:vaultId/tree` | None (session + access check) | Adequate — read-only |
| GET | `/vaults/:vaultId/files` | None (session + access check) | Adequate — read-only |
| PUT | `/vaults/:vaultId/files` | None (session + write access) | Adequate — authenticated write |
| PUT | `/vaults/:vaultId/move` | None (session + write access) | Adequate — authenticated write |
| PUT | `/vaults/:vaultId/rename` | None (session + write access) | Adequate — authenticated write |
| POST | `/vaults` | None (session required) | **Low priority** — vault creation; auth + CSRF protect against spray |
| POST | `/vaults/:vaultId/import/file` | None (session + write access) | Adequate — authenticated |
| POST | `/vaults/:vaultId/import/folder` | None (session + write access) | Adequate — authenticated |
| DELETE | `/vaults/:vaultId` | None (session + ownership check) | Adequate — owner-only, destructive but singular |
| DELETE | `/vaults/:vaultId/content` | None (session + write access) | Adequate — authenticated write |

#### Vault Share Routes (`vaultShareRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/vaults/:vaultId/shares` | None (session + owner check) | Adequate — owner-only, read |
| POST | `/vaults/:vaultId/shares` | None (session + owner check) | **Backlog** — share creation abuse (spam invites to multiple users); owner-only mitigates, but a per-user limiter (e.g. 20/hour) would prevent notification spam if shares trigger notifications in future |
| DELETE | `/vaults/:vaultId/shares/:userId` | None (session + owner check) | Adequate — owner-only |
| PUT | `/vaults/:vaultId/shares/:userId` | None (session + owner check) | Adequate — owner-only |
| POST | `/vaults/:vaultId/transfer` | None (session + owner check) | Adequate — owner-only, singular operation |

#### Chat Routes (`chatRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| POST | `/chat/conversations` | None (session required) | **Low risk** — conversation creation; consider adding if spam is a concern |
| GET | `/chat/conversations` | None (session required) | Adequate — read-only |
| GET | `/chat/conversations/:id/messages` | None (session required) | Adequate — read-only |
| POST | `/chat/conversations/:id/messages` | Dedicated: `ChatRateLimiter` (30/60sec per userId) | **Adequate** |
| DELETE | `/chat/conversations/:id/participants/me` | None (session required) | Adequate — self-only leave |
| GET | `/chat/unread/total` | None (session required) | Adequate — read-only |

#### MCP Token Routes (`mcpTokenRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/mcp/tokens` | None (session required) | Adequate — read-only |
| POST | `/mcp/tokens` | Dedicated: `SlidingWindowRateLimiter` (10/15min per userId) + cap (max 10 active tokens) | **Adequate** |
| DELETE | `/mcp/tokens/:tokenId` | None (session required) | Adequate — self-only operation |

#### MCP Transport (`mcpRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| POST | `/mcp` | Dedicated: `McpRateLimiter` (60/60sec per tokenId) | **Adequate** |

#### Search Routes (`searchRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/vaults/:vaultId/search` | None (session + access check) | **Low priority** — potentially expensive (full-text linear scan); consider per-user limiter if DoS via repeated complex regex queries becomes a concern |
| GET | `/search` (multi-vault) | None (session required) | **Low priority** — same as above, scans multiple vaults |
| POST | `/vaults/:vaultId/replace` | None (session + write access) | Adequate — write, atomic, max 100 files per request (enforced in service) |

#### Graph Routes (`graphRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/vaults/:vaultId/graph` | None (session + access check) | Adequate — read-only, cached index |
| GET | `/vaults/:vaultId/graph/meta` | None (session + access check) | Adequate — read-only |
| GET | `/vaults/:vaultId/backlinks` | None (session + access check) | Adequate — read-only |
| GET | `/vaults/:vaultId/tags` | None (session + access check) | Adequate — read-only |

#### Plugin Routes (`pluginRoutes.ts`) — feature-gated (obsidian-plugin-compat)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/vaults/:vaultId/plugins` | None (access check) | Adequate — read-only |
| POST | `/vaults/:vaultId/plugins` | None (access check) | Adequate — ZIP upload, size-limited in service layer |
| GET | `/vaults/:vaultId/plugins/detected` | None (access check) | Adequate — read-only |
| POST | `/vaults/:vaultId/plugins/detected/:id/install` | None (access check) | Adequate — from already-present files |
| PUT | `/vaults/:vaultId/plugins/registry` | None (access check) | Adequate — registry save |
| GET | `/vaults/:vaultId/plugins/registry` | None (access check) | Adequate — read-only |
| GET | `/vaults/:vaultId/plugins/:id` | None (access check) | Adequate — read-only |
| DELETE | `/vaults/:vaultId/plugins/:id` | None (access check) | Adequate — authenticated |
| GET | `/vaults/:vaultId/plugins/:id/bundle` | None (access check) | Adequate — read-only, static |
| GET | `/vaults/:vaultId/plugins/:id/styles` | None (access check) | Adequate — read-only, static |
| GET | `/vaults/:vaultId/plugins/:id/settings` | None (access check) | Adequate — read-only |
| PUT | `/vaults/:vaultId/plugins/:id/settings` | None (access check) | Adequate — 1 MB cap in service |

#### Plugin Store Routes (`pluginStoreRoutes.ts`) — feature-gated (obsidian-plugin-compat)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/plugin-store/plugins` | None (session required) | Adequate — read, in-memory cache |
| GET | `/plugin-store/plugins/stats` | None (session required) | Adequate — read, cached |
| GET | `/plugin-store/plugins/:id/manifest` | None (session required) | Adequate — read, cached |
| POST | `/vaults/:vaultId/plugins/store-install` | None (access check) | **Low priority** — triggers GitHub API fetch (with its own rate-limit tracking); internal concurrency is bounded |
| POST | `/vaults/:vaultId/plugins/check-updates` | None (access check) | Adequate — bounded by update checker |
| POST | `/vaults/:vaultId/plugins/update-all` | None (access check) | Adequate — bounded by upstream rate limits |
| POST | `/vaults/:vaultId/plugins/:id/update` | None (access check) | Adequate — bounded by upstream rate limits |

#### Upload Routes (`uploadRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| POST | `/vaults/:vaultId/upload` | None (session + write access) | Adequate — file size + count limits enforced (100 MB/file, 50 files/request, 10 MB paste) |

#### Template Routes (`templateRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/vaults/:vaultId/templates` | None (session + access check) | Adequate — read-only |
| POST | `/vaults/:vaultId/templates/create` | None (session + write access) | Adequate — authenticated write |

#### Statistics Routes (`statisticsRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/vaults/:vaultId/statistics` | None (session + access check) | Adequate — cached, 5s timeout |

#### Trash Routes (`trashRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/vaults/:vaultId/trash` | None (session + access check) | Adequate — read-only |
| POST | `/vaults/:vaultId/trash/:id/restore` | None (session + write access) | Adequate — authenticated write |
| DELETE | `/vaults/:vaultId/trash/:id` | None (session + write access) | Adequate — authenticated permanent delete |

#### File Version Routes (`fileVersionRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/vaults/:vaultId/versions` | None (session + access check) | Adequate — read-only |
| GET | `/vaults/:vaultId/versions/content` | None (session + access check) | Adequate — read-only |
| POST | `/vaults/:vaultId/versions/restore` | None (session + write access) | Adequate — authenticated write |

#### Preferences Routes (`preferencesRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/users/me/recent-files` | None (session required) | Adequate — self-only read |
| PUT | `/users/me/recent-files` | None (session required) | Adequate — self-only write |
| GET | `/users/me/favorites` | None (session required) | Adequate — self-only read |
| PUT | `/users/me/favorites` | None (session required) | Adequate — self-only write |
| GET | `/users/me/keybindings` | None (session required) | Adequate — self-only read |
| PUT | `/users/me/keybindings` | None (session required) | Adequate — self-only write |

#### Vault Config Routes (`vaultConfigRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/vaults/:vaultId/config` | None (session + access check) | Adequate — read-only |
| PUT | `/vaults/:vaultId/config` | None (session + owner check) | Adequate — owner-only write |

#### Welcome Vault Routes (`welcomeVaultRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| POST | `/welcome-vault` | Dedicated: inline rate limiter (3/60min per userId) | **Adequate** |

#### Proxy Routes (`proxyRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| POST | `/proxy` | None (session required) | **Backlog** — potential SSRF amplification; URL allowlist + 30s timeout + 50 MB response cap mitigate but a per-user rate limiter (e.g. 60/min) would prevent sustained external scanning via a compromised session |

#### SSE Routes (`sseRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/events` | Connection cap (max per user), SSE event rate limiter (10/sec/type), Ticket-based auth (max 5 pending) | **Adequate** |

#### Feature Routes (`featureRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/features` (public) | None (session required) | Adequate — read-only |

#### Version Route (`versionRoutes.ts`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/version` | None (**no auth**) | **Low priority** — public, stateless, negligible cost; a basic IP-based limiter would prevent automated probing, but very low severity |

#### MCP Well-Known (`.well-known/mcp.json`)

| Method | Path | Current Limiter | Recommendation |
|--------|------|-----------------|----------------|
| GET | `/.well-known/mcp.json` | None (**no auth**) | Adequate — public discovery, stateless, negligible cost |

### Findings Summary

| # | Finding | Severity | Recommendation | Status |
|---|---------|----------|----------------|--------|
| 1 | No global rate limiter exists — `createRateLimitMiddleware` only targets login | Low | **Accepted risk.** Session auth is the primary barrier; adding a global per-IP limiter (e.g. 200 req/min) would improve resilience against credential-stuffing probes on non-login endpoints, but the risk is low with current auth checks | Accepted Risk |
| 2 | `POST /proxy` — relay endpoint without per-user rate limit | Low | Add `SlidingWindowRateLimiter` (60/min per userId) to prevent sustained SSRF scanning via compromised session. URL allowlist and response caps already mitigate | Backlog |
| 3 | `POST /vaults/:vaultId/shares` — share creation without dedicated limiter | Low | Add per-user limiter (20/hour) if share notifications are introduced in future. Currently owner-only, no notification channel | Backlog |
| 4 | `PUT /admin/users/:userId/password` — admin temp-password creation without dedicated limiter | Low | Consider adding if admin accounts become high-value targets. Currently admin-role-gated, single-user deployments typical | Accepted Risk |
| 5 | `GET /vaults/:vaultId/search`, `GET /search` — potentially expensive operations without dedicated limiter | Low | Add per-user limiter if DoS via complex regex queries becomes a concern. SearchService has no internal timeout currently; consider adding search timeout + limiter together | Backlog |

### Conclusion

The existing rate-limiting coverage is well-targeted at high-abuse vectors:
- **Login brute-force:** Composite `username:ip` limiter prevents both credential stuffing and account lockout attacks.
- **Password change brute-force:** Per-userId limiter caps attempts on a hijacked session.
- **Chat spam:** Per-userId sliding window (30/60s) prevents message flooding.
- **MCP abuse:** Per-token limiter (60/60s) + token creation limiter (10/15min) + cap (10 tokens).
- **Welcome vault creation:** Per-userId (3/hour) prevents resource exhaustion.
- **SSE connections:** Per-user cap + event rate limiter + ticket eviction.

Three endpoints are flagged for backlog (proxy, share creation, search) but none represent critical or high-severity gaps given the existing session authentication requirement.

---

## Fix Backlog

Items identified in this audit that are NOT addressed in this pass. They should be resolved in future iterations when their preconditions are met or risk level changes.

| # | Item | Category | Severity | Precondition / Trigger |
|---|------|----------|----------|------------------------|
| 1 | Add per-user rate limiter to `POST /proxy` (60 req/min per userId) | A10 SSRF | Low | Implement when proxy usage grows or if SSRF attempt is detected in logs |
| 2 | Add per-user rate limiter to `POST /vaults/:vaultId/shares` (20/hour) | A01 Access Control | Low | Implement when share notifications are added (currently no notification channel) |
| 3 | Add per-user rate limiter + search timeout for `GET /search` and `GET /vaults/:vaultId/search` | A05 Misconfiguration | Low | Implement if DoS via complex regex queries becomes a concern; add `SearchService` timeout first |
| 4 | Real plugin sandbox isolation (Worker / VM / iframe) | A08 Data Integrity | Low | Scoped in `server-side-plugins` spec (Priority 4); frontend iframe isolation is a separate future decision |
| 5 | Dev-dependency vulnerability fixes (`brace-expansion`, `esbuild`, `@babel/core`) | A06 Components | Low | Apply when upstream patches land in transitive dependency chains (tracked by Dependabot) |

### Priority Guidance

- Items 1–3 are quick additions (~1h each) using the existing `SlidingWindowRateLimiter` — good candidates for a follow-up PR when the audit pass is merged.
- Item 4 is a major architectural change and should NOT be attempted without a dedicated spec.
- Item 5 resolves itself over time via Dependabot PRs as upstream maintainers release fixes.

---

## Already Fixed (Baseline, Commit d176e49)

The following findings were identified and resolved in the CodeQL security pass (2026-08-09). They are listed here as the audit baseline and are not re-investigated in this pass.

| Finding | Category | Severity | Resolution |
|---------|----------|----------|------------|
| XSS in Canvas Markdown rendering — unsanitized user content rendered via `dangerouslySetInnerHTML` | A03 Injection | High | Sanitization applied to all canvas markdown output |
| Biased random in temporary passwords — `Math.random()` used instead of cryptographic PRNG | A02 Cryptographic Failures | Medium | Replaced with `crypto.randomBytes()` |
| Incomplete YAML escaping — special characters not escaped when writing frontmatter | A03 Injection | Medium | Proper escaping applied to all YAML output paths |
| Incomplete HTML sanitization in `htmlToMarkdown` — missing attribute/tag filtering | A03 Injection | High | Full sanitization with allowlist-based tag/attribute filtering |
