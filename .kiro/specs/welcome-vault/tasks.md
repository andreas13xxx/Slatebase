# Implementation Plan: Welcome Vault

## Overview

Implementierung des Welcome-Vault-Features: Ein vorkonfigurierter Vault mit Tutorial-Inhalten wird automatisch für neue Benutzer erstellt. Die Implementierung umfasst einen neuen Service (`WelcomeVaultService`), Config-Schema-Erweiterung, Feature-Toggle-Registrierung, UserService-Integration via Callback und Template-Dateien.

## Tasks

- [x] 1. Welcome Vault Module: Types and Interface
  - [x] 1.1 Create types and service implementation
    - Create `backend/src/welcome-vault/types.ts` with `WelcomeVaultConfig` interface and `OnUserCreatedFn` type
    - Create `backend/src/welcome-vault/index.ts` with `IWelcomeVaultService` interface and `WelcomeVaultService` class implementation
    - Barrel-export all public symbols from `index.ts`
    - Service must implement never-throw guarantee (all errors caught and logged)
    - Use `node:fs/promises` for filesystem operations, `node:path` for path handling
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Config Schema and Feature Toggle
  - [x] 2.1 Extend config schema with welcomeVault section
    - Add `WelcomeVaultConfigSchema` Zod object to `backend/src/config/index.ts` with `name: z.string().min(1).max(128).default('Willkommen')`
    - Add `welcomeVault: WelcomeVaultConfigSchema.default({})` to `ServerConfigSchema`
    - Add `getWelcomeVaultConfig(): WelcomeVaultConfig` method to config service
    - Add `"welcomeVault": { "name": "Willkommen" }` to `backend/config/default.json`
    - _Requirements: 3.4_
  - [x] 2.2 Register welcome-vault feature toggle
    - In the composition root (`backend/src/index.ts`), register the feature toggle: `{ name: 'welcome-vault', description: 'Automatischer Welcome-Vault für neue Benutzer', defaultEnabled: true, type: 'hot' }`
    - _Requirements: 1.6, 3.2_

- [x] 3. UserService Integration
  - [x] 3.1 Add onUserCreated callback to UserService
    - Add optional `onUserCreated?: OnUserCreatedFn` parameter to `UserService` constructor
    - Invoke callback after successful `userRepository.save()` with try/catch (never propagate errors)
    - Log error if callback throws
    - _Requirements: 1.1, 1.4_
  - [ ]* 3.2 Write unit tests for onUserCreated callback
    - Extend existing tests in `backend/src/user/index.test.ts`
    - Test: callback is called with userId after user creation
    - Test: callback error does not break user creation
    - Test: no callback provided works as before
    - _Requirements: 1.1, 1.4_

- [x] 4. Composition Root Wiring
  - [x] 4.1 Wire WelcomeVaultService and onUserCreated in composition root
    - In `backend/src/index.ts`: instantiate `WelcomeVaultService` with vaultService, featureToggleService, config, logger, dataDir
    - Create `onUserCreated` closure that calls `welcomeVaultService.createWelcomeVault(userId)`
    - Pass `onUserCreated` to UserService constructor
    - _Requirements: 1.1, 1.6_

- [x] 5. Template Content
  - [x] 5.1 Create template directory and markdown files
    - Create `backend/data/templates/welcome-vault/` directory structure
    - Create `Start hier.md` with Wikilinks to other files
    - Create `Grundlagen/Markdown Syntax.md`, `Grundlagen/Wikilinks.md`, `Grundlagen/Tags und Metadaten.md`
    - Create `Projekte/Beispielprojekt.md` (with Callouts), `Projekte/Aufgabenliste.md`
    - Create `Referenz/Callouts.md`, `Referenz/Embeds.md`, `Referenz/Ordnerstruktur.md`
    - Create `Anhang/Tastenkürzel.md`
    - Create `Anhang/Bilder/beispiel.png` (minimal valid PNG for embed demo)
    - All content in German, demonstrating Wikilinks, Tags, Callouts, Embeds
    - Total: 10 markdown files + 1 image, 4 subdirectories
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 6. Tests
  - [ ]* 6.1 Write unit tests for WelcomeVaultService
    - Create `backend/src/welcome-vault/index.test.ts`
    - Mock factories: `createMockVaultService()`, `createMockFeatureToggleService()`, `createMockLogger()`
    - Test: happy path (toggle enabled, vault created, files copied)
    - Test: toggle disabled → no vault creation
    - Test: template dir missing → vault created empty, warning logged
    - Test: template dir empty → vault created empty, warning logged
    - Test: createVault throws → error logged, no throw
    - Test: single file copy fails → other files still copied
    - Test: configured name passed to createVault
    - Test: nested directory structure preserved
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 3.4_
  - [ ]* 6.2 Write template content validation tests
    - Create `backend/src/welcome-vault/template-content.test.ts`
    - Test: template directory exists and contains 5–15 .md files
    - Test: `Start hier.md` exists and contains Wikilinks (`[[...]]`)
    - Test: at least one image file exists (`.png` or `.jpg`)
    - Test: at least 2 subdirectories exist
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_
  - [ ]* 6.3 Write integration test
    - Create `backend/src/welcome-vault/integration.test.ts`
    - Test full flow: create temp dirs, instantiate real service with real filesystem, verify template files are copied correctly with preserved structure
    - _Requirements: 1.2, 3.1, 3.3_

- [x] 7. Final Verification
  - [x] 7.1 Checkpoint - Run all tests and verify
    - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["2.2", "3.1"] },
    { "id": 2, "tasks": ["1.2", "3.2", "5.1"] },
    { "id": 3, "tasks": ["4.1", "6.1"] },
    { "id": 4, "tasks": ["6.2", "6.3"] },
    { "id": 5, "tasks": ["7.1"] }
  ]
}
```

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for faster MVP
- All code uses TypeScript strict mode, ESM with `.js` extensions on relative imports
- Mock factories follow `createMock*` pattern (no external mocking library)
- The WelcomeVaultService implements a strict never-throw guarantee
- Template content is in German (product UI language)
