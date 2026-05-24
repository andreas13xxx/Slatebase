# Implementation Plan: Auth & User Management

## Overview

Implementierung der Authentifizierung und Benutzerverwaltung für Slatebase. Das System wird um drei neue Backend-Module (Auth, User, Audit) erweitert, die sich in die bestehende Schichtarchitektur einfügen. Die Implementierung erfolgt inkrementell: zuerst Data-Layer, dann Business-Layer, dann API-Layer mit Middleware, und abschließend Frontend-Integration.

## Tasks

- [x] 1. Projekt-Setup und Core-Interfaces
  - [x] 1.1 Install new dependencies and define core interfaces
    - Add `argon2` (0.41.1) to backend dependencies
    - Add `fast-check` (3.22.0) to backend devDependencies
    - Create `src/auth/index.ts` with `ISessionStore`, `IAuthService`, all auth-related types (`Session`, `SessionContext`, `LoginMeta`, `LoginResult`, `SessionInfo`), and error classes (`AuthenticationError`, `SessionExpiredError`, `RateLimitError`, `CsrfError`)
    - Create `src/user/index.ts` with `IUserRepository`, `IUserService`, `IRoleService`, all user-related types (`UserRecord`, `UserRole`, `PublicUserInfo`, `CreateUserData`, `UpdateProfileData`, `PaginationOptions`, `PaginatedResult`), and error classes (`UserNotFoundError`, `UserConflictError`, `UserValidationError`, `LastAdminError`, `AccountSuspendedError`, `InsufficientPermissionError`, `VaultOwnershipError`)
    - Create `src/audit/index.ts` with `IAuditService`, `IAuditLogger`, `AuditEntry`, `AuditAction`, `AuditFilter` types
    - _Requirements: 1.1, 3.1, 4.1, 8.1, 12.2_

  - [x] 1.2 Create Zod validation schemas for user and auth input
    - Create `src/user/validation.ts` with Zod schemas for: username (3–64 chars, alphanumeric + hyphen + underscore), password (8–128 chars), email (RFC 5322, max 254 chars), displayName (1–50 chars), avatarUrl (max 2048 chars, http(s)://), preferredLanguage enum, colorScheme enum, role enum, pagination options (page ≥ 1, pageSize 1–100)
    - Create `src/auth/validation.ts` with Zod schemas for: login request (username 1–64, password 8–128), server config update (port 1–65535, host non-empty, logLevel enum, maxFileSize > 0, allowedOrigins string array)
    - _Requirements: 1.7, 3.1, 3.3, 3.6, 5.1, 5.8, 7.2, 7.5, 8.3, 8.4_

  - [x]* 1.3 Write property tests for input validation schemas
    - **Property 6: Eingabevalidierung lehnt ungültige Formate ab**
    - **Validates: Requirements 1.7, 8.3, 8.4**

- [x] 2. Data-Layer: UserRepository und SessionStore
  - [x] 2.1 Implement UserRepository
    - Create `UserRepository` class implementing `IUserRepository` in `src/user/index.ts`
    - Store user records as JSON files under `data/users/<userId>.json`
    - Maintain `data/users/_index.json` mapping `username → userId` for fast lookups
    - Use atomic writes (temp file → rename) for all persistence operations
    - Implement `findById`, `findByUsername`, `findAll` (sorted by username, paginated), `save`, `delete`, `count`, `countByRole`
    - _Requirements: 3.7, 5.5_

  - [x] 2.2 Implement SessionStore
    - Create `SessionStore` class implementing `ISessionStore` in `src/auth/index.ts`
    - Store sessions as JSON files under `data/sessions/<sessionId>.json`
    - Maintain in-memory index (`Map<token, sessionId>`) loaded from filesystem on startup
    - Implement `create`, `findByToken`, `findByUserId`, `invalidate`, `invalidateAllForUser`, `cleanup`
    - _Requirements: 1.1, 1.4, 11.1_

  - [x] 2.3 Implement AuditLogger
    - Create `AuditLogger` class implementing `IAuditLogger` in `src/audit/index.ts`
    - Append entries as JSONL to `data/audit/YYYY-MM-DD.jsonl` (one line per entry, append-only via `fs.appendFile`)
    - Implement `read` with pagination and filtering by action type and date range
    - Ensure no sensitive data (passwords, tokens) is written
    - _Requirements: 12.1, 12.2, 12.3, 12.5_

  - [x]* 2.4 Write unit tests for UserRepository and SessionStore
    - Test CRUD operations with real filesystem (temp directories)
    - Test atomic write behavior
    - Test index consistency after save/delete
    - Test pagination and sorting for `findAll`
    - _Requirements: 3.7, 5.5, 11.1_

- [x] 3. Business-Layer: AuthService
  - [x] 3.1 Implement AuthService
    - Create `AuthService` class implementing `IAuthService` in `src/auth/index.ts`
    - Implement `login`: validate credentials with argon2id verify, check suspended status, create session with 128-char hex token, 64-char hex CSRF token, 24h expiry
    - Implement `logout`: invalidate session token
    - Implement `validateSession`: lookup token, check expiry, update lastActivity
    - Implement `getSessions`, `invalidateSession`, `invalidateOtherSessions`
    - Implement `generateCsrfToken`, `validateCsrfToken` (HMAC-based per session)
    - Use `node:crypto.randomBytes` for token generation
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 10.1, 10.4, 11.1, 11.3, 11.4, 11.5_

  - [x]* 3.2 Write property tests for AuthService login
    - **Property 1: Login erzeugt gültige Session mit korrekten Attributen**
    - **Validates: Requirements 1.1, 10.1, 10.4**

  - [x]* 3.3 Write property test for login failure response uniformity
    - **Property 2: Ungültige Anmeldedaten erzeugen identische Fehlerantwort**
    - **Validates: Requirements 1.2**

  - [x]* 3.4 Write property test for logout round-trip
    - **Property 4: Logout invalidiert Session (Round-Trip)**
    - **Validates: Requirements 1.4**

  - [x]* 3.5 Write property tests for multi-session isolation
    - **Property 28: Multi-Session-Isolation**
    - **Property 29: Session-Isolation zwischen Benutzern**
    - **Validates: Requirements 11.1, 11.2, 11.4, 11.5**

  - [x]* 3.6 Write property test for password hashing
    - **Property 26: Passwörter werden als argon2id-Hash gespeichert**
    - **Validates: Requirements 8.1**

- [x] 4. Business-Layer: Rate-Limiting
  - [x] 4.1 Implement rate-limiting logic
    - Create in-memory rate limiter in `src/auth/index.ts` (or separate `src/auth/ratelimit.ts`)
    - Track failed login attempts per username: max 5 failures in 15 minutes → block for 15 minutes
    - Implement `checkRateLimit` and `recordFailedAttempt` functions
    - Auto-cleanup of expired entries on access
    - _Requirements: 1.6_

  - [x]* 4.2 Write property test for rate limiting
    - **Property 5: Rate-Limiting blockiert nach 5 Fehlversuchen**
    - **Validates: Requirements 1.6**

- [x] 5. Checkpoint - Core auth services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Business-Layer: UserService und RoleService
  - [x] 6.1 Implement UserService
    - Create `UserService` class implementing `IUserService` in `src/user/index.ts`
    - Implement `createUser`: validate input, check username uniqueness, hash password with argon2id, save user record
    - Implement `deleteUser`: check not last admin, remove user, invalidate all sessions
    - Implement `updateProfile`: validate fields atomically (all-or-nothing), persist changes
    - Implement `changePassword`: verify current password, validate new password (8–128 chars, different from current), update hash, set `mustChangePassword: false`
    - Implement `resetPassword`: generate temp password (12 chars), set `mustChangePassword: true`
    - Implement `getUser`, `listUsers` (paginated, sorted by username)
    - Implement `suspendUser`, `unsuspendUser`: check last admin invariant, invalidate sessions on suspend
    - Implement `deleteSelf`: verify password, check no owned vaults, delete account
    - _Requirements: 2.4, 2.5, 3.2, 3.4, 3.5, 5.1, 5.2, 5.3, 5.5, 13.1, 13.3, 13.4, 14.1, 14.3_

  - [x] 6.2 Implement RoleService
    - Create `RoleService` class implementing `IRoleService` in `src/user/index.ts`
    - Implement `assignRole`: update user role, update all active sessions with new role
    - Implement `getRole`: lookup user role
    - Implement `canRemoveAdmin`: check if user is the last admin
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [x] 6.3 Implement AuditService
    - Create `AuditService` class implementing `IAuditService` in `src/audit/index.ts`
    - Implement `log`: add timestamp, delegate to AuditLogger
    - Implement `query`: delegate to AuditLogger with filter and pagination
    - _Requirements: 12.1, 12.4_

  - [x] 6.4 Implement default admin creation on startup
    - Create `ensureDefaultAdmin` function that checks if any users exist, and if not, creates admin/admin with `mustChangePassword: true`
    - Integrate into composition root startup sequence
    - _Requirements: 2.1, 2.2, 2.3_

  - [x]* 6.5 Write property tests for UserService
    - **Property 8: Passwortänderung validiert Regeln**
    - **Property 9: Profildaten Round-Trip**
    - **Property 10: Ungültige Profilfelder lehnen gesamte Änderung ab (Atomarität)**
    - **Validates: Requirements 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

  - [x]* 6.6 Write property tests for user creation and deletion
    - **Property 14: Benutzererstellung validiert und erzwingt Eindeutigkeit**
    - **Property 15: Benutzerlöschung entfernt Konto und invalidiert Sessions**
    - **Property 16: Passwort-Reset erzeugt gültiges temporäres Passwort**
    - **Property 17: Benutzerliste ist sortiert und paginiert**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6, 5.8, 13.5, 14.6**

  - [x]* 6.7 Write property tests for role management and last-admin invariant
    - **Property 12: Mindestens ein Administrator muss existieren (Invariante)**
    - **Property 13: Rollenänderung wirkt sofort auf bestehende Sessions**
    - **Validates: Requirements 4.3, 4.5, 5.4, 13.6, 14.5**

  - [x]* 6.8 Write property tests for mustChangePassword enforcement
    - **Property 7: mustChangePassword blockiert alle Aktionen außer Passwortänderung**
    - **Validates: Requirements 2.3**

  - [x]* 6.9 Write property tests for account suspension
    - **Property 34: Kontosperrung blockiert Login und invalidiert Sessions**
    - **Property 35: Sperrung lässt Vault-Daten unverändert**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4**

  - [x]* 6.10 Write property test for self-deletion
    - **Property 33: Selbstlöschung erfordert Passwortbestätigung**
    - **Validates: Requirements 13.1, 13.3, 13.4**

- [x] 7. Vault-Freigabe und Zugriffskontrolle
  - [x] 7.1 Implement VaultShareRegistry
    - Create `VaultShareRegistry` class implementing `IVaultShareRegistry` in `src/vault/registry.ts` (extend existing file)
    - Store shares in `data/shares.json` (central JSON file, atomic writes)
    - Implement `getSharesForVault`, `getSharesForUser`, `addShare`, `removeShare`, `removeAllSharesForVault`, `updatePermission`
    - Extend `VaultRegistryEntry` with `ownerId` field
    - _Requirements: 6.1, 6.6, 6.8_

  - [x] 7.2 Implement vault access control in VaultService
    - Extend `VaultService` to check ownership and share permissions before vault operations
    - Owner has full read/write access
    - Users with "read" share can only read, write attempts rejected
    - Users with "write" share can read and write
    - Users without share or ownership are rejected
    - Enforce max 20 shares per vault
    - Reject sharing with non-existent users or self
    - _Requirements: 6.2, 6.3, 6.5, 6.6, 6.7_

  - [x] 7.3 Implement vault deletion rules and ownership transfer
    - Reject deletion of vaults with active shares (return error listing active shares)
    - Implement ownership transfer: validate all other shares revoked first, transfer ownership, revoke old owner access
    - Implement forced deletion option: revoke all shares then delete
    - _Requirements: 6.10, 6.11, 6.12, 6.13, 6.14, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [x] 7.4 Implement ETag-based conflict detection
    - Extend file save response with `etag` field (SHA-256 first 16 hex chars of file content)
    - On PUT requests: check `If-Match` header against current file hash
    - Return 409 Conflict on mismatch
    - _Requirements: 11.8_

  - [x]* 7.5 Write property tests for vault access control
    - **Property 18: Vault-Zugriffskontrolle nach Berechtigungsstufe**
    - **Property 19: Freigabe-Erstellung und -Widerruf (Round-Trip)**
    - **Property 20: Vault-Freigabe-Invarianten**
    - **Property 21: Berechtigungsstufe kann geändert werden**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9**

  - [x]* 7.6 Write property tests for vault deletion and ownership transfer
    - **Property 22: Vault-Löschung mit aktiven Freigaben wird abgelehnt**
    - **Property 23: Besitz-Übertragung mit Vorbedingungen**
    - **Property 24: Kontolöschung erfordert Vault-Freiheit**
    - **Validates: Requirements 6.10, 6.12, 6.13, 6.14, 13.2, 15.4, 15.5, 15.6**

  - [x]* 7.7 Write property test for ETag conflict detection
    - **Property 30: ETag-basierte Konflikterkennung**
    - **Validates: Requirements 11.8**

- [x] 8. Checkpoint - Business layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. API-Layer: Middleware
  - [x] 9.1 Implement auth middleware
    - Create `src/auth/middleware.ts` with `createAuthMiddleware(authService)`
    - Extract token from `Authorization: Bearer <token>` header
    - Validate session via `authService.validateSession`
    - Set `c.set('session', sessionContext)` on success
    - Return 401 on missing/invalid/expired token
    - Skip validation for login endpoint (`POST /auth/login`)
    - _Requirements: 1.3, 1.5_

  - [x] 9.2 Implement CSRF middleware
    - Create `createCsrfMiddleware(authService)` in `src/auth/middleware.ts`
    - Check `X-CSRF-Token` header for POST, PUT, DELETE methods
    - Validate against session's CSRF token
    - Return 403 on missing/invalid CSRF token
    - Skip for GET, HEAD, OPTIONS methods
    - _Requirements: 10.2, 10.3_

  - [x] 9.3 Implement rate-limit middleware
    - Create `createRateLimitMiddleware()` in `src/auth/middleware.ts`
    - Apply only to login endpoint
    - Check rate limit before processing login
    - Record failed attempts after failed login
    - Return 429 with `Retry-After` header when blocked
    - _Requirements: 1.6_

  - [x] 9.4 Implement mustChangePassword middleware
    - Create middleware that checks `sessionContext.mustChangePassword`
    - If true, reject all requests except `PUT /users/me/password` with 403
    - _Requirements: 2.3_

  - [x]* 9.5 Write property tests for middleware
    - **Property 3: Unauthentifizierte Anfragen werden abgelehnt**
    - **Property 11: Nicht-Admin-Benutzer werden von Admin-Endpunkten abgelehnt**
    - **Property 27: CSRF-Token wird bei zustandsändernden Anfragen geprüft**
    - **Validates: Requirements 1.3, 4.4, 7.4, 10.2, 10.3**

- [x] 10. API-Layer: Auth Routes
  - [x] 10.1 Implement auth controller and routes
    - Create `src/api/authRoutes.ts` with `AuthController` and `AuthRouteModule`
    - `POST /auth/login`: validate input (Zod), call authService.login, return token + csrfToken + user info
    - `POST /auth/logout`: call authService.logout with current token
    - `GET /auth/sessions`: return current user's sessions via authService.getSessions
    - `DELETE /auth/sessions/:sessionId`: invalidate specific session
    - `DELETE /auth/sessions`: invalidate all other sessions
    - Register routes in `src/api/index.ts` router
    - _Requirements: 1.1, 1.2, 1.4, 11.3, 11.4, 11.5_

  - [x]* 10.2 Write unit tests for auth routes
    - Test login success/failure responses
    - Test logout invalidation
    - Test session listing and invalidation
    - Test error response format consistency
    - _Requirements: 1.1, 1.2, 1.4, 11.3, 11.4, 11.5_

- [x] 11. API-Layer: User Routes
  - [x] 11.1 Implement user controller and routes
    - Create `src/api/userRoutes.ts` with `UserController` and `UserRouteModule`
    - `GET /users/me`: return current user's profile
    - `PUT /users/me`: validate and update profile fields
    - `PUT /users/me/password`: change own password (requires current password confirmation)
    - `DELETE /users/me`: self-delete account (requires password confirmation)
    - Register routes in `src/api/index.ts` router
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 13.1, 13.2, 13.3, 13.4_

  - [x]* 11.2 Write unit tests for user routes
    - Test profile retrieval and update
    - Test password change with correct/incorrect current password
    - Test self-deletion with vault ownership check
    - Test validation error responses
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 13.1, 13.3, 13.4_

- [x] 12. API-Layer: Admin Routes
  - [x] 12.1 Implement admin controller and routes
    - Create `src/api/adminRoutes.ts` with `AdminController` and `AdminRouteModule`
    - `GET /admin/users`: paginated user list (sorted by username, max 100/page, includes suspended status)
    - `POST /admin/users`: create user (validate username, password, role)
    - `DELETE /admin/users/:userId`: delete user (check last admin, check vault ownership)
    - `PUT /admin/users/:userId/role`: change role (immediate effect on sessions)
    - `PUT /admin/users/:userId/password`: reset password (generate temp, set mustChangePassword)
    - `PUT /admin/users/:userId/suspend`: suspend account (invalidate sessions)
    - `PUT /admin/users/:userId/unsuspend`: unsuspend account
    - `GET /admin/users/:userId/sessions`: list user's sessions
    - `DELETE /admin/users/:userId/sessions/:sessionId`: invalidate user's session
    - `GET /admin/config`: return server configuration
    - `PUT /admin/config`: validate and update server configuration
    - `POST /admin/restart`: graceful server restart (complete requests within 10s)
    - `GET /admin/audit`: paginated audit log with filters
    - Add admin role check middleware to all admin routes
    - Register routes in `src/api/index.ts` router
    - _Requirements: 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 11.6, 11.7, 12.4, 14.1, 14.3, 14.5, 14.6_

  - [x]* 12.2 Write unit tests for admin routes
    - Test user CRUD operations
    - Test role change with session update
    - Test password reset flow
    - Test suspend/unsuspend
    - Test last admin protection
    - Test non-admin rejection (403)
    - Test config get/update/validation
    - Test audit log retrieval with filters
    - _Requirements: 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 7.1, 7.2, 7.5, 14.1, 14.5_

- [x] 13. API-Layer: Vault Share Routes
  - [x] 13.1 Implement vault share routes
    - Extend `src/api/index.ts` or create dedicated route module for vault sharing
    - `POST /vaults/:vaultId/shares`: create share (validate target user exists, not self, max 20)
    - `DELETE /vaults/:vaultId/shares/:userId`: revoke share
    - `PUT /vaults/:vaultId/shares/:userId`: update permission level (read ↔ write)
    - `POST /vaults/:vaultId/transfer`: transfer ownership (validate preconditions)
    - Add owner-only authorization check for all share routes
    - _Requirements: 6.1, 6.4, 6.7, 6.9, 6.12, 6.13_

  - [x]* 13.2 Write unit tests for vault share routes
    - Test share creation, revocation, permission update
    - Test ownership transfer with precondition checks
    - Test max 20 shares enforcement
    - Test self-share rejection
    - _Requirements: 6.1, 6.4, 6.6, 6.7, 6.9, 6.12, 6.13_

- [x] 14. Checkpoint - API layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Backend Composition Root Wiring
  - [x] 15.1 Wire all new modules in composition root
    - Update `src/index.ts` to instantiate and wire: UserRepository, SessionStore, AuditLogger, AuditService, AuthService, UserService, RoleService, VaultShareRegistry
    - Register auth middleware, CSRF middleware, rate-limit middleware, mustChangePassword middleware in Hono app
    - Register new route modules (AuthRouteModule, UserRouteModule, AdminRouteModule, VaultShareRouteModule)
    - Call `ensureDefaultAdmin` during startup
    - Load session index from filesystem on startup
    - Update CORS config to allow `PUT` and `DELETE` methods and `Authorization`, `X-CSRF-Token` headers
    - _Requirements: 2.1, all_

  - [x]* 15.2 Write integration tests for auth flow
    - Test full login → authenticated request → logout flow with real filesystem
    - Test session expiry behavior
    - Test rate limiting end-to-end
    - Test CSRF protection end-to-end
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 10.2, 10.3_

- [x] 16. Audit-Log Integration
  - [x] 16.1 Wire audit logging into all services
    - Add audit log calls to AuthService: LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT
    - Add audit log calls to UserService: PASSWORD_CHANGED, PASSWORD_RESET, USER_CREATED, USER_DELETED, USER_SUSPENDED, USER_UNSUSPENDED
    - Add audit log calls to RoleService: ROLE_CHANGED
    - Add audit log calls to VaultShareRegistry: VAULT_SHARE_CREATED, VAULT_SHARE_REVOKED, VAULT_SHARE_UPDATED, VAULT_OWNERSHIP_TRANSFERRED
    - Add audit log calls to admin config changes: CONFIG_CHANGED
    - _Requirements: 12.1, 12.5_

  - [x]* 16.2 Write property tests for audit logging
    - **Property 31: Audit-Log-Einträge haben vollständige Struktur**
    - **Property 32: Audit-Log-Abfrage ist paginiert und filterbar**
    - **Validates: Requirements 12.1, 12.2, 12.4, 12.5**

  - [x]* 16.3 Write property test for server config validation
    - **Property 25: Serverkonfiguration validiert und persistiert**
    - **Validates: Requirements 7.2, 7.5**

- [x] 17. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Frontend: Auth State und API-Client
  - [x] 18.1 Implement auth state management
    - Create `src/state/authState.ts` with `AuthState` interface, `AuthAction` union type, and `authReducer`
    - Create `AuthProvider` context that wraps the app
    - Implement `useAuthContext()` hook
    - State includes: `isAuthenticated`, `user`, `token`, `csrfToken`, `mustChangePassword`, `isLoading`, `error`
    - Actions: `LOGIN_STARTED`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `SESSION_EXPIRED`, `PASSWORD_CHANGED`
    - _Requirements: 9.4, 9.6, 9.7_

  - [x] 18.2 Extend API client with auth headers
    - Update `src/api/index.ts` to include `Authorization: Bearer <token>` header on all requests
    - Include `X-CSRF-Token` header on POST, PUT, DELETE requests
    - Add 401 response interceptor: dispatch `SESSION_EXPIRED`, clear token, redirect to login
    - Create auth-specific API methods: `login(username, password)`, `logout()`, `getSessions()`, `invalidateSession(id)`, `getProfile()`, `updateProfile(data)`, `changePassword(current, new)`, `deleteSelf(password)`
    - _Requirements: 9.4, 9.7, 10.2_

  - [x]* 18.3 Write unit tests for auth state reducer
    - Test all state transitions (login flow, logout, session expiry)
    - Test error handling states
    - _Requirements: 9.4, 9.6, 9.7_

- [x] 19. Frontend: Login-Seite
  - [x] 19.1 Implement login page component
    - Create `src/components/LoginPage.tsx`
    - Render username field (max 128 chars) and password field (max 256 chars) with visible labels (German)
    - Client-side validation: both fields non-empty before submit
    - Show validation message at empty field on submit attempt
    - Disable submit button while request is pending
    - On success: store token, navigate to main view
    - On failure: show generic error message (no distinction between wrong username/password)
    - On 429: show rate-limit message with retry-after info
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 19.2 Implement auth routing and session guard
    - Update `App.tsx` to conditionally render LoginPage or main app based on auth state
    - Implement logout action: clear token, navigate to login page
    - Handle 401 responses globally: clear session, redirect to login
    - _Requirements: 9.4, 9.6, 9.7_

  - [x]* 19.3 Write unit tests for LoginPage
    - Test form validation (empty fields)
    - Test submit button disabled state during loading
    - Test error message display on failure
    - Test navigation on success
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 20. Frontend: Passwort-Änderung (mustChangePassword)
  - [x] 20.1 Implement forced password change flow
    - Create `src/components/ChangePasswordPage.tsx`
    - Show when `mustChangePassword: true` after login
    - Fields: current password, new password, confirm new password (German labels)
    - Validate: new password ≥ 8 chars, matches confirmation, different from current
    - On success: dispatch `PASSWORD_CHANGED`, navigate to main view
    - On failure: show specific error message
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

  - [x]* 20.2 Write unit tests for ChangePasswordPage
    - Test validation rules (min length, match confirmation, different from current)
    - Test success and error flows
    - _Requirements: 2.4, 2.5_

- [x] 21. Frontend: Benutzerprofil
  - [x] 21.1 Implement user profile page
    - Create `src/components/ProfilePage.tsx`
    - Display and edit: display name, email, avatar URL, preferred language, color scheme
    - Validate fields per design constraints before submit
    - Show field-specific error messages on validation failure
    - Include password change section (current + new password)
    - Include account deletion section with password confirmation
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 13.1, 13.3_

  - [x]* 21.2 Write unit tests for ProfilePage
    - Test field validation and error display
    - Test successful profile update
    - Test password change flow
    - _Requirements: 3.2, 3.3, 3.6_

- [x] 22. Frontend: Admin-Bereich
  - [x] 22.1 Implement admin user management page
    - Create `src/components/AdminUsersPage.tsx`
    - Display paginated user list (username, display name, email, role, suspended status, created date)
    - Create user form (username, password, role)
    - Actions per user: delete, change role, reset password, suspend/unsuspend
    - Show confirmation dialogs for destructive actions
    - Handle last-admin protection errors
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 14.1, 14.3, 14.5, 14.6_

  - [x] 22.2 Implement admin server config page
    - Create `src/components/AdminConfigPage.tsx`
    - Display current config (port, host, allowed origins, max file size, log level)
    - Edit form with validation (port 1–65535, host non-empty, valid log level, positive max file size)
    - Server restart button with confirmation
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [x] 22.3 Implement admin audit log page
    - Create `src/components/AdminAuditPage.tsx`
    - Display paginated audit entries
    - Filter by action type and date range
    - _Requirements: 12.4_

  - [x]* 22.4 Write unit tests for admin pages
    - Test user list rendering and pagination
    - Test create user form validation
    - Test destructive action confirmations
    - Test config validation
    - _Requirements: 5.1, 5.5, 5.8, 7.2, 7.5_

- [x] 23. Frontend: Vault-Freigabe UI
  - [x] 23.1 Implement vault sharing UI
    - Create `src/components/VaultSharing.tsx`
    - Display current shares for owned vaults (user, permission level)
    - Add share form (username, permission: read/write)
    - Revoke share button per entry
    - Change permission dropdown per entry
    - Show max 20 shares limit
    - _Requirements: 6.1, 6.4, 6.8, 6.9_

  - [x] 23.2 Implement vault deletion and ownership transfer workflow
    - Create guided workflow component for vault deletion with active shares
    - Option A: revoke all shares and delete
    - Option B: transfer ownership to specific user
    - Show warnings for write-shared vaults
    - Validate preconditions (all other shares revoked before transfer)
    - _Requirements: 6.10, 6.11, 6.12, 6.13, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [x]* 23.3 Write unit tests for vault sharing UI
    - Test share creation and revocation
    - Test permission change
    - Test deletion workflow steps
    - _Requirements: 6.1, 6.4, 6.9, 15.7_

- [x] 24. Frontend: Session-Management UI
  - [x] 24.1 Implement session management component
    - Create `src/components/SessionsPage.tsx`
    - Display list of active sessions (device/browser info, last activity, created at)
    - Highlight current session
    - Button to invalidate individual sessions
    - Button to invalidate all other sessions
    - _Requirements: 11.3, 11.4, 11.5_

  - [x]* 24.2 Write unit tests for session management
    - Test session list rendering
    - Test invalidation actions
    - _Requirements: 11.3, 11.4, 11.5_

- [x] 25. Final checkpoint - Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Backend uses TypeScript with ESM, `.js` extensions on all relative imports
- Frontend uses React with useReducer + Context (no external state library)
- All new modules follow the Interface-First pattern (`I*`-Interfaces)
- Hand-written mock factories for testing (no mocking library)
- UI labels in German, code/comments in English

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "4.2", "6.1", "6.2", "6.3", "6.4"] },
    { "id": 4, "tasks": ["6.5", "6.6", "6.7", "6.8", "6.9", "6.10", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 6, "tasks": ["7.5", "7.6", "7.7", "9.1", "9.2", "9.3", "9.4"] },
    { "id": 7, "tasks": ["9.5", "10.1", "11.1", "12.1", "13.1"] },
    { "id": 8, "tasks": ["10.2", "11.2", "12.2", "13.2", "15.1"] },
    { "id": 9, "tasks": ["15.2", "16.1"] },
    { "id": 10, "tasks": ["16.2", "16.3", "18.1", "18.2"] },
    { "id": 11, "tasks": ["18.3", "19.1", "19.2"] },
    { "id": 12, "tasks": ["19.3", "20.1"] },
    { "id": 13, "tasks": ["20.2", "21.1", "22.1", "22.2", "22.3", "23.1", "24.1"] },
    { "id": 14, "tasks": ["21.2", "22.4", "23.2", "23.3", "24.2"] }
  ]
}
```
