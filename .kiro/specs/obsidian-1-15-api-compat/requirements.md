# Requirements Document

## Introduction

Obsidian 1.14 und 1.15 haben mehrere Plugin-API- und Verhaltensänderungen eingeführt, die Slatebase's Compat-Layer (`frontend/src/plugins/compat/`) noch nicht abbildet. Quelle: Obsidian-Changelog 1.14.0–1.15.1 (https://obsidian.md/changelog/). Stand Slatebase: `OBSIDIAN_API_VERSION = '1.13.2'`.

Ziel ist, dass Plugins, die gegen 1.15 entwickelt wurden, in Slatebase nicht brechen und die neuen Hilfsfunktionen vorfinden. Features, die nur für Desktop-Electron oder Mobile sinnvoll sind, bleiben bewusst draußen (siehe Non-Goals).

## Glossary

- **Compat_Layer**: `frontend/src/plugins/compat/` — Emulation der Obsidian-API.
- **FileManager_Shim**: `shims/file-manager-shim.ts`.
- **Token_Class_Prop**: `editor/token-class-node-prop.ts` (Polyfill für `tokenClassNodeProp`).
- **Declarative_Settings_Renderer**: `declarative-settings-renderer.ts`.
- **Pele**: Obsidians neue Mermaid-Render-Bibliothek ab 1.15 (`window.pele`).

## Non-Goals

- Pele selbst einbinden. Slatebase behält das echte `mermaid`-Paket; Pele-Namen werden nur als Alias angeboten.
- `--mermaid-*`-CSS-Variablen und `.pele-*`-Klassen: Die exakten Namen sind im Changelog nicht aufgelistet und dürfen nicht geraten werden.
- `setTimeout`/`setInterval` in versteckten Fenstern (Electron-Verhalten, im Browser nicht steuerbar), CLI-`eval`, `activeWindow`-Timer, Popout-Fenster, `slidingSidebar`/Mobile-Klassen, Electron-Version, neue `--tooltip-*`/`--notice-*`/`--hotkey*`/`--tab-*`-Variablen (Namen unbekannt).
- Entfernen der `Array#contains`/`String#contains`-Polyfills (deprecated, aber Plugins nutzen sie weiter).

## Requirements

### Requirement 1: FileManager-Löschen meldet Misserfolg

**User Story:** Als Plugin-Entwickler möchte ich erkennen, ob eine Datei wirklich im Papierkorb gelandet ist.

#### Acceptance Criteria

1. THE FileManager_Shim SHALL `trashFile(file)` als `Promise<boolean>` liefern: `true` bei Erfolg, `false` wenn `vault.trash` fehlschlägt (Fehler wird per `console.warn` geloggt, nicht geworfen).
2. THE FileManager_Shim SHALL `promptForDeletion(file)` anbieten, das nach Bestätigung durch den Nutzer `trashFile` nutzt und `false` liefert, wenn der Nutzer abbricht oder das Trashen scheitert.
3. THE bestehenden Methoden `promptForFileDeletion` und `promptForFolderDeletion` SHALL unverändert funktionieren.
4. THE Proxy-Whitelist (`emulatedProperties`) SHALL `promptForDeletion` enthalten, sodass kein Proxy-Gap-Eintrag entsteht.

### Requirement 2: Mermaid-Fassade mit Pele-Alias

**User Story:** Als Plugin-Entwickler, der `window.mermaid` oder `loadMermaid()` nutzt, möchte ich dieselbe Oberfläche wie in 1.15 vorfinden.

#### Acceptance Criteria

1. WHEN `loadMermaid()` auflöst, THE Ergebnis SHALL `initialize()`, `render()`, `parse()`, `mermaidAPI.getConfig()` und `mermaidAPI.setConfig()` bereitstellen.
2. WHEN `loadMermaid()` aufgelöst wurde, THE Compat_Layer SHALL `window.mermaid` und `window.pele` auf dasselbe Objekt setzen.
3. IF `mermaid` nicht geladen werden kann, THEN SHALL `loadMermaid()` mit einem Fehler ablehnen, ohne `window.mermaid`/`window.pele` zu setzen.
4. THE Slatebase-eigene Diagramm-Darstellung (`MermaidRenderer.tsx`, Live Preview) SHALL unverändert bleiben.

### Requirement 3: `loadPixi()`

**User Story:** Als Plugin-Entwickler möchte ich `loadPixi()` aufrufen können, ohne dass das Plugin abstürzt.

#### Acceptance Criteria

1. THE Compat_Layer SHALL `obsidian.loadPixi()` exportieren.
2. WHILE Slatebase kein PIXI mitliefert, SHALL `loadPixi()` mit `null` auflösen und über `warnNoOp` auf die fehlende Funktion hinweisen (gleiches Muster wie `loadPrism`/`loadPdfJs`).

### Requirement 4: Schließende Formatierungs-Tokens

**User Story:** Als Plugin-Entwickler (z. B. Dataview-Stil) möchte ich schließende Markdown-Marker im Syntaxbaum erkennen.

#### Acceptance Criteria

1. BEFORE Implementierung SHALL das exakte Obsidian-Verhalten (Klassennamen für öffnende vs. schließende Tokens) gegen die offizielle Quelle verifiziert und in `design.md` festgehalten werden.
2. IF die Unterscheidung öffnend/schließend mit `tokenClassNodeProp` (eine Eigenschaft pro NodeType) technisch machbar ist, THEN SHALL Token_Class_Prop schließende Marker mit dem `formatting-*-end`-Segment liefern.
3. IF nicht machbar, THEN SHALL die Lücke im Compatibility-Analyzer als „partial“ geführt und in der Doku vermerkt werden.
4. THE bestehenden Klassen (`formatting`, `formatting-em`, `inline-code` …) SHALL weiterhin geliefert werden.

### Requirement 5: Declarative Settings `id`

**User Story:** Als Plugin-Entwickler möchte ich einzelnen Settings eine ID geben (`SettingDefinitionItem#id`).

#### Acceptance Criteria

1. THE Declarative_Settings_Renderer SHALL ein optionales String-Feld `id` pro Eintrag akzeptieren.
2. WHEN `id` gesetzt ist, THE Renderer SHALL es als `data-setting-id` am Zeilen-Element ablegen (Annahme, in `design.md` dokumentiert; Obsidians DOM-Form ist nicht dokumentiert).
3. IF `id` fehlt, THEN SHALL das Verhalten unverändert sein.

### Requirement 6: Math-Zeilen-Klasse und Schrift-Variable

#### Acceptance Criteria

1. WHEN ein `$$`-Block in Live Preview gerendert wird, THE Editor SHALL jede Zeile des Blocks mit der Klasse `HyperMD-math` versehen (sofern der Block als Zeilen-Dekoration umgesetzt ist; sonst Verifikation in `design.md`).
2. THE Stylesheet SHALL `--font-preferred-size` auf `var(--font-text-size)` definieren.

### Requirement 7: API-Version

#### Acceptance Criteria

1. AFTER Abschluss der Requirements 1–6 SHALL `OBSIDIAN_API_VERSION` auf `1.15.1` angehoben werden; die Tests für `requireApiVersion` SHALL angepasst werden.
2. THE Doku (Compat-Inventar, `docs/`) SHALL die neuen Punkte und die Non-Goals aufführen.
