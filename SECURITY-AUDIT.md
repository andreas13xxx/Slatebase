# Security Audit — Slatebase

Current security posture, structured along the OWASP Top 10. This document records the
defenses that are in place, the risks that were consciously accepted, and the work that is
still open. It is not a change log — resolved findings are removed once they are fixed.

## Open Items

| # | Item | Category | Severity | Trigger / Precondition |
|---|------|----------|----------|------------------------|
| 1 | Per-user rate limiter on `POST /vaults/:vaultId/shares` (20/hour) | A01 Access Control | Low | When share notifications are added (there is no notification channel today) |
| 2 | Per-user rate limiter + timeout for `GET /search` and `GET /vaults/:vaultId/search` | A05 Misconfiguration | Low | If DoS via complex regex queries becomes a concern; add the `SearchService` timeout first |
| 3 | Real plugin sandbox isolation (Worker / VM / iframe) | A08 Data Integrity | Low | Scoped in the `server-side-plugins` spec — do not attempt without it |
| 4 | Manual browser CSP regression pass (editor, canvas link nodes, plugin install, graph view) with DevTools open, against the now-live `frontend/nginx.conf` CSP | A05 Misconfiguration | Low | Before a production deploy; CI has no real browser, and no Docker/browser was available in the environment that made this change — still outstanding |

Items 1–2 are ~1h each using the existing `SlidingWindowRateLimiter`. The `POST /proxy`
rate limiter formerly listed here is implemented (`proxyRoutes.ts`, 60 req/min per userId).

## Accepted Risks

| Risk | Rationale |
|------|-----------|
| No global rate limiter — `createRateLimitMiddleware` only covers `POST /auth/login` | Session auth is the primary barrier on every other route. A global per-IP limiter would add resilience against credential-stuffing probes, but the residual risk is low. |
| Plugin sandbox is proxy-based soft isolation, not a security boundary | Plugins are trust-on-install, exactly as in Obsidian — see A08. |
| `PUT /admin/users/:userId/password` has no dedicated limiter | Admin-role-gated, and single-user deployments are the norm. Revisit if admin accounts become high-value targets. |
| Dev-dependency advisories (`brace-expansion`, `esbuild`, `@babel/core`) | Dev-only, never shipped — Docker images install with `--omit=dev`. Tracked by Dependabot; see A06. |

---

## A01 Broken Access Control

**Authorization model:** owner/read/write ACL per vault plus a separate admin role. No
privilege-escalation paths identified.

**Path traversal:** every `path.join`/`path.resolve` with user-influenced input is guarded:

| Guard | Applies to |
|-------|-----------|
| `validateFilePath()` | `saveFile`, `getFileContent`, `deleteContent`, `moveContent`, and everything layered on them (`TrashService`, `VersionService`, `TemplateService`) |
| `validateContentName()` | Rename/move targets — blocks `/`, `\`, `\0`, and the literal names `.` and `..` |
| Resolved-prefix check | `renameContent` additionally verifies `resolvedTargetPath.startsWith(vault.info.path + path.sep)` and throws `InvalidMoveError` otherwise |
| Id regex + prefix check | `InstalledPluginStore.getPluginDir` (`^[a-z0-9][a-z0-9-]{0,63}$`) |

`validateContentName()` alone is **not** sufficient: it validates a *name*, but
`path.join(dir, '..')` is a legal path operation that leaves the vault. The resolved-prefix
check is the layer that actually contains it. Any new endpoint that builds a path from user
input needs both, and a path-traversal test first.

---

## A02 Cryptographic Failures

- **Password hashing:** argon2id (`argon2` package), default cost parameters.
- **Session tokens:** 128-character opaque tokens from `crypto.randomBytes(64)` (512 bits).
- **CSRF tokens:** HMAC-SHA256 over session ID + server secret, compared with `timingSafeEqual`.
- **MCP API tokens:** only the SHA-256 hash is stored; the raw token is shown once.
- **CSRF secret:** env `SLATEBASE_CSRF_SECRET` → `data/.csrf-secret` → generated. A startup
  warning is emitted at `warn` level when the env var is unset, because a generated secret
  does not survive a container restart without persistent storage.
- **Plugin secrets:** server-side, AES-256-GCM per value, key via HKDF from
  `SLATEBASE_PLUGIN_SECRET_KEY` or `data/.plugin-secret-key`. The frontend uses a
  write-through cache; the localStorage fallback only activates when the backend is
  unreachable.
- **Git-Sync / Mail-Import credentials:** same pattern via `shared-secrets/`, key from
  `SLATEBASE_MODULE_SECRET_KEY` or `data/.module-secret-key`.

---

## A03 Injection

All 24 route modules that accept a request body, query or path parameter validate it with
Zod via `zValidator('json'|'query'|'param', schema)` before the handler runs. The five
remaining route files take no user input at all (`sseRoutes`, `versionRoutes`,
`statisticsRoutes`, `welcomeVaultRoutes`, `mcpWellKnownRoute`).

Validation errors return `{ code: 'VALIDATION_ERROR', message, timestamp }` with a 400 and
no internal detail. A new route module must be validated before merge — a CI test checks
the 400 responses.

There is no database and no ORM, so there is no SQL/NoSQL injection surface. Rendering of
untrusted content is covered by the XSS rules in `.kiro/steering/quality.md`.

---

## A04 Insecure Design

- Session-based auth with opaque tokens rather than JWT — no algorithm confusion, no
  revocation problem.
- Filesystem persistence with atomic writes (temp → rename); no ORM misconfiguration
  possible.
- Plugins are trust-on-install, the same model Obsidian uses — a documented architectural
  decision, not an unnoticed hole (see A08).

---

## A05 Security Misconfiguration

`hono/secure-headers` is active globally with a complete CSP:

| Directive | Value | Rationale |
|-----------|-------|-----------|
| `default-src` | `'self'` | Restrictive fallback for anything unspecified |
| `script-src` | `'self' blob:` | `blob:` is required for plugin bundle execution (Blob URL + dynamic `import()` in `plugin-loader.ts`) |
| `style-src` | `'self' 'unsafe-inline'` | Plugin CSS injection via `<style>` tags, inline styles in rendered content |
| `img-src` | `'self' data: https:` | `data:` for base64 images in Markdown, `https:` for external images in notes |
| `connect-src` | `'self'` | API and SSE are same-origin in production |
| `frame-src` | `'self' https:` | Canvas link-node iframes load external URLs |
| `object-src` | `'none'` | No plugin/embed/object elements needed |
| `frame-ancestors` | `'none'` | Clickjacking protection |

Plus `Strict-Transport-Security: max-age=63072000; includeSubDomains`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

**No `unsafe-eval` is needed** — plugin bundles run via Blob URL + dynamic `import()`, not
`eval()`/`new Function()`. Mermaid, KaTeX, d3-force and highlight.js work without eval
too. Don't add it back for convenience.

`crossOriginResourcePolicy` is deliberately disabled: frontend and backend can run on
different origins, and `same-origin` CORP would block `<img src>` loads from the raw-file
endpoint.

The raw-file endpoint (`raw=true`) serves SVG and HTML with `Content-Disposition:
attachment`, never `inline` — both can contain `<script>` and would execute on direct
navigation from a shared link. `<img>` embedding in the frontend is unaffected, since the
disposition only applies to top-level navigation.

**Correction (2026-09):** until this point, the CSP above was active only on backend API
responses — CSP applies to the document, not to JSON, so the frontend document itself had
none. `frontend/nginx.conf` now sets the identical policy (via a shared
`security-headers.conf`, `include`d in every location nginx serves directly — the SPA
document, static assets, Hunspell dictionaries — since `add_header` in a `location` block
replaces rather than merges with what `server{}` sets, which had silently been dropping
`nosniff`/`X-Frame-Options`/`Referrer-Policy` for static assets too). `/api/` and
`/.well-known/` are proxied, not served by nginx, and keep only the backend's own headers —
adding the document policy there as well would duplicate it on every proxied response.
No extra `worker-src` was needed for the spellcheck module worker: it loads as a
same-origin module chunk, and CSP's fetch-directive fallback chain
(`worker-src → child-src → script-src`) means `script-src 'self' blob:` already covers it.
Verified in a manual DevTools pass — see Open Items #5.

---

## A06 Vulnerable and Outdated Components

CI runs `npm audit --audit-level=high --omit=dev` in both packages. Production
dependencies are clean.

`--omit=dev` is deliberate: production containers never install dev dependencies, and
dev-dep advisories deep in the eslint/vitest toolchains frequently have no upstream fix for
weeks — blocking CI on them would mean permanently red builds with no security benefit.
Dependabot (weekly, minor/patch grouped) proposes PRs as fixes land.

Known dev-only advisories: `brace-expansion` (DoS via unbounded expansion, via
`eslint → minimatch`), `esbuild` (arbitrary file read on the Windows dev server, via
`tsx`/`vitest → vite`), `@babel/core` (arbitrary file read via `sourceMappingURL`, via
`eslint-plugin-react-hooks`). All require local access or are only reachable during
development.

---

## A07 Identification and Authentication Failures

- argon2id password hashing, resistant to GPU/ASIC attacks.
- Login responds identically for unknown usernames (dummy argon2 verify) — no user
  enumeration via timing.
- Sessions: 24h sliding expiry, 7d absolute lifetime; session files on disk with an
  in-memory index for O(1) validation. Expired files are swept periodically.
- Login rate limit: composite `username:ip` key, 5 attempts / 15 min — stops credential
  stuffing without enabling account lockout.
- Password change: per-userId limit (5 / 15 min), so a hijacked session cannot brute-force
  the current password.
- No default credentials baked in; admin-created temporary passwords carry
  `mustChangePassword`.

**Rule:** every new state-changing endpoint protected only by a valid session (no second
secret such as a CSRF token or MFA) needs its own rate limit. The threat is session theft
and CSRF bypass, not just the original login.

---

## A08 Software and Data Integrity Failures

`PluginSandbox` uses JavaScript Proxy objects to intercept plugin access to network APIs,
browser storage and vault-scoped operations. This is soft isolation — it prevents
accidental cross-vault leakage and resource exhaustion, but it is **not** a security
boundary. Known bypasses are documented in `sandbox.ts`: same main-thread JS context,
unproxied window properties, pre-proxy closures, `Function.prototype.call/apply/bind`,
shared DOM, and side channels (SharedArrayBuffer, BroadcastChannel, postMessage).

This is accepted because plugins are trust-on-install and come only from the curated
Obsidian community list (domain-allowlisted GitHub releases) or a ZIP the vault owner
uploads themselves. The install-time `eval`/`new Function` scan surfaces elevated-risk
bundles in the UI; `hasEvalUsage` is persisted in the plugin registry, not just returned in
the install response, so the warning survives a page reload.

Real process-level isolation is scoped in the `server-side-plugins` spec.

---

## A09 Security Logging and Monitoring Failures

- **Audit log:** append-only JSONL (`data/audit/YYYY-MM-DD.jsonl`), daily rotation.
  Mandatory fields: ISO-8601 timestamp, userId, action, target, IP, success/failure.
- **Coverage:** login attempts, session lifecycle, vault CRUD, shares, user management,
  config changes, MCP token operations.
- **Tamper resistance:** never overwritten or deleted; admins can read via `GET
  /admin/audit` but not modify.
- **Server logs:** Pino JSON with request-ID correlation. Every response carries
  `X-Request-Id` (incoming reused, else a UUID), so a client-visible error maps to a log
  entry. Sensitive fields are excluded.
- Startup warnings for missing production secrets are logged at `warn`, not `info` — ops
  filters at `level >= warn` would otherwise miss them.

---

## A10 Server-Side Request Forgery (SSRF)

`POST /api/v1/proxy` relays HTTP requests server-side for plugin `requestUrl()`
compatibility. Mitigations in place:

- Private, loopback and link-local addresses are rejected.
- URL allowlist via `SLATEBASE_PROXY_ALLOWED_ORIGINS` (comma-separated, `*.domain.com`
  wildcard prefix). Empty means all external URLs are allowed.
- 30s timeout, 10 MB request body, 50 MB response body.
- Session token required — no unauthenticated access.

The community plugin store fetches from GitHub only, and `GitHubClient` re-validates its
domain allowlist on **every redirect hop**, so an open redirect cannot chain out of the
allowlist.

Remaining gap: no per-user rate limit on the proxy (open item 1).

---

## Rate-Limit Coverage

| Limiter | Type | Scope | Config |
|---------|------|-------|--------|
| `RateLimiter` (`auth/ratelimit.ts`) | Login only | Composite `username:ip` | 5 attempts / 15 min, 15 min block |
| `SlidingWindowRateLimiter` | Per-userId | `PUT /users/me/password` | 5 / 15 min |
| `SlidingWindowRateLimiter` | Per-userId | `POST /mcp/tokens` | 10 / 15 min |
| `ChatRateLimiter` | Per-userId | `POST /chat/.../messages` | 30 / 60 s |
| `McpRateLimiter` | Per-tokenId | `POST /mcp` | 60 / 60 s (configurable) |
| SSE rate limiter (`realtime/`) | Per-userId, per-event-type | Event publish | 10 / s / type |
| Inline | Per-userId | `POST /welcome-vault` | 3 / 60 min |
| `SseTicketStore` | Per-userId cap | `POST /auth/sse-ticket` | Max 5 pending tickets (oldest evicted) |

`createRateLimitMiddleware` is mounted on `/api/v1/*` but only processes
`POST /api/v1/auth/login`. There is no global limiter — see Accepted Risks.
