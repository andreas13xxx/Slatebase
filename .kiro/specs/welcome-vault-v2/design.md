# Design Document — Welcome Vault v2

## Übersicht

Dieses Design beschreibt zwei zusammenhängende Änderungen:

1. **Content-Erweiterung**: Die bestehenden Welcome-Vault-Templates (DE/EN) werden von ~11 Dateien auf ~35–45 Dateien + Screenshots ausgebaut
2. **Nachträgliches Hinzufügen**: Ein neuer API-Endpoint + UI-Eintrag ermöglicht es Nutzern, den Welcome-Vault jederzeit selbst zu erstellen

---

## 1. Architektur-Änderungen

### 1.1 Neuer API-Endpoint

```
POST /api/v1/welcome-vault
```

**Route-Datei:** `backend/src/api/welcomeVaultRoutes.ts`

```typescript
// Route: POST /api/v1/welcome-vault
// Auth: Session-Token (authMiddleware)
// CSRF: Ja (csrfMiddleware)
// Body: leer (Sprache aus User-Profil)
// Response: 201 { vaultId, vaultName } | 403 { code, message, timestamp } | 500
```

**Controller-Logik:**

1. User-ID aus Session extrahieren
2. `preferredLanguage` aus User-Profil lesen (Fallback: `'de'`)
3. Prüfen ob Feature-Toggle `welcome-vault` aktiv → sonst 403
4. Vault-Name bestimmen: `config.welcomeVault.name[language]`
5. Namens-Kollision prüfen: Falls Vault mit gleichem Namen existiert → Suffix `(2)`, `(3)`, etc.
6. `welcomeVaultService.createWelcomeVault(userId, language)` aufrufen
7. Bei Erfolg: Link-Index-Rebuild triggern, 201 zurückgeben
8. Bei Fehler: 500 mit generischer Meldung

### 1.2 WelcomeVaultService-Erweiterung

Der bestehende `WelcomeVaultService` bleibt weitgehend unverändert. Änderungen:

```typescript
// Neue Methode für Namens-Deduplication
interface IWelcomeVaultService {
  createWelcomeVault(userId: string, language: WelcomeVaultLanguage): Promise<WelcomeVaultResult | undefined>
  // NEU: Erstellt mit automatischer Namens-Deduplication
  createWelcomeVaultForUser(userId: string): Promise<WelcomeVaultResult | undefined>
}
```

**`createWelcomeVaultForUser(userId)`:**
- Liest `preferredLanguage` aus UserService
- Ermittelt Vault-Name mit Suffix-Deduplication (prüft existierende Vault-Namen des Users)
- Delegiert an `createWelcomeVault` mit dedupliziertem Namen
- Gibt Result zurück (oder undefined bei Feature-Toggle-Off/Fehler)

**Namens-Deduplication-Algorithmus:**
```
baseName = config.welcomeVault.name[language]  // z.B. "Willkommen"
existingNames = userVaults.map(v => v.name)
if baseName not in existingNames → use baseName
else try baseName + " (2)", " (3)", ... bis max " (99)"
```

### 1.3 Abhängigkeit: UserService

`WelcomeVaultService` braucht Zugriff auf `preferredLanguage` des Users. Zwei Optionen:

**Gewählt: Parameter-Injection in Route**
- Die Route liest `preferredLanguage` aus dem User-Objekt (bereits via AuthMiddleware im Context)
- Der Service erhält die Sprache als Parameter (wie bisher)
- Kein neuer Dependency-Link nötig

### 1.4 Registrierung im Composition Root

```typescript
// backend/src/index.ts — bereits vorhanden:
// const welcomeVaultService = new WelcomeVaultService(...)

// NEU: welcomeVaultRoutes registrieren
import { createWelcomeVaultRoutes } from './api/welcomeVaultRoutes.js'

app.route('/api/v1', createWelcomeVaultRoutes(welcomeVaultService, userService, linkIndexService, featureToggleService))
```

---

## 2. Frontend-Änderungen

### 2.1 Settings-Integration

**Ort:** Einstellungen → Konto-Bereich (`AccountSection` oder neuer Abschnitt)

```tsx
// In der Settings Konto-Sektion:
<button onClick={handleCreateWelcomeVault} disabled={loading}>
  {t('settings.account.createWelcomeVault')}
</button>
```

**Verhalten:**
- Button: "Anleitungs-Vault erstellen" / "Create tutorial vault"
- Klick → `POST /api/v1/welcome-vault`
- Loading-State während Request
- Erfolg → Toast "Anleitungs-Vault wurde erstellt" + Vault-Tree refreshen
- Fehler (403) → Toast "Feature ist deaktiviert"
- Fehler (500) → Toast "Fehler beim Erstellen"

### 2.2 Command Palette Integration

Neuer Built-in-Command in `CommandPaletteContainer.tsx`:

```typescript
{
  id: 'create-welcome-vault',
  name: t('commands.createWelcomeVault'),  // "Anleitungs-Vault erstellen"
  category: 'vault',
  execute: () => handleCreateWelcomeVault()
}
```

### 2.3 IApiClient-Erweiterung

```typescript
interface IApiClient {
  // ... bestehende Methoden ...
  
  /** Creates a welcome vault for the current user */
  createWelcomeVault(): Promise<{ vaultId: string; vaultName: string }>
}
```

### 2.4 i18n-Keys

```typescript
// de.ts
settings: {
  account: {
    createWelcomeVault: 'Anleitungs-Vault erstellen',
    createWelcomeVaultDescription: 'Erstellt einen Vault mit vollständiger Slatebase-Anleitung und Beispielen.',
    welcomeVaultCreated: 'Anleitungs-Vault "{name}" wurde erstellt.',
    welcomeVaultFeatureDisabled: 'Das Anleitungs-Vault-Feature ist deaktiviert.',
    welcomeVaultError: 'Fehler beim Erstellen des Anleitungs-Vaults.',
  }
},
commands: {
  createWelcomeVault: 'Anleitungs-Vault erstellen',
}

// en.ts
settings: {
  account: {
    createWelcomeVault: 'Create tutorial vault',
    createWelcomeVaultDescription: 'Creates a vault with a complete Slatebase guide and examples.',
    welcomeVaultCreated: 'Tutorial vault "{name}" has been created.',
    welcomeVaultFeatureDisabled: 'The tutorial vault feature is disabled.',
    welcomeVaultError: 'Failed to create tutorial vault.',
  }
},
commands: {
  createWelcomeVault: 'Create tutorial vault',
}
```

---

## 3. Template-Inhalt — Ordnerstruktur

### 3.1 Deutsche Variante (`data/templates/welcome-vault/`)

```
Start hier.md                          — Einstiegsseite mit Übersicht
_meta.md                               — Version/Datum Metadaten

Grundlagen/
├── Markdown Syntax.md                 — Formatierung, Listen, Tabellen, Code
├── Navigation und Tabs.md             — Tabs, Split-View, Tab-Verwaltung
├── Datei-Explorer.md                  — Erstellen, Umbenennen, Verschieben, DnD
├── Editor und Viewer.md               — Edit/View-Modi, Toolbar, Auto-Save
└── Erste Schritte.md                  — Inhaltsverzeichnis Grundlagen

Features/
├── Wikilinks.md                       — Syntax, Pfade, Aliase, Heading-Links, Block-Refs
├── Embeds.md                          — Bilder, PDFs, Notizen, Größenangaben
├── Callouts.md                        — Alle Typen mit Beispielen
├── Tags und Properties.md             — Tags, Frontmatter, YAML
├── Suche und Ersetzen.md              — Volltextsuche, Regex, Multi-Vault
├── Knowledge Graph.md                 — Visualisierung, Navigation, Konfiguration
├── Context Panel.md                   — Outline, Links, Tags, Properties, Splits
├── Mermaid Diagramme.md               — Flowchart, Sequenz, Gantt, Pie, etc.
├── Vorlagen und Daily Notes.md        — Templates, tägliche Notizen
├── Papierkorb und Versionen.md        — Soft-Delete, Restore, Diff, Cleanup
├── Canvas.md                          — Nodes, Edges, Gruppen, Zoom/Pan
├── Command Palette.md                 — Ctrl+P, Befehle, Suche
├── Vault-Verwaltung.md                — Erstellen, Löschen, Teilen, Statistiken
├── Einstellungen.md                   — Alle Kategorien erklärt
├── Chat.md                            — Konversationen, Nachrichten, Benachrichtigungen
├── Sync.md                            — Konfiguration, Status, Konflikte (⚠️ experimentell)
└── Übersicht.md                       — Inhaltsverzeichnis Features

Fortgeschritten/
├── Regex Suche.md                     — Regex-Patterns, Capture Groups
├── Canvas Workflows.md                — Komplexe Canvas-Nutzung
├── Tastenkürzel anpassen.md           — Keybindings konfigurieren
├── Vault Sync einrichten.md           — CouchDB Setup, E2E-Verschlüsselung
├── MCP Context Server.md              — AI-Integration, Token-Verwaltung
├── Obsidian Plugins.md                — Plugin-Installation, Kompatibilität
└── Übersicht.md                       — Inhaltsverzeichnis Fortgeschritten

Praxis/
├── Übung 1 - Erste Notiz.md          — Datei erstellen, formatieren
├── Übung 2 - Verlinkung.md           — Wikilinks erstellen, Graph erkunden
├── Übung 3 - Projekt organisieren.md  — Ordner, Tags, Templates nutzen
├── Übung 4 - Suche meistern.md       — Suche, Regex, Ersetzen
├── Übung 5 - Canvas erstellen.md      — Brainstorming-Board aufbauen
├── Beispielprojekt/
│   ├── Projektplan.md
│   ├── Meeting-Notizen.md
│   └── Recherche.md
└── Übersicht.md                       — Inhaltsverzeichnis Praxis

Screenshots/
├── gesamtansicht.png
├── datei-explorer.png
├── datei-explorer-kontextmenu.png
├── editor-toolbar.png
├── viewer-formatiert.png
├── tabs-mehrere.png
├── knowledge-graph.png
├── context-panel.png
├── suche-ergebnisse.png
├── settings-panel.png
├── canvas-nodes.png
├── command-palette.png
├── mermaid-diagramm.png
├── callout-typen.png
├── dark-mode.png
├── light-mode.png
├── wikilink-autocomplete.png
├── papierkorb.png
├── version-diff.png
├── sync-status.png
├── chat-ansicht.png
└── template-auswahl.png

Vorlagen/
├── Tägliche Notiz.md                  — Template für Daily Notes
├── Meeting-Protokoll.md               — Template für Meetings
├── Projektübersicht.md                — Template für Projekte
└── Leseliste.md                       — Template für Bücher/Artikel
```

### 3.2 Englische Variante (`data/templates/welcome-vault-en/`)

Identische Struktur mit übersetzten Datei- und Ordnernamen. Screenshots werden geteilt (identische Bilder, da UI-Labels größtenteils Deutsch sind — alternativ eigene EN-Screenshots falls UI-Sprache umschaltbar wird).

### 3.3 Screenshot-Erstellung

Screenshots werden **manuell erstellt** und als PNG-Dateien im Repository committed. Sie sind Teil der Template-Verzeichnisse.

**Konventionen:**
- Format: PNG, max 800px Breite
- Benennung: kebab-case, beschreibend
- Theme: Dark Mode (Standard)
- Inhalt: Realistische Beispieldaten (keine leeren Views)
- Annotationen: Keine Pfeile/Markierungen im Bild — Erklärung im Text

---

## 4. Namens-Deduplication

### Algorithmus

```typescript
function deduplicateVaultName(baseName: string, existingNames: string[]): string {
  if (!existingNames.includes(baseName)) {
    return baseName
  }
  
  for (let i = 2; i <= 99; i++) {
    const candidate = `${baseName} (${i})`
    if (!existingNames.includes(candidate)) {
      return candidate
    }
  }
  
  // Fallback: Timestamp-Suffix
  return `${baseName} (${Date.now()})`
}
```

### Wo wird dedupliziert?

Im Route-Handler (`welcomeVaultRoutes.ts`), bevor der Service aufgerufen wird. Der Service selbst delegiert an `VaultService.createVault(name, userId)` — dort existiert bereits eine Prüfung auf doppelte Vault-Namen (die einen Fehler wirft). Durch die Vorab-Deduplication wird dieser Fehler vermieden.

---

## 5. Link-Index-Rebuild nach Erstellung

Nach erfolgreicher Vault-Erstellung muss der Link-Index für den neuen Vault aufgebaut werden. Dies geschieht wie bei der bestehenden automatischen Erstellung:

```typescript
// In welcomeVaultRoutes.ts nach erfolgreicher Erstellung:
if (result) {
  // Fire-and-forget: Index wird asynchron aufgebaut
  linkIndexService.rebuildIndex(result.vaultId, result.storagePath).catch(err => {
    logger.warn('Failed to rebuild link index for welcome vault', { error: err })
  })
}
```

---

## 6. Betroffene Dateien

### Backend (neu)
- `src/api/welcomeVaultRoutes.ts` — Neuer Route-Handler

### Backend (Änderungen)
- `src/welcome-vault/index.ts` — Ggf. minimale Anpassung (Namens-Deduplication liegt in der Route)
- `src/index.ts` — Route registrieren

### Frontend (Änderungen)
- `src/api/index.ts` — `createWelcomeVault()` Methode
- `src/components/settings/AccountSection.tsx` oder neuer Abschnitt — Button
- `src/components/CommandPaletteContainer.tsx` — Neuer Command
- `src/state/index.ts` — Ggf. Action für Vault-Tree-Refresh nach Erstellung
- i18n-Dateien (de.ts, en.ts)

### Templates (komplett überarbeitet)
- `data/templates/welcome-vault/` — Alle Dateien ersetzen
- `data/templates/welcome-vault-en/` — Alle Dateien ersetzen

---

## 7. Sicherheitsüberlegungen

- **Rate-Limiting**: Der Endpoint `POST /api/v1/welcome-vault` erstellt einen vollständigen Vault mit vielen Dateien. Rate-Limit: Max 3 Aufrufe pro Stunde pro User (verhindert DoS durch massenhafte Vault-Erstellung).
- **Keine Admin-Aktion**: Der Endpoint erstellt den Vault immer für den anfragenden User (nicht für beliebige User). Kein `targetUserId`-Parameter.
- **Feature-Toggle**: 403 bei deaktiviertem Toggle verhindert Nutzung wenn Admin es abschaltet.
- **Disk-Space**: ~5–10 MB pro Welcome-Vault (inkl. Screenshots). Bei 100 Nutzern = ~1 GB. Für Self-Hosted akzeptabel.

---

## 8. Offene Entscheidungen

| Frage | Empfehlung | Grund |
|-------|-----------|-------|
| Screenshots DE + EN getrennt? | Erst nur DE-Screenshots für beide | UI ist Deutsch, spart 50% Speicher. Wenn i18n-Switch kommt → eigene EN-Screenshots |
| Callout-Typ für Übungen? | `> [!todo]` | Existiert bereits im Callout-System, visuell passend (Checkbox-Icon) |
| `_meta.md` mit Underscore sichtbar? | Ja | Underscore-Prefix ist normaler Content (siehe File Visibility Rules), gibt dem Nutzer Kontext |
| Rate-Limit-Implementierung | In-Memory Map (wie Login) | Einfach, Reset bei Restart OK, kein Persistence nötig |

