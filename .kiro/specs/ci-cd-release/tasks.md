# Implementation Plan: CI/CD Release Pipeline

## Overview

Implementierung der automatisierten Release-Pipeline für Slatebase bestehend aus: CI-Workflow (Lint/Test/Build), Release-Workflow (Release Please + Multi-Arch Docker), Backend Version-Endpoint und Frontend Version-Check-Komponente. Die Pipeline-Konfiguration erfolgt über GitHub Actions YAML-Dateien, der Code-Anteil betrifft Backend (Version-Utility + Route) und Frontend (Semver-Utility + VersionCheckCard).

## Tasks

- [x] 1. CI-Workflow und Release Please Konfiguration
  - [x] 1.1 Create CI workflow file `.github/workflows/ci.yml`
    - Define `push` and `pull_request` triggers on all branches
    - Create `backend` job: checkout → setup-node 24 with npm cache → `npm ci` → `npm run test` → `npm run build` (working-directory: backend)
    - Create `frontend` job: checkout → setup-node 24 with npm cache → `npm ci` → `npm run lint` → `npm run test` → `npm run build` (working-directory: frontend)
    - Both jobs run in parallel (no `needs` dependency)
    - Use `cache-dependency-path` for per-package lock file caching
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 1.2 Create Release Please configuration files
    - Create `release-please-config.json` with root package config: `release-type: node`, changelog-sections (Features, Bugfixes, Sonstige Änderungen), `bump-minor-pre-major: true`, `initial-version: 0.1.0`
    - Create `.release-please-manifest.json` with initial version `{ ".": "0.1.0" }`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.4, 3.5_

  - [x] 1.3 Create Release workflow file `.github/workflows/release.yml`
    - Define `push` trigger on `main` branch only
    - Create `release-please` job using `google-github-actions/release-please-action@v4`
    - Output `release_created`, `tag_name`, `major` from release-please step
    - Add pre-release marking step: if `major == '0'`, run `gh release edit <tag> --prerelease`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 1.4 Add Docker build job to Release workflow
    - Create `docker-build` job with `needs: release-please` and `if: needs.release-please.outputs.release_created == 'true'`
    - Setup QEMU (`docker/setup-qemu-action@v3`) and Buildx (`docker/setup-buildx-action@v3`)
    - Login to GHCR using `docker/login-action@v3` with `ghcr.io` and `GITHUB_TOKEN`
    - Conditional DockerHub login with `continue-on-error: true` when secrets exist
    - Use matrix strategy for backend and frontend images
    - Build with `docker/build-push-action@v6`: platforms `linux/amd64,linux/arm64`, push tags (version + latest) to GHCR and conditionally to DockerHub
    - Add OCI labels: version, description, source, licenses
    - Add GHCR package visibility step (set to public)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4_

- [x] 2. Checkpoint - Verify workflow files
  - Ensure YAML syntax is valid, ask the user if questions arise.

- [x] 3. Backend Version Endpoint
  - [x] 3.1 Implement `getVersion()` utility in `backend/src/version.ts`
    - Read from `process.env.SLATEBASE_VERSION` first
    - Fallback to reading `version.json` from project root (resolved via `import.meta.dirname`)
    - Final fallback: return `'development'`
    - Add JSDoc documentation
    - _Requirements: 8.4, 8.5_

  - [ ]* 3.2 Write unit tests for `getVersion()` in `backend/src/version.test.ts`
    - Test reading from environment variable
    - Test fallback to `version.json` file
    - Test fallback to `'development'` when neither source available
    - _Requirements: 8.4, 8.5_

  - [x] 3.3 Create version route handler in `backend/src/api/versionRoutes.ts`
    - Implement `GET /api/v1/version` returning `{ "version": "X.Y.Z" }` with status 200
    - Use `getVersion()` utility
    - Register route outside auth middleware chain (public endpoint)
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 3.4 Write unit tests for version route in `backend/src/api/versionRoutes.test.ts`
    - Test 200 response with correct JSON format
    - Test no authentication required
    - Test Content-Type is `application/json`
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 3.5 Create `backend/version.json` with initial version
    - Content: `{ "version": "0.1.0" }`
    - This file will be updated by Release Please on each release
    - _Requirements: 8.4_

  - [x] 3.6 Register version route in composition root (`backend/src/index.ts`)
    - Import `versionRoutes` and register on the Hono app outside the auth middleware
    - Place alongside other public endpoints (like `.well-known/mcp.json`)
    - _Requirements: 8.1, 8.2_

- [x] 4. Checkpoint - Backend version endpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Frontend Semver Utility and VersionCheckCard
  - [x] 5.1 Implement `compareSemver()` in `frontend/src/utils/semver.ts`
    - Parse semver strings (strip leading `v` prefix if present)
    - Compare MAJOR, MINOR, PATCH numerically
    - Return `-1 | 0 | 1`
    - Add JSDoc documentation
    - _Requirements: 9.6_

  - [ ]* 5.2 Write unit tests for `compareSemver()` in `frontend/src/utils/semver.test.ts`
    - Test equal versions return 0
    - Test less-than returns -1
    - Test greater-than returns 1
    - Test `v` prefix stripping
    - Test edge cases (0.0.0, large numbers)
    - _Requirements: 9.6_

  - [x] 5.3 Add `getVersion()` method to `frontend/src/api/index.ts`
    - Add `getVersion(): Promise<{ version: string }>` to `IApiClient` interface
    - Implement in `ApiClient` class using `GET /api/v1/version` (no auth header needed)
    - _Requirements: 9.1_

  - [x] 5.4 Implement `VersionCheckCard` component in `frontend/src/components/VersionCheckCard.tsx`
    - Fetch installed version from backend `GET /api/v1/version`
    - Fetch latest release from GitHub API `https://api.github.com/repos/andreas13xxx/Slatebase/releases/latest` with 10s timeout
    - State management: `loading`, `installedVersion`, `latestVersion`, `latestReleaseUrl`, `error`
    - Display states: Loading indicator, "Aktuell" (versions match or installed > latest), "Update verfügbar" with link, "Entwicklungsversion" (when version is `development`), error message when backend unreachable
    - Use `compareSemver()` for client-side version comparison
    - German UI labels
    - Use CSS Custom Properties from existing Design Token system
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 5.5 Add CSS styles for `VersionCheckCard` in `frontend/src/App.css`
    - Define styles for card container, status indicators (current/update/dev/error)
    - Use existing Design Tokens (`--bg-surface`, `--text-primary`, `--accent`, `--success`, `--danger`, etc.)
    - Add appropriate Dark Mode token overrides if needed
    - _Requirements: 9.3, 9.4, 9.7, 9.8_

  - [ ]* 5.6 Write unit tests for `VersionCheckCard` in `frontend/src/components/VersionCheckCard.test.tsx`
    - Test loading indicator during API calls
    - Test "Aktuell" state when versions match
    - Test update notification with release link
    - Test "Entwicklungsversion" when version is `development`
    - Test error state when backend unreachable
    - Test graceful handling when GitHub API fails (only show installed version)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8_

  - [x] 5.7 Integrate `VersionCheckCard` into `AdminConfigPage.tsx`
    - Import and render `VersionCheckCard` at the top of the admin config page
    - Pass no props (component is self-contained)
    - _Requirements: 9.1_

- [x] 6. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- No property-based tests per project decision (PBT removed, see lessons-learned steering)
- Release Please handles Requirements 2 and 3 (versioning + changelog) automatically via configuration
- DockerHub push is conditional on secrets availability (Requirement 6)
- The `version.json` file will be automatically updated by Release Please commits
- GHCR package visibility may need manual configuration after first push if `GITHUB_TOKEN` permissions are insufficient

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "3.1", "5.1"] },
    { "id": 1, "tasks": ["1.3", "3.2", "3.5", "5.2", "5.3"] },
    { "id": 2, "tasks": ["1.4", "3.3", "5.4"] },
    { "id": 3, "tasks": ["3.4", "3.6", "5.5"] },
    { "id": 4, "tasks": ["5.6", "5.7"] }
  ]
}
```
