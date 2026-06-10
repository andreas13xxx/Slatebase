# Implementation Plan: Feature-Toggles

## Overview

Implementierung eines zentralen Feature-Toggle-Systems für Slatebase. Das System ersetzt verstreute Konfigurationen (z.B. `mcp.enabled`) durch ein konsistentes Registry-Pattern mit In-Memory-State, Env-Var-Overrides, Admin-API und Frontend-Integration. Die Umsetzung folgt dem bewährten Feature-Modul-Pattern: Types → Errors → Registry → Service → Middleware → Routes → Frontend-State.

## Tasks

- [x] 1. Backend: Feature-Toggle-Modul Grundstruktur
  - [x] 1.1 Erstelle `backend/src/feature-toggle/types.ts` mit allen Interfaces und Datenmodellen
    - Definiere `ToggleType`, `FeatureToggleDefinition`, `FeatureToggleState`, `FeatureToggleUpdateResult`
    - Definiere `IFeatureToggleService` mit `isEnabled`, `setEnabled`, `getAll`, `get`, `onChange`
    - Definiere `IFeatureRegistry` mit `register`, `getAll`, `has`, `get`
    - Definiere `FeatureChangeListener` Callback-Type
    - _Requirements: 2.3, 9.1, 9.3_

  - [x] 1.2 Erstelle `backend/src/feature-toggle/errors.ts` mit Error-Klassen
    - Implementiere `FeatureNotFoundError`, `FeatureAlreadyRegisteredError`, `InvalidFeatureNameError`
    - _Requirements: 5.5, 9.2_

  - [x] 1.3 Erstelle `backend/src/feature-toggle/feature-registry.ts` mit deklarativer Feature-Registrierung
    - Implementiere Namensvalidierung: Regex `[a-z][a-z0-9-]{0,63}`
    - Implementiere Beschreibungs-Validierung (1–256 Zeichen)
    - Implementiere Duplikat-Prüfung
    - Speichere Definitionen in einer `Map<string, FeatureToggleDefinition>`
    - _Requirements: 9.1, 9.2_

  - [ ]* 1.4 Erstelle `backend/src/feature-toggle/feature-registry.test.ts` mit Unit Tests
    - Teste gültige Registrierung mit allen Pflichtfeldern
    - Teste Ablehnung bei Duplikat-Name
    - Teste Ablehnung bei ungültigem Namensformat (zu kurz, zu lang, falsche Zeichen, beginnt nicht mit Kleinbuchstabe)
    - Teste `has()` und `get()` für registrierte/nicht-registrierte Features
    - Teste `getAll()` gibt alle Definitionen zurück
    - _Requirements: 9.1, 9.2_

- [x] 2. Backend: FeatureToggleService Implementierung
  - [x] 2.1 Erstelle `backend/src/feature-toggle/feature-toggle-service.ts`
    - Implementiere In-Memory-State als `Map<string, ToggleEntry>` mit `source`-Tracking
    - Implementiere `isEnabled()`: synchron, O(1), gibt `false` für unbekannte/ungültige Namen zurück
    - Implementiere `setEnabled()`: ändert Runtime-State, wirft `FeatureNotFoundError` bei unbekanntem Feature
    - Implementiere `getAll()` und `get()` für Status-Abfragen
    - Implementiere `onChange()` Listener-Registrierung und Notification bei Statusänderungen
    - Implementiere Env-Var-Overlay: `SLATEBASE_FEATURE_<NAME>` Mapping-Algorithmus (Bindestriche → Unterstriche, Uppercase)
    - Implementiere case-insensitive Boolean-Parsing (`true`/`1` → true, `false`/`0` → false)
    - Implementiere Ignorieren ungültiger Env-Var-Werte (Fallback auf Config-Default)
    - Implementiere Initialisierung aus `features`-Sektion der Config und Registry-Definitionen
    - _Requirements: 1.6, 1.7, 1.8, 1.9, 2.1, 2.2, 2.4, 5.3, 9.4, 9.5_

  - [ ]* 2.2 Erstelle `backend/src/feature-toggle/feature-toggle-service.test.ts` mit Unit Tests
    - Teste `isEnabled()` gibt Default-Wert zurück wenn weder Env noch Runtime gesetzt
    - Teste `isEnabled()` gibt `false` für unbekannte Namen zurück
    - Teste `isEnabled()` gibt `false` für leere/ungültige Strings zurück (leer, Whitespace, >128 Zeichen, ungültige Zeichen)
    - Teste Env-Var-Override hat Vorrang vor Config-Default
    - Teste Env-Var-Namens-Mapping (Bindestriche → Unterstriche, Uppercase, Prefix)
    - Teste Case-insensitive Boolean-Parsing (`True`, `FALSE`, `1`, `0`)
    - Teste ungültige Env-Var-Werte werden ignoriert (Fallback auf Config)
    - Teste `setEnabled()` ändert Runtime-State sofort (nachfolgender `isEnabled` gibt neuen Wert)
    - Teste `setEnabled()` wirft bei unbekanntem Feature
    - Teste `setEnabled()` gibt `restartRequired: true` für Cold-Toggles, `false` für Hot-Toggles
    - Teste `onChange`-Listener wird bei Statusänderung aufgerufen
    - Teste Performance: 1000 `isEnabled`-Aufrufe in < 10ms
    - _Requirements: 1.6, 1.7, 1.8, 1.9, 2.1, 2.2, 2.4, 5.3, 9.4, 9.5_

- [x] 3. Backend: Feature-Guard Middleware
  - [x] 3.1 Erstelle `backend/src/feature-toggle/middleware.ts` mit `createFeatureGuard()` Factory
    - Implementiere Hono-Middleware die `isEnabled()` auf dem Service aufruft
    - Blockiere mit HTTP 403, Code `FEATURE_DISABLED`, message enthält Feature-Name
    - Nicht-registrierte Features werden blockiert (gleiches Verhalten wie deaktiviert)
    - Aktivierte Features: `await next()` ohne Änderung an Headers/Body/Context
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 3.2 Erstelle `backend/src/feature-toggle/middleware.test.ts` mit Unit Tests
    - Teste deaktiviertes Feature → 403 mit `FEATURE_DISABLED` Code und Feature-Name in message
    - Teste aktiviertes Feature → `next()` aufgerufen, Response unverändert
    - Teste nicht-registriertes Feature → 403 (wie deaktiviert)
    - Teste Response-Body enthält Feature-Name in message
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Backend: Barrel-Export und Konfigurationsanpassung
  - [x] 4.1 Erstelle `backend/src/feature-toggle/index.ts` als Barrel-Export
    - Exportiere alle Interfaces, Service-Klasse, Registry-Klasse, Middleware-Factory, Error-Klassen
    - _Requirements: 2.3_

  - [x] 4.2 Erweitere `backend/config/default.json` um `features`-Sektion
    - Füge `features` Objekt hinzu mit: `vault-sync: { enabled: false }`, `obsidian-plugin-compat: { enabled: false }`, `chat: { enabled: true }`, `mcp: { enabled: true }`, `knowledge-graph: { enabled: true }`
    - Entferne `enabled`-Feld aus dem `mcp`-Objekt (behalte `maxFileSize`, `rateLimit`, `maxTokensPerUser`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.1, 8.4_

  - [x] 4.3 Erweitere `backend/src/config/index.ts` um Features-Config-Schema
    - Definiere Zod-Schema für `features`-Sektion: `z.record(z.string(), z.object({ enabled: z.boolean() })).default({})`
    - Integriere in bestehendes ConfigService
    - Stelle sicher dass `mcp.enabled` nicht mehr ausgewertet wird (Feld ignorieren falls vorhanden)
    - _Requirements: 1.1, 8.1, 8.5_

- [x] 5. Checkpoint - Kern-Module validieren
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Backend: Admin-API und Public-API Routes
  - [x] 6.1 Erstelle `backend/src/api/featureRoutes.ts` mit Admin + Public Feature Endpoints
    - Implementiere `GET /admin/features`: gibt Array aller Toggles zurück (name, enabled, type, description)
    - Implementiere `PUT /admin/features/:featureName`: Body `{ enabled: boolean }`, Zod-Validierung, gibt `{ name, enabled, restartRequired }` zurück
    - Implementiere `GET /api/v1/features`: gibt Array mit nur `name` + `enabled` zurück (für alle authentifizierten Benutzer)
    - Error-Handling: 404 `FEATURE_NOT_FOUND` bei unbekanntem Feature, 400 `VALIDATION_ERROR` bei ungültigem Body
    - Audit-Log-Eintrag bei Toggle-Änderung: `FEATURE_TOGGLED` mit oldEnabled, newEnabled
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 7.6_

  - [ ]* 6.2 Erstelle Tests für Feature API Routes
    - Teste `GET /admin/features` → Array aller Toggles mit korrektem Format
    - Teste `PUT /admin/features/:name` → 200 mit aktualisiertem State
    - Teste `PUT` mit ungültigem Body → 400
    - Teste `PUT` mit unbekanntem Feature → 404 mit `FEATURE_NOT_FOUND`
    - Teste Audit-Log-Eintrag wird erstellt
    - Teste `GET /api/v1/features` → nur `name` + `enabled` (kein description/type)
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 7.6_

- [x] 7. Backend: Composition Root Integration und MCP-Migration
  - [x] 7.1 Integriere FeatureToggleService in `backend/src/index.ts` Composition Root
    - Instanziiere `FeatureRegistry` und registriere alle 5 Features mit korrekten Definitionen (name, description, defaultEnabled, type)
    - Instanziiere `FeatureToggleService` mit Registry, Config-Werten und Env-Vars
    - Registriere Feature-Routes im Router (Admin unter bestehender Admin-Middleware, Public unter `/api/v1/features`)
    - Ersetze `mcpConfig.enabled`-Check durch `featureToggleService.isEnabled('mcp')` für MCP-Initialisierung
    - Entferne Auswertung von `SLATEBASE_MCP_ENABLED` Env-Var (nur noch `SLATEBASE_FEATURE_MCP`)
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 7.2 Wende Feature-Guards auf bestehende Feature-Routen an
    - Schütze Chat-Routes mit `createFeatureGuard('chat', featureToggleService)`
    - Schütze MCP-Token-Routes mit `createFeatureGuard('mcp', featureToggleService)`
    - Schütze Graph-Routes mit `createFeatureGuard('knowledge-graph', featureToggleService)`
    - Schütze Plugin-Routes mit `createFeatureGuard('obsidian-plugin-compat', featureToggleService)`
    - Schütze Sync-Routes mit `createFeatureGuard('vault-sync', featureToggleService)`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 7.3 Implementiere Scheduler-Steuerung bei Toggle-Änderung
    - Registriere `onChange`-Listener auf dem FeatureToggleService
    - Bei Deaktivierung von `vault-sync`: Stoppe SyncScheduler (keine neuen Zyklen, laufende zu Ende führen)
    - Bei Aktivierung von `vault-sync`: Starte SyncScheduler gemäß gespeicherter Konfiguration
    - Stelle sicher dass Scheduler-Stopp innerhalb von 5 Sekunden nach Statusänderung erfolgt
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 7.4 Aktualisiere `backend/src/mcp/config.ts` — entferne `enabled`-Feld aus McpConfig
    - Entferne `enabled`-Property aus `McpConfig`-Interface und `loadMcpConfig()`
    - Stelle sicher dass MCP-bezogener Code (Rate-Limit, MaxFileSize, MaxTokensPerUser) weiterhin funktioniert
    - _Requirements: 8.3, 8.4_

  - [x] 7.5 Aktualisiere `.well-known/mcp.json` Route
    - Handler soll 404 zurückgeben wenn `featureToggleService.isEnabled('mcp')` false ist
    - _Requirements: 8.3_

- [x] 8. Checkpoint - Backend vollständig
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Frontend: Feature-State und Context
  - [x] 9.1 Erstelle `frontend/src/state/featureState.ts` mit Reducer und Types
    - Definiere `FeatureToggleInfo`, `FeatureState`, `FeatureAction` Types
    - Implementiere `featureReducer` mit Transitions: `FEATURES_LOADING`, `FEATURES_LOADED`, `FEATURES_ERROR`, `FEATURE_UPDATED`, `FEATURE_UPDATE_FAILED`
    - Implementiere optimistisches Update bei `FEATURE_UPDATED` und Rollback bei `FEATURE_UPDATE_FAILED`
    - _Requirements: 6.3, 6.4_

  - [ ]* 9.2 Erstelle `frontend/src/state/featureState.test.ts` mit Reducer-Tests
    - Teste alle State-Transitions (loading, loaded, error, update, rollback)
    - Teste optimistisches Toggle + Rollback bei Fehler
    - _Requirements: 6.3, 6.4_

  - [x] 9.3 Erstelle `frontend/src/state/featureContext.ts` mit FeatureProvider und Hook
    - Implementiere `FeatureProvider` mit `useReducer` für Feature-State
    - Implementiere `useFeatureContext()` Hook mit `FeatureContextValue` (state, dispatch, isEnabled)
    - `isEnabled()` Hilfsfunktion: sucht Feature in State, gibt `false` als Default
    - _Requirements: 7.6_

  - [x] 9.4 Erstelle `frontend/src/state/featureActions.ts` mit Action Creators
    - Implementiere `loadFeatures(dispatch, apiClient)`: Ruft `GET /api/v1/features` auf und dispatcht Ergebnis
    - Implementiere `toggleFeature(dispatch, apiClient, name, enabled)`: Optimistischer PUT + Rollback bei Fehler
    - _Requirements: 6.3, 6.4, 7.6_

  - [ ]* 9.5 Erstelle `frontend/src/state/featureContext.test.ts` mit Context-Tests
    - Teste Provider liefert korrekten Context
    - Teste `isEnabled()` delegiert korrekt an State
    - _Requirements: 7.6_

- [x] 10. Frontend: API-Client-Erweiterung und Provider-Integration
  - [x] 10.1 Erweitere `frontend/src/api/index.ts` um Feature-Endpoints
    - Füge `loadFeatures(): Promise<FeatureToggleInfo[]>` hinzu (GET /api/v1/features)
    - Füge `loadAdminFeatures(): Promise<FeatureToggleState[]>` hinzu (GET /admin/features)
    - Füge `toggleAdminFeature(name: string, enabled: boolean): Promise<FeatureToggleUpdateResult>` hinzu (PUT /admin/features/:name)
    - _Requirements: 7.6, 5.1, 5.2_

  - [x] 10.2 Integriere `FeatureProvider` in App-Hierarchie
    - Füge `FeatureProvider` in `App.tsx` nach `AuthProvider` ein (alle authentifizierten Benutzer brauchen Feature-State)
    - Lade Features automatisch nach Login via `loadFeatures` in der Provider-Initialisierung
    - _Requirements: 7.6_

- [x] 11. Frontend: Admin-Panel Feature-Toggle-UI
  - [x] 11.1 Implementiere Feature-Toggle-Sektion auf Admin-Konfigurationsseite
    - Zeige Sektion "Feature-Toggles" auf der Admin-Config-Seite an
    - Zeige für jeden Toggle: Name, Toggle-Switch, aktueller Status, Cold-Toggle-Hinweis falls zutreffend
    - Implementiere Toggle-Switch-Betätigung: Optimistischer PUT + Rollback bei Fehler + Toast bei Fehler
    - Zeige deaktivierte Features mit reduzierter Deckkraft (opacity)
    - Zeige Loading-Indikator während Toggle-Liste geladen wird
    - Zeige Fehlermeldung mit Retry bei fehlgeschlagenem Laden
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

- [x] 12. Frontend: UI-Ausblendung deaktivierter Features
  - [x] 12.1 Implementiere Feature-abhängiges Rendering in Sidebar und Navigation
    - Blende Chat-Button aus wenn `chat` deaktiviert
    - Blende Sync-Status-Button und Sync-Konfigurationsseite aus wenn `vault-sync` deaktiviert
    - Blende MCP-Token-Verwaltung aus wenn `mcp` deaktiviert
    - Blende Plugin-Verwaltungsseite und Command-Palette-Shortcut aus wenn `obsidian-plugin-compat` deaktiviert
    - Blende Graph-Button und Graph-Tab aus wenn `knowledge-graph` deaktiviert
    - Implementiere Redirect/Hinweis bei direktem URL-Aufruf eines deaktivierten Features
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7_

- [x] 13. Final Checkpoint - Alle Integrationen validieren
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- No PBT tests per project convention — Unit Tests with edge cases cover all correctness properties
- The design uses TypeScript throughout, matching the existing project stack
- Feature-Guard middleware integrates seamlessly with existing auth middleware chain
- The `mcp.enabled` removal in Requirement 8 requires careful coordination with existing MCP initialization code

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "4.2"] },
    { "id": 2, "tasks": ["1.4", "2.1", "4.3"] },
    { "id": 3, "tasks": ["2.2", "3.1", "4.1"] },
    { "id": 4, "tasks": ["3.2", "6.1"] },
    { "id": 5, "tasks": ["6.2", "7.1", "7.4"] },
    { "id": 6, "tasks": ["7.2", "7.3", "7.5"] },
    { "id": 7, "tasks": ["9.1", "10.1"] },
    { "id": 8, "tasks": ["9.2", "9.3", "9.4"] },
    { "id": 9, "tasks": ["9.5", "10.2"] },
    { "id": 10, "tasks": ["11.1"] },
    { "id": 11, "tasks": ["12.1"] }
  ]
}
```
