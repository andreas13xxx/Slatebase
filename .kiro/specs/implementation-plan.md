# Implementierungsplan — Slatebase Ausstehende Features

**Problem Statement:** Die Slatebase-Overview-Spec definiert 13 Anforderungsbereiche. Die Kernfeatures sind umgesetzt (Vaults, Editor, Auth, Chat, Sync, MCP, Graph, Search, Realtime, Plugins, Feature Toggles). Es verbleiben 9 ausstehende Features in unterschiedlichen Reifegraden — von trivial (Login Version Display) bis architektonisch komplex (Collaborative Editing).

**Strategie:** Hybrid — Quick Wins direkt umsetzen, komplexe Features erst vollständig spezifizieren.

---

## Tier 1: Quick Wins (direkt umsetzbar, keine zusätzliche Spec nötig)

---

### Task 1: Login Version Display ✅ ERLEDIGT

Scope: ~1h. Backend-Endpoint existiert bereits (`GET /api/v1/version`, public). Frontend-Anpassung minimal.

- ✅ Implementiere `getVersion(): Promise<{ version: string }>` in `IApiClient` und `ApiClient`
- ✅ Erweitere `LoginPage.tsx`: Fetch Version beim Mount (AbortController), zeige unterhalb des Submit-Buttons an
- ✅ Formatierung: `v1.2.3` normal, `dev` wenn Version = `development`
- ✅ Styling: `--text-xs`, `opacity: 0.6`, zentriert
- ✅ Fehlerfall: Silently ignore (keine Anzeige)
- ✅ Test: Unit-Test für LoginPage mit gemocktem getVersion

**Demo:** Auf dem Login-Screen wird die installierte Version angezeigt.

---

### Task 2: Realtime Cleanup (Code-Bereinigung) ✅ ERLEDIGT

Scope: ~3–4h. Entfernt toten Code und vereinfacht die Architektur.

**Backend:** ✅

- ✅ Entferne `featureRegistry.register({ name: 'realtime', ... })` aus `src/index.ts`
- ✅ Entferne `createFeatureGuard('realtime')` vom SSE-Endpoint (Session-Auth bleibt)
- ✅ Entferne `server:feature-disabled` Event-Publishing bei Toggle-Änderung
- ✅ Entferne `onChange`-Listener für `realtime`-Toggle
- ✅ Entferne `featureToggleService.isEnabled('realtime')` Check im HTTP-Handler
- ✅ Entferne `featureGuard` aus `SseRouteDeps` Interface
- ✅ Entferne toten `let connectionManager` Mutable-Reference

**Frontend:** ✅

- ✅ Entferne `'fallback'` aus `ConnectionStatus` Type (→ `'connected' | 'connecting' | 'disconnected'`)
- ✅ Entferne `featureEnabled` Prop von `RealtimeProviderProps` und `RealtimeInner`
- ✅ Ändere EventSource-Hook: `enabled: token !== null` (ohne Feature-Check)
- ✅ Entferne `onPollingEnabled`/`onPollingDisabled` Callbacks
- ✅ Entferne `server:feature-disabled` Event-Handler
- ✅ Ersetze `fallback`-Transition-Logik: Bei Reconnect nach Disconnect → Full Refresh
- ✅ Passe ConnectionIndicator an: `visible` Prop entfernt, immer sichtbar
- ✅ Aktualisiere RealtimeBridge in `App.tsx` (kein `isEnabled('realtime')` mehr)
- ✅ Entferne `--connection-fallback` CSS-Token

**Tests:** ✅

- ✅ EventSource Mock in `test-setup.ts` hinzugefügt (jsdom hat kein natives EventSource)
- ✅ `getVersion` zu App.test.tsx MockApiClient hinzugefügt
- ✅ Alle Tests grün (Frontend: 1179, Backend: 1238)

**Demo:** SSE verbindet immer wenn authentifiziert. Kein Toggle mehr in Admin-UI. Reconnect funktioniert ohne Fallback.

---

### Task 3: Welcome Vault

Scope: ~3–4h. Neues Modul, aber begrenzte Komplexität.

**Backend:**

- Erstelle `data/templates/welcome-vault/` Verzeichnis mit Tutorial-Inhalt:
  - `Start hier.md` (Einstieg mit Wikilinks zu allen anderen)
  - `Projekte/Beispielprojekt.md` (Tags, Callouts)
  - `Referenz/Markdown-Syntax.md` (Embeds, Code-Blöcke)
  - `Referenz/Verlinkungen.md` (Wikilinks-Demo)
  - `Täglich/` (leerer Ordner für Daily Notes)
  - Slatebase-Logo als Bild-Embed-Demo
  - 5–10 Dateien insgesamt, alle auf Deutsch
- Erweitere `config/default.json`: `welcomeVault.name: "Willkommen"`, `welcomeVault.enabled: true`
- Registriere Feature-Toggle: `welcome-vault` (hot, default: true)
- Implementiere Welcome-Vault-Erstellung in `UserService.createUser()`:
  - Nach erfolgreicher User-Erstellung: prüfe Toggle, kopiere Template-Dir, erstelle Vault via VaultService
  - Fehler loggen aber nicht propagieren (Account-Erstellung darf nicht fehlschlagen)
- Tests: Unit-Test für Erstellung, fehlende Template-Dir, deaktivierter Toggle

**Demo:** Neuer Benutzer bekommt automatisch einen "Willkommen"-Vault mit Tutorial-Inhalten.

---

### Task 4: Mermaid Rendering

Scope: ~4–5h. Frontend-only, baut auf ViewMode auf.

- Erstelle `frontend/src/components/MermaidRenderer.tsx` + `MermaidRenderer.css`:
  - Dynamic `import('mermaid')` — nur wenn ein Mermaid-Block vorhanden ist
  - Lade-Indikator ("Diagramm wird geladen…") als Platzhalter
  - Dark/Light Theme: `data-theme`-Attribut beobachten, Mermaid-Theme `default`/`dark` umschalten
  - Re-Render bei Theme-Wechsel (MutationObserver auf `<html data-theme>`)
  - Unique ID pro Diagramm (`mermaid-${crypto.randomUUID()}`)
  - Timeout: 5s → Abbruch mit Fallback-View
  - `securityLevel: 'strict'`
  - Error-Handling: Fehlermeldung + roher Quelltext in `<pre><code>`
  - Container: `.view-mode-mermaid`, responsive SVG (`max-width: 100%`, `overflow: auto`)
- Erweitere `renderCodeBlock()` in `ViewMode.tsx`:
  - Prüfe `lang?.toLowerCase() === 'mermaid'` VOR hljs
  - Render `MermaidRenderer` statt Code-Block
- CSS: Design Tokens für Container, Error, Loading
- Tests: Unit-Test für Erkennung (case-insensitive), Error-Fallback, kein Rendering für andere langs
- Dependency: `mermaid` als pinned version installieren

**Demo:** Mermaid-Code-Blöcke werden als interaktive SVG-Diagramme gerendert, mit Dark-Mode-Support.

---

## Tier 2: UX-Verbesserungen (teilweise Spec-Vervollständigung nötig)

---

### Task 5: Unified Settings — Implementierung ✅ ERLEDIGT

Scope: ~8–12h. Implementiert.

- ✅ SettingsProvider mit useReducer + createSettingsReducer(isAdmin) Factory
- ✅ SettingsRegistry (12 Sektionsdefinitionen, 3 Kategorien)
- ✅ SettingsPanel mit CSS Container Query (700px responsive threshold)
- ✅ SettingsSidebar (Search + NavList)
- ✅ SettingsContent (Section → Component Mapping, Fokus-Management)
- ✅ sessionStorage-Persistenz mit Validierung
- ✅ Ctrl+, Shortcut + Toolbar-Button (Zahnrad)
- ✅ ARIA landmarks, Tastaturnavigation (Pfeiltasten, Enter)
- ✅ Suche mit 150ms Debounce
- ✅ ProfilePage mode="profile-only", ChangePasswordPage embedded
- ✅ AdminConfigPage hideFeatureToggles
- ✅ ServerRestartSection als eigene Admin-Sektion
- ✅ AccountDeletionSection + FeatureTogglesSection extrahiert
- ✅ Vault-Einstellungen nutzen aktives Vault aus AppState
- ✅ 116 Unit/Integration-Tests, TypeScript clean

**Demo:** Alle Einstellungen in einem kohärenten Panel. Tastatur-navigierbar, responsive, suchbar.

---

### Task 6: Knowledge Graph v2 — Design + Tasks erstellen, dann implementieren

Scope: ~6–8h Design, ~12–16h Implementierung.

**Vorarbeit (Spec):**

- Design-Dokument erstellen (Backend LinkIndex-Erweiterung, API-Erweiterung, Frontend GraphSettings-Panel)
- Task-Breakdown erstellen

**Implementierungs-Zusammenfassung:**

- Backend: LinkIndexService um Tags + Properties erweitern (Index-Schema erweitern)
- Backend: Graph-API um `includeTags`, `includeProperties` Query-Params erweitern
- Backend: Neuer Endpoint `GET /graph/meta` (alle Tags/Properties mit Häufigkeit)
- Frontend: GraphSettingsPanel (Farben per Color-Picker, Layout-Slider, Toggles für Tags/Properties)
- Frontend: GraphView um Tag-Nodes und Property-Nodes erweitern
- localStorage-Persistenz für Graph-Config

**Demo:** Knowledge Graph mit konfigurierbaren Farben/Layout, optional Tags und Properties als Knoten.

---

### Task 7: Sync Conflict Resolution — Design + Tasks erstellen, dann implementieren

Scope: ~4h Design, ~10–14h Implementierung.

**Vorarbeit (Spec):**

- Design-Dokument (Conflict-Wizard UI-Flow, Diff-Algorithmus, Batch-Processing, Auto-Resolution State)
- Task-Breakdown

**Implementierungs-Zusammenfassung:**

- Backend: SyncService um Konfliktkategorisierung erweitern
- Backend: Endpoints für Merge-Preview und Batch-Auflösung
- Frontend: ConflictWizard-Komponente (mehrstufig: Übersicht → Detail → Auflösung)
- Frontend: DiffView-Komponente (Side-by-Side + Unified, Toggle in localStorage)
- Frontend: Batch-Auflösung mit Bestätigung
- Frontend: Auto-Resolution-Konfiguration (pro Kategorie)

**Demo:** Geführter Wizard für Sync-Konflikte mit Diff-Ansicht, Batch-Aktionen und Auto-Resolution.

---

## Tier 3: Technisch ambitionierte Features (Spec-first zwingend)

---

### Task 8: Server-Side Plugins — Phasenweise Implementierung

Scope: ~40–60h. Task-Liste existiert bereits (7 Phasen). Design-Dokument muss noch erstellt werden.

**Vorarbeit:**

- Design-Dokument erstellen (Sandbox-Architektur mit `vm`, Shim-Interfaces, Settings-Bridge-Protokoll)

**Phasen (aus bestehender Tasks-Datei):**

1. Plugin-Klassifikation (statische Bundle-Analyse)
2. Server-Side Sandbox (vm.createContext, Memory/CPU Limits)
3. Plugin Runtime Manager (Lifecycle, Timer-Tracking)
4. API & Logs (Runtime-Status, Start/Stop, Log-Abruf)
5. Settings-Bridge (DOM-Serialisierung → Frontend)
6. Frontend-Integration (Status-Anzeige, Start/Stop UI)
7. Sicherheit & Hardening (Allowlist, Monitoring, Audit)

**Demo:** Server-Plugins mit Node.js-APIs können geladen, gestartet, gestoppt werden. Settings-UI wird gebrückt.

---

### Task 9: Collaborative Editing — Design erstellen

Scope: ~8h Design. Implementierung: ~60–80h (separates Projekt).

**Vorarbeit (zwingend):**

- Technologie-Entscheidung: OT vs. CRDT (Yjs? ShareDB?)
- WebSocket-Integration neben bestehendem SSE
- Design-Dokument mit:
  - Session-Management-Architektur
  - OT/CRDT-Algorithmus und Bibliothekswahl
  - Cursor-Presence-Protokoll
  - Auto-Save-Integration mit bestehendem VaultService
  - Netzwerk-Resilienz-Strategie

**Empfehlung:** Feature als eigenständiges Milestone nach den anderen Features planen. Benötigt signifikante Architektur-Entscheidungen (WebSocket-Layer, CRDT-Bibliothek, Editor-Umbau).

---

## Zusammenfassung der Reihenfolge

```
Phase A: Quick Wins (direkt)
├── Task 1: Login Version Display         (~1h)
├── Task 2: Realtime Cleanup              (~3–4h)
├── Task 3: Welcome Vault                 (~3–4h)
└── Task 4: Mermaid Rendering             (~4–5h)

Phase B: UX-Verbesserungen
├── Task 5: Unified Settings              (~8–12h, ✅ Fertig)
├── Task 6: Knowledge Graph v2            (~6–8h Design + ~12–16h Impl.)
└── Task 7: Sync Conflict Resolution      (~4h Design + ~10–14h Impl.)

Phase C: Ambitioniert (langfristig)
├── Task 8: Server-Side Plugins           (~8h Design + ~40–60h Impl.)
└── Task 9: Collaborative Editing         (~8h Design + ~60–80h Impl.)
```

---

## Gesamtaufwand (Schätzung)

| Phase | Design | Implementierung | Gesamt |
|-------|--------|-----------------|--------|
| A: Quick Wins | — | ~11–14h | ~11–14h |
| B: UX-Verbesserungen | ~10–12h | ~30–42h | ~40–54h |
| C: Ambitioniert | ~16h | ~100–140h | ~116–156h |
| **Summe** | **~26–28h** | **~141–196h** | **~167–224h** |
