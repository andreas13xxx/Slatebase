# Implementation Plan: Session-Expiry-Fix

## Overview

Implements six fixes for unexpected session termination: CSRF secret persistence, sliding session expiry with configurable duration, localStorage migration, synchronous token restore, graceful expiry UX, and CSRF mismatch recovery. Changes are ordered backend-first (foundation) then frontend (consumer).

## Tasks

- [x] 1. CSRF Secret Persistence (Backend)
  - [x] 1.1 Create `CsrfSecretManager` class
    - Create `backend/src/auth/csrf-secret.ts`
    - Implement `ICsrfSecretManager` interface with `loadOrCreate(): Promise<string>` method
    - Logic: env var `SLATEBASE_CSRF_SECRET` → file `{dataDir}/.csrf-secret` → generate + atomic write
    - Use atomic write pattern (temp → rename) consistent with the project
    - Never log the secret value
    - _Requirements: REQ-1_
  - [x] 1.2 Wire `CsrfSecretManager` into composition root
    - In `backend/src/index.ts`: replace inline `process.env['SLATEBASE_CSRF_SECRET'] ?? crypto.randomBytes(32).toString('hex')` with `await csrfSecretManager.loadOrCreate()`
    - Instantiate `CsrfSecretManager` before `AuthService`
    - _Requirements: REQ-1_
  - [x]* 1.3 Write unit tests for `CsrfSecretManager`
    - Test: env var takes precedence over file
    - Test: file is read when env var not set
    - Test: new secret is generated and persisted when neither exists
    - Test: corrupted/unreadable file triggers regeneration
    - _Requirements: REQ-1_

- [x] 2. Configurable Session Duration (Backend)
  - [x] 2.1 Extend `ServerConfigSchema` with session config fields
    - Add `sessionDurationHours: z.number().positive().default(24)` to Zod schema in `backend/src/config/index.ts`
    - Add `sessionMaxLifetimeDays: z.number().positive().default(7)` to Zod schema
    - Add env var overlay for `SLATEBASE_SESSION_DURATION_HOURS` and `SLATEBASE_SESSION_MAX_LIFETIME_DAYS`
    - _Requirements: REQ-2_
  - [x] 2.2 Inject session config into `AuthService`
    - Modify `AuthService` constructor to accept `sessionDurationMs` and `maxLifetimeMs` parameters
    - Replace hardcoded `SESSION_DURATION_MS` constant with the injected values
    - Update composition root to pass config values
    - _Requirements: REQ-2_

- [x] 3. Sliding Session Expiry (Backend)
  - [x] 3.1 Implement sliding expiry in `AuthService.validateSession()`
    - On each successful validation: set `expiresAt = now + sessionDurationMs`
    - Update `lastActivity` to current timestamp (already done, verify it persists)
    - Enforce max lifetime: if `now - createdAt > maxLifetimeMs` → invalidate session, return null
    - _Requirements: REQ-2_
  - [x] 3.2 Update `AuthService.login()` to use configurable duration
    - Replace `SESSION_DURATION_MS` usage in login with `this.sessionDurationMs`
    - _Requirements: REQ-2_
  - [x]* 3.3 Write unit tests for sliding expiry
    - Test: session expiresAt is extended after validateSession
    - Test: session expires when inactive beyond configured duration
    - Test: session is forcibly expired after max lifetime even if active
    - Test: config values are correctly injected and used
    - _Requirements: REQ-2_

- [x] 4. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. localStorage Migration (Frontend)
  - [x] 5.1 Migrate `authContext.ts` from sessionStorage to localStorage
    - Change `getRestoredState()` to read from localStorage first
    - Add migration path: if sessionStorage has keys but localStorage doesn't, copy and clear sessionStorage
    - Change `syncStorage()` to write to localStorage
    - On logout/session-expired: clear both localStorage and sessionStorage (belt-and-suspenders)
    - _Requirements: REQ-3_
  - [x]* 5.2 Write unit tests for storage migration
    - Test: reads from localStorage when available
    - Test: migrates from sessionStorage to localStorage on first load
    - Test: clears both storages on logout
    - Test: handles corrupted storage gracefully
    - _Requirements: REQ-3_

- [x] 6. Synchronous Token Restore (Frontend)
  - [x] 6.1 Move token restore to module-level synchronous code
    - In `App.tsx` (or where `apiClient` is instantiated): immediately after `new ApiClient()`, read localStorage and call `setToken()`/`setCsrfToken()` synchronously
    - Keep the existing `useEffect` in `AuthGuard` as a secondary sync for runtime state changes
    - Ensure no API call (loadVaults, chat polling, etc.) fires before token is set
    - _Requirements: REQ-4_
  - [x]* 6.2 Write unit tests for synchronous restore
    - Test: apiClient has token before first render cycle
    - Test: no 401 race on page reload with valid stored token
    - _Requirements: REQ-4_

- [x] 7. Graceful Session Expiry Handling (Frontend)
  - [x] 7.1 Add expiry message to `LoginPage`
    - When `authState.error === 'auth.sessionExpired'`, show a yellow/info banner above the login form: "Sitzung abgelaufen — bitte erneut anmelden"
    - Add i18n key `auth.sessionExpiredBanner` (de + en)
    - _Requirements: REQ-5_
  - [x] 7.2 Implement UI state preservation on session expiry
    - Before dispatching `SESSION_EXPIRED`: save current route context to `localStorage` key `slatebase_restore_state` (selected vault, open tab paths, active tab)
    - After re-login in `AuthGuard`: read `slatebase_restore_state`, restore vault selection and tabs
    - Clear `slatebase_restore_state` after restoration or after 5 minutes (stale guard)
    - _Requirements: REQ-5_
  - [x]* 7.3 Write unit tests for state preservation
    - Test: state is saved to localStorage before SESSION_EXPIRED dispatch
    - Test: state is restored after re-login
    - Test: stale state (>5 min) is discarded
    - _Requirements: REQ-5_

- [x] 8. CSRF Mismatch Recovery (Frontend)
  - [x] 8.1 Implement `checkSessionAlive()` in ApiClient
    - Private method: performs raw `fetch('GET', '/api/v1/auth/sessions')` with Authorization header only (no CSRF)
    - Returns `true` on 2xx, `false` on 401 or network error
    - Uses raw `fetch` to avoid recursion through `this.request()`
    - _Requirements: REQ-6_
  - [x] 8.2 Modify `handleResponse()` to intercept 403 CSRF_INVALID
    - On 403: clone response, parse body, check if `code === 'CSRF_INVALID'`
    - If CSRF_INVALID: call `checkSessionAlive()`
    - If session dead (401): trigger `onSessionExpired` callback
    - If session alive (200): do NOT trigger logout — re-throw the CSRF error (UI can show "bitte Seite neu laden")
    - _Requirements: REQ-6_
  - [x]* 8.3 Write unit tests for CSRF recovery
    - Test: 403 CSRF_INVALID with alive session does NOT logout
    - Test: 403 CSRF_INVALID with dead session triggers logout
    - Test: non-CSRF 403 errors are handled normally (no recovery attempt)
    - _Requirements: REQ-6_

- [x] 9. Final Checkpoint — Ensure all tests pass
  - Run `npm run test` in both `backend/` and `frontend/`
  - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1", "1.2", "1.3"],
      "description": "CSRF Secret Persistence — foundation for stable backend restarts"
    },
    {
      "wave": 2,
      "tasks": ["2.1", "2.2"],
      "description": "Session config extension — required before sliding expiry"
    },
    {
      "wave": 3,
      "tasks": ["3.1", "3.2", "3.3"],
      "description": "Sliding expiry implementation — uses config from wave 2"
    },
    {
      "wave": 4,
      "tasks": ["4"],
      "description": "Backend checkpoint — verify all backend changes pass tests"
    },
    {
      "wave": 5,
      "tasks": ["5.1", "5.2"],
      "description": "localStorage migration — foundation for frontend token persistence"
    },
    {
      "wave": 6,
      "tasks": ["6.1", "6.2"],
      "description": "Synchronous token restore — depends on localStorage being in place"
    },
    {
      "wave": 7,
      "tasks": ["7.1", "7.2", "7.3"],
      "description": "Graceful expiry UX — can use restored tokens from wave 6"
    },
    {
      "wave": 8,
      "tasks": ["8.1", "8.2", "8.3"],
      "description": "CSRF mismatch recovery — final frontend robustness layer"
    },
    {
      "wave": 9,
      "tasks": ["9"],
      "description": "Final checkpoint — all tests pass end-to-end"
    }
  ]
}
```

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- No new dependencies are introduced — all changes use existing libraries (fs, crypto, zod, native browser APIs)
- Backend imports must use `.js` extensions
- Atomic writes follow existing pattern: temp file → rename
- CSRF secret file goes in `dataDir` (same as sessions, users, etc.)
- German UI labels, English code/comments
