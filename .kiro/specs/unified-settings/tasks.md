# Implementation Plan: Unified Settings

## Overview

Das Unified Settings Feature konsolidiert alle verstreuten Einstellungsseiten in ein einzelnes Settings-Panel mit kategorisierter Seitenleisten-Navigation. Die Implementierung folgt dem bestehenden Provider/Reducer-Pattern mit einem eigenen `SettingsProvider`, einer statischen `SettingsRegistry` für Sektionsdefinitionen und der Wiederverwendung aller bestehenden Komponenten als Sektionsinhalte.

**Technologie:** TypeScript, React 19, CSS Custom Properties, fast-check (Property-Tests)

## Tasks

- [x] 1. State Layer und Registry erstellen
  - [x] 1.1 Erstelle `frontend/src/state/settingsState.ts` — Types, State-Interface, Actions, Reducer
    - Definiere `SettingsCategory`, `AccountSection`, `VaultSection`, `AdminSection`, `SettingsSection` Types
    - Definiere `SettingsNavState` Interface mit `category`, `section`, `selectedVaultId`, `searchQuery`, `mobileNavOpen`
    - Definiere `SettingsAction` discriminated union (NAVIGATE, SELECT_VAULT, SET_SEARCH, TOGGLE_MOBILE_NAV, CLOSE_MOBILE_NAV, RESTORE_STATE)
    - Implementiere `settingsReducer` mit Navigation-Guard (Admin-Check), Category-Section-Validierung, Mobile-Nav-Auto-Close bei Navigation
    - Exportiere `initialSettingsState` und `SETTINGS_NAV_KEY` Konstante
    - _Requirements: 1.4, 1.6, 4.7, 4.8, 5.1, 6.3_

  - [x] 1.2 Erstelle `frontend/src/state/settingsRegistry.ts` — ISettingsRegistry, ISettingsSectionDef, statische Registry-Daten
    - Definiere `ISettingsSectionDef` Interface mit `id`, `labelKey`, `category`, `requiresAdmin`, `requiresVault`
    - Definiere `ISettingsRegistry` Interface mit `getCategories()`, `getSections()`, `getAllSections()`, `findSection()`
    - Implementiere `SETTINGS_SECTIONS` Array mit allen 11 Sektionsdefinitionen
    - Implementiere `createSettingsRegistry()` Factory-Funktion die `ISettingsRegistry` zurückgibt
    - `getCategories(isAdmin)` gibt `['account', 'vault']` zurück, plus `'administration'` nur wenn `isAdmin === true`
    - _Requirements: 1.2, 1.3, 2.1, 3.1, 4.1, 4.2_

  - [x] 1.3 Erstelle `frontend/src/state/settingsPersistence.ts` — sessionStorage-Serialisierung und Validierung
    - Implementiere `persistSettingsNav(state: SettingsNavState): void` — schreibt in sessionStorage
    - Implementiere `restoreSettingsNav(isAdmin: boolean, vaultIds: string[]): SettingsNavState | null` — liest und validiert
    - Validierung: Kategorie gültig, Sektion passt zur Kategorie, Admin-Check, selectedVaultId existiert in vaultIds
    - Graceful Degradation bei sessionStorage-Fehler (QuotaExceeded, Private Browsing)
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 1.4 Erstelle `frontend/src/state/settingsContext.ts` — SettingsProvider und useSettingsContext Hook
    - Implementiere `SettingsProvider` mit `useReducer(settingsReducer, initialSettingsState)`
    - Lade gespeicherten State beim Mount via `restoreSettingsNav()` → `RESTORE_STATE` Action
    - Persistiere State bei jeder Änderung via `useEffect` → `persistSettingsNav()`
    - Exponiere `state`, `dispatch`, `registry` im Context-Value
    - `useSettingsContext()` Hook mit Error wenn außerhalb Provider
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. Checkpoint — State Layer Tests
  - [x] 2.1 Erstelle `frontend/src/state/settingsState.test.ts` — Unit Tests für settingsReducer
    - NAVIGATE zu gültigen Kategorien/Sektionen
    - NAVIGATE zu Admin-Sektion ohne Admin-Rolle → Fallback auf account/profile
    - NAVIGATE mit ungültiger Section für Category → Fallback auf erste Section
    - SELECT_VAULT aktualisiert selectedVaultId
    - SET_SEARCH aktualisiert searchQuery
    - TOGGLE_MOBILE_NAV / CLOSE_MOBILE_NAV
    - RESTORE_STATE mit gültigem und ungültigem Payload
    - Mobile-Nav schließt bei NAVIGATE
    - _Requirements: 1.4, 1.6, 4.7, 4.8, 6.3_

  - [x] 2.2 Erstelle `frontend/src/state/settingsRegistry.test.ts` — Unit Tests für Registry
    - getCategories mit isAdmin=true enthält 'administration'
    - getCategories mit isAdmin=false enthält NICHT 'administration'
    - Reihenfolge: account, vault, administration
    - getSections für jede Kategorie gibt korrekte Sektionen zurück
    - findSection für existierende/nicht-existierende IDs
    - _Requirements: 1.2, 1.3, 4.1, 4.2_

  - [x] 2.3 Erstelle `frontend/src/state/settingsPersistence.test.ts` — Unit Tests für Persistenz
    - Round-Trip: serialize → deserialize ergibt identischen State
    - Ungültige Kategorie → null (Fallback)
    - Admin-Kategorie + isAdmin=false → null (Fallback)
    - Ungültiger JSON-String → null
    - sessionStorage-Fehler → graceful (kein Throw)
    - selectedVaultId nicht in vaultIds → null für vaultId
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 2.4 Property-Test: Category visibility is role-dependent
    - **Property 1: Category visibility is role-dependent**
    - Für beliebige `isAdmin ∈ {true, false}`: getCategories beginnt immer mit ['account', 'vault'], enthält 'administration' iff isAdmin=true
    - `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 1.3, 4.2**

  - [ ]* 2.5 Property-Test: Navigation guard rejects unauthorized access
    - **Property 2: Navigation guard rejects unauthorized access**
    - Für beliebige Admin-Sektionen + isAdmin=false: Ergebnis ist immer {category: 'account', section: 'profile'}
    - `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 4.7, 4.8**

  - [ ]* 2.6 Property-Test: Navigation produces valid category-section pairs
    - **Property 3: Navigation produces valid category-section pairs**
    - Für beliebige gültige NAVIGATE-Actions: Ergebnis hat passende category/section Kombination
    - `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 1.4, 5.5**

  - [ ]* 2.7 Property-Test: Navigation state round-trip persistence
    - **Property 5: Navigation state round-trip persistence**
    - Für beliebige gültige SettingsNavState: serialize → deserialize ergibt äquivalenten State
    - `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 2.8 Property-Test: Invalid persisted state falls back to defaults
    - **Property 6: Invalid persisted state falls back to defaults**
    - Für beliebige ungültige JSON-Strings: Restore ergibt null (Fallback-Trigger)
    - `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 5.3**

  - [ ]* 2.9 Property-Test: Mobile navigation closes on section selection
    - **Property 7: Mobile navigation closes on section selection**
    - Für beliebige States mit mobileNavOpen=true + NAVIGATE-Action: Ergebnis hat mobileNavOpen=false
    - `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 6.3**

  - [ ]* 2.10 Property-Test: Search filter returns only matching entries
    - **Property 8: Search filter returns only matching entries**
    - Für beliebige Query-Strings × Sektions-Labels: Ergebnis enthält nur Labels mit query als case-insensitive Substring
    - `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 9.2, 9.4**

  - [ ]* 2.11 Property-Test: Navigation from search preserves search query
    - **Property 9: Navigation from search preserves search query**
    - Für beliebige States mit searchQuery + NAVIGATE: searchQuery bleibt unverändert
    - `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 9.5**

- [x] 3. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 4. Settings-Panel Komponenten erstellen
  - [x] 4.1 Erstelle `frontend/src/components/settings/SettingsPanel.tsx` und `SettingsPanel.css` — Haupt-Container
    - Container-Query-fähiges Layout (`@container` mit 700px Schwellenwert)
    - Props: `open`, `onClose`, `initialNav?`
    - Rendert `SettingsProvider` → `SettingsSidebar` + `SettingsContent`
    - `Ctrl+,` Keyboard-Shortcut-Registrierung (globaler Event-Listener)
    - Öffnen/Schließen mit Panel-Overlay oder Modal-Darstellung
    - CSS: nur Custom Properties aus `index.css`, Dark-Mode-kompatibel
    - ARIA: korrektes Landmark-Markup
    - _Requirements: 1.1, 5.4, 6.1, 6.2, 6.4, 6.5, 6.6, 8.1_

  - [x] 4.2 Erstelle `frontend/src/components/settings/SettingsSidebar.tsx` — Navigations-Seitenleiste
    - `role="navigation"` mit geordneter Liste (`<ul>`/`<li>`)
    - Kategorien als Gruppen-Headers, Sektionen als navigierbare Einträge
    - `aria-current="page"` auf aktivem Eintrag
    - Tastaturnavigation: Pfeiltasten (Auf/Ab) zwischen Einträgen, Enter aktiviert
    - Props: `state`, `isAdmin`, `vaults`, `dispatch`
    - Rendert `SettingsSearch`, `VaultSelector` (bei Vault-Kategorie), `SettingsNavList`
    - _Requirements: 1.1, 1.4, 3.2, 8.1, 8.2, 8.4_

  - [x] 4.3 Erstelle `frontend/src/components/settings/SettingsSearch.tsx` — Suchfeld mit Debounce
    - Suchfeld oberhalb der Kategorieliste
    - 150ms Debounce vor Filterung
    - Dispatch `SET_SEARCH` mit aktuellem Query
    - Leeres Feld → vollständige Navigation wiederherstellen
    - _Requirements: 9.1, 9.2, 9.4_

  - [x] 4.4 Erstelle `frontend/src/components/settings/SettingsNavList.tsx` — Kategorien- und Sektionsliste
    - Filtert Sektionen basierend auf `searchQuery` (case-insensitive Label-Matching)
    - Gruppiert gefilterte Ergebnisse unter Kategorie-Überschriften
    - Zeigt "Keine Ergebnisse"-Meldung bei leerem Filter
    - Deaktiviert Vault-Sektionen wenn `selectedVaultId === null`
    - Blendet Admin-Sektionen aus wenn `isAdmin === false`
    - _Requirements: 1.4, 3.3, 3.4, 4.2, 9.2, 9.3, 9.5_

  - [x] 4.5 Erstelle `frontend/src/components/settings/SettingsContent.tsx` — Inhaltsbereich
    - `role="main"` Container
    - Rendert die aktive eingebettete Komponente basierend auf `state.section`
    - Übergibt `apiClient` (Singleton) und ggf. `vaultId` als Props
    - Fokus-Management: Setzt Fokus auf `<h2 tabindex="-1">` bei Sektionswechsel
    - Mapping: section → Komponente (ProfilePage, ChangePasswordPage, SessionsPage, McpTokensPage, AccountDeletionSection, SyncConfigPage, PluginManagementPage, AdminConfigPage, AdminUsersPage, AdminVaultsPage, FeatureTogglesSection)
    - _Requirements: 1.5, 2.2–2.7, 3.5, 3.6, 4.3–4.6, 7.1, 7.2, 7.4, 8.3_

  - [x] 4.6 Erstelle `frontend/src/components/settings/VaultSelector.tsx` — Vault-Auswahl-Dropdown
    - Dropdown mit allen Vaults des aktuellen Benutzers
    - Dispatch `SELECT_VAULT` bei Auswahl
    - Hinweis-Text wenn kein Vault gewählt ("Bitte Vault auswählen")
    - Vault-Name als Kontextanzeige oberhalb der Vault-Sektionen wenn gewählt
    - _Requirements: 3.2, 3.3, 3.4, 3.7_

- [x] 5. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 6. Komponentenextraktion und Integration
  - [x] 6.1 Extrahiere `AccountDeletionSection` aus bestehender Account-Lösch-Logik
    - Erstelle `frontend/src/components/settings/AccountDeletionSection.tsx`
    - Wiederverwendet das bestehende Lösch-Formular (Passwortbestätigung, zweistufige Bestätigung)
    - Props: `{ apiClient: IApiClient }`
    - _Requirements: 2.7_

  - [x] 6.2 Extrahiere `FeatureTogglesSection` aus bestehender Admin-Feature-UI
    - Erstelle `frontend/src/components/settings/FeatureTogglesSection.tsx`
    - Wrapper um die bestehende Feature-Toggle-Verwaltung ohne äußeren Layout-Container
    - Props: `{ apiClient: IApiClient }`
    - _Requirements: 4.6_

  - [x] 6.3 Integriere SettingsPanel in die App-Hierarchie
    - Füge `SettingsPanel`-Rendering in `App.tsx` hinzu (conditional, gesteuert durch App-State)
    - Registriere `Ctrl+,` globalen Shortcut zum Öffnen
    - Stelle sicher, dass bestehende Routen weiterhin funktionieren (kein Route-Entfernen)
    - Markiere bestehende Routen intern als deprecated (Kommentar)
    - _Requirements: 5.4, 7.5_

  - [x] 6.4 Responsive Layout implementieren (CSS Container Query)
    - `@container`-Rule mit 700px Schwellenwert in `SettingsPanel.css`
    - ≥700px: Sidebar permanent links, Content rechts
    - <700px: Navigation als einklappbares Menü oberhalb des Contents
    - Toggle-Button für Mobile-Nav mit sichtbarem Label/Icon
    - Menü klappt automatisch ein bei Sektionsauswahl
    - Navigation-Stand bleibt bei Breiten-Wechsel erhalten
    - _Requirements: 6.1, 6.2, 6.3, 6.6_

- [x] 7. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 8. Komponenten-Tests
  - [x] 8.1 Erstelle `frontend/src/components/settings/SettingsPanel.test.tsx` — Komponenten-Tests
    - Panel rendert Sidebar + Content
    - Korrekte Komponente pro Sektion (Section → Component Mapping)
    - Tastaturnavigation (Tab, Pfeiltasten, Enter)
    - ARIA-Attribute (role="navigation", role="main", aria-current="page")
    - Fokus-Management bei Sektionswechsel (h2 bekommt Fokus)
    - Responsive Verhalten (Container-Breite-Mock)
    - Vault-Selektor Interaktion
    - Suchfeld mit Debounce
    - Ctrl+, Shortcut
    - Admin-Sektionen nicht sichtbar für Nicht-Admins
    - _Requirements: 1.1, 1.5, 6.1, 6.2, 8.1–8.4, 9.1, 9.2_

  - [ ]* 8.2 Property-Test: Vault section interactivity requires vault selection
    - **Property 4: Vault section interactivity requires vault selection**
    - Für beliebige States in category='vault': Vault-Sektionen sind interaktiv iff selectedVaultId !== null
    - `fc.assert(fc.property(...), { numRuns: 100 })`
    - **Validates: Requirements 3.3, 3.4**

- [x] 9. Final Checkpoint — Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Die bestehenden Komponenten (ProfilePage, SessionsPage, etc.) werden NICHT modifiziert — nur eingebettet
- `fast-check` muss als Dev-Dependency installiert werden falls nicht vorhanden
- Alle CSS-Werte müssen CSS Custom Properties aus `index.css` verwenden — keine hartcodierten Farben
- Dark Mode: `:root[data-theme="dark"]` UND `@media (prefers-color-scheme: dark)` berücksichtigen

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11"] },
    { "id": 3, "tasks": ["4.1", "4.3", "4.6", "6.1", "6.2"] },
    { "id": 4, "tasks": ["4.2", "4.4", "4.5"] },
    { "id": 5, "tasks": ["6.3", "6.4"] },
    { "id": 6, "tasks": ["8.1", "8.2"] }
  ]
}
```
