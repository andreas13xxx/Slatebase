# Requirements Document — Welcome Vault v2

## Introduction

Die bestehenden Welcome-Vaults (DE/EN) enthalten aktuell nur eine knappe Übersicht (11 Dateien, Grundlagen-Syntax). Sie sollen zu einer **vollständigen, bebilderten Anleitung** ausgebaut werden, die alle Slatebase-Features erklärt und mit Praxisbeispielen demonstriert. Zusätzlich soll ein Nutzer die Möglichkeit erhalten, den Welcome-Vault **nachträglich** zu seinen Vaults hinzuzufügen — unabhängig davon, ob er bei Account-Erstellung erstellt wurde oder nicht.

## Glossary

- **Welcome_Vault_v2**: Der erweiterte Welcome-Vault mit vollständiger Feature-Dokumentation und Screenshots
- **Screenshot**: Ein Bildschirmfoto der Slatebase-Oberfläche, das ein Feature visuell erklärt (als PNG im Vault eingebettet)
- **Nachträgliches_Hinzufügen**: Die Möglichkeit, den Welcome-Vault jederzeit über die UI zu erstellen, auch wenn er nicht automatisch bei Account-Erstellung angelegt wurde
- **Feature_Guide**: Eine einzelne Markdown-Datei im Welcome-Vault, die ein bestimmtes Feature vollständig erklärt (Konzept → Anleitung → Beispiel)
- **Interactive_Example**: Ein Markdown-Abschnitt, der den Nutzer auffordert, eine Aktion direkt im Vault auszuprobieren (z.B. "Erstelle jetzt einen Link zu dieser Datei")

---

## Requirements

### Requirement 1: Vollständige Feature-Dokumentation

**User Story:** Als neuer Benutzer möchte ich im Welcome-Vault eine vollständige Anleitung für ALLE Slatebase-Features finden, damit ich die Anwendung ohne externe Dokumentation erlernen kann.

#### Acceptance Criteria

1. THE Welcome_Vault_v2 SHALL für jedes der folgenden Feature-Bereiche mindestens einen eigenen Feature_Guide enthalten:
   - Markdown-Grundlagen (Formatierung, Listen, Tabellen, Code-Blöcke)
   - Wikilinks (Syntax, Pfade, Aliase, Heading-Links, Block-Referenzen)
   - Embeds (Bilder, PDFs, Notizen, Größenangaben)
   - Callouts (alle Typen: tip, warning, info, note, danger, quote, etc.)
   - Tags und Frontmatter-Properties
   - Datei-Explorer (Erstellen, Umbenennen, Verschieben, Drag & Drop)
   - Tabs und Navigation (Multi-Tab, Tab-Verwaltung)
   - Suche und Ersetzen (Volltextsuche, Regex, Multi-Vault)
   - Knowledge Graph (Visualisierung, Navigation, Konfiguration)
   - Context Panel (Outline, Links, Tags, Properties, Split-Views)
   - Mermaid-Diagramme (Flowchart, Sequenz, Gantt, Pie etc.)
   - Vorlagen und tägliche Notizen (Templates, Daily Notes)
   - Papierkorb und Dateiversionen (Soft-Delete, Restore, Diff)
   - Tastenkürzel und Command Palette
   - Canvas (Nodes, Edges, Zoom/Pan, Gruppen)
   - Vault-Verwaltung (Erstellen, Löschen, Teilen, Statistiken)
   - Einstellungen (Alle Kategorien: Konto, Darstellung, Vault-Konfiguration)
   - Chat-Funktion (Konversationen, Nachrichten)
   - Sync (Konfiguration, Status, Konflikte) — mit Hinweis auf experimentellen Status

2. EACH Feature_Guide SHALL folgende Struktur haben:
   - Kurzbeschreibung (1–2 Sätze was das Feature tut)
   - Screenshot(s) der Oberfläche mit Beschriftung
   - Schritt-für-Schritt-Anleitung
   - Mindestens ein Praxisbeispiel das im Vault direkt ausprobiert werden kann
   - Tipps und Best Practices (als Callout)
   - Verwandte Features (als Wikilinks)

3. THE Welcome_Vault_v2 SHALL eine klare Navigationsstruktur bieten:
   - Startseite mit Feature-Übersicht (gruppiert nach Kategorie)
   - Inhaltsverzeichnis-Datei pro Ordner
   - Vor/Zurück-Navigation zwischen zusammenhängenden Guides
   - Tags für Feature-Kategorien (#grundlagen, #fortgeschritten, #profi)

4. THE Welcome_Vault_v2 SHALL insgesamt **30–50 Markdown-Dateien** enthalten (zzgl. Bild-Dateien)

5. THE Welcome_Vault_v2 SHALL in **beiden Sprachen** (DE und EN) vollständig bereitgestellt werden, mit identischer Struktur

---

### Requirement 2: Screenshots und visuelle Erklärungen

**User Story:** Als visueller Lerner möchte ich Screenshots der Oberfläche sehen, damit ich schnell verstehe wo sich welche Funktionen befinden und wie sie aussehen.

#### Acceptance Criteria

1. THE Welcome_Vault_v2 SHALL mindestens **20 Screenshots** pro Sprachvariante enthalten, die die wichtigsten UI-Bereiche zeigen
2. EACH Screenshot SHALL mit einer Bildunterschrift versehen sein (via Text direkt nach dem Embed)
3. THE Screenshots SHALL folgende UI-Bereiche abdecken:
   - Gesamtansicht (3-Panel-Layout)
   - Datei-Explorer (mit Kontext-Menü)
   - Editor (Edit-Modus mit Toolbar)
   - Viewer (Render-Modus mit formatiertem Markdown)
   - Tab-Leiste (mehrere offene Tabs)
   - Knowledge Graph (mit verknüpften Nodes)
   - Context Panel (Outline, Links, Tags)
   - Suche (mit Ergebnissen)
   - Settings-Panel (Übersicht)
   - Canvas (mit verschiedenen Node-Typen)
   - Command Palette (geöffnet mit Ergebnissen)
   - Mermaid-Diagramm (gerendert)
   - Callout-Typen (mehrere nebeneinander)
   - Dark Mode vs. Light Mode
4. THE Screenshots SHALL als PNG-Dateien in einem `Screenshots/`-Unterordner im Welcome-Vault liegen
5. THE Screenshots SHALL über Embed-Syntax (`![[Screenshots/dateiname.png]]`) in den Guides eingebettet werden
6. THE Screenshots SHALL eine konsistente Breite haben (max. 800px) und im Dark-Mode aufgenommen sein (Standard-Theme)

---

### Requirement 3: Interaktive Übungen

**User Story:** Als neuer Benutzer möchte ich Features direkt im Welcome-Vault ausprobieren können, damit ich durch Praxis schneller lerne als durch reines Lesen.

#### Acceptance Criteria

1. THE Welcome_Vault_v2 SHALL mindestens **10 interaktive Übungen** enthalten (über verschiedene Guides verteilt)
2. EACH Interactive_Example SHALL durch einen speziellen Callout-Typ (`> [!exercise]` oder `> [!todo]`) visuell hervorgehoben sein
3. THE Interactive_Examples SHALL so gestaltet sein, dass sie den Welcome-Vault NICHT beschädigen (z.B. "Erstelle eine neue Datei in Projekte/", nicht "Lösche diese Datei")
4. THE Interactive_Examples SHALL progressive Schwierigkeit haben:
   - Einfach: Datei öffnen, Link klicken, Tag hinzufügen
   - Mittel: Neue Datei erstellen, Callout schreiben, Template nutzen
   - Fortgeschritten: Graph erkunden, Canvas erstellen, Suche mit Regex

---

### Requirement 4: Nachträgliches Hinzufügen des Welcome-Vaults

**User Story:** Als bestehender Benutzer möchte ich den Welcome-Vault jederzeit zu meinen Vaults hinzufügen können, damit ich bei Bedarf auf die Dokumentation zugreifen kann (z.B. nach einem Update mit neuen Features, oder wenn der Vault beim Erstellen des Accounts nicht angelegt wurde).

#### Acceptance Criteria

1. THE System SHALL einen neuen UI-Eintrag bereitstellen, über den ein Benutzer den Welcome-Vault manuell erstellen kann:
   - Ort: Einstellungen → Konto-Bereich, Button "Anleitungs-Vault erstellen"
   - ODER: Command Palette, Befehl "Anleitungs-Vault erstellen"
2. WHEN der Benutzer den Welcome-Vault manuell erstellt, THE System SHALL einen neuen Vault mit dem aktuellen Template-Inhalt für diesen Benutzer anlegen
3. THE System SHALL die Sprache des Welcome-Vaults basierend auf der Nutzer-Präferenz (`preferredLanguage`) wählen
4. IF der Benutzer bereits einen Vault mit dem Welcome-Vault-Namen besitzt, THEN THE System SHALL einen Suffix anhängen (z.B. "Willkommen (2)") um Konflikte zu vermeiden
5. THE Button/Command SHALL immer verfügbar sein (auch wenn bereits ein Welcome-Vault existiert) — ermöglicht das Neu-Erstellen mit aktualisiertem Inhalt
6. THE System SHALL nach erfolgreicher Erstellung eine Toast-Benachrichtigung anzeigen und den neuen Vault im Explorer öffnen

---

### Requirement 5: API-Endpoint für Welcome-Vault-Erstellung

**User Story:** Als System möchte ich einen dedizierten API-Endpoint haben, damit sowohl die automatische Erstellung (bei Account-Anlage) als auch die manuelle Erstellung (durch den Nutzer) denselben Code-Pfad nutzen.

#### Acceptance Criteria

1. THE System SHALL einen neuen Endpoint bereitstellen: `POST /api/v1/welcome-vault`
2. THE Endpoint SHALL authentifiziert sein (Session-Token erforderlich)
3. THE Endpoint SHALL CSRF-geschützt sein
4. THE Endpoint SHALL den Welcome-Vault für den anfragenden Benutzer erstellen (eigener Kontext, nicht Admin-Aktion)
5. THE Response SHALL bei Erfolg `201 Created` mit `{ vaultId, vaultName }` zurückgeben
6. THE Response SHALL bei deaktiviertem Feature-Toggle `403 Forbidden` mit `{ code: "FEATURE_DISABLED", message: "..." }` zurückgeben
7. THE Response SHALL bei Fehler `500 Internal Server Error` mit Standard-Error-Format zurückgeben
8. THE Endpoint SHALL unabhängig davon funktionieren, ob bereits ein Welcome-Vault für den Nutzer existiert (idempotent hinsichtlich der Erstellung — ein neuer Vault wird immer erstellt)

---

### Requirement 6: Ordnerstruktur des Welcome-Vaults v2

**User Story:** Als Benutzer möchte ich eine logische, an reale Wissensmanagement-Workflows angelehnte Ordnerstruktur vorfinden, damit ich Best Practices für die eigene Vault-Organisation ablesen kann.

#### Acceptance Criteria

1. THE Welcome_Vault_v2 SHALL folgende Top-Level-Ordnerstruktur verwenden:

   **Deutsch:**
   ```
   Start hier.md
   Grundlagen/
   Features/
   Fortgeschritten/
   Praxis/
   Screenshots/
   Vorlagen/
   ```

   **Englisch:**
   ```
   Start here.md
   Basics/
   Features/
   Advanced/
   Practice/
   Screenshots/
   Templates/
   ```

2. THE `Grundlagen/` (bzw. `Basics/`) Ordner SHALL Einsteiger-Themen enthalten (Markdown, Navigation, Datei-Explorer)
3. THE `Features/` Ordner SHALL je einen Guide pro Slatebase-Feature enthalten
4. THE `Fortgeschritten/` (bzw. `Advanced/`) Ordner SHALL Profi-Themen enthalten (Regex-Suche, Canvas, Sync, MCP)
5. THE `Praxis/` (bzw. `Practice/`) Ordner SHALL die interaktiven Übungen und Beispielprojekte enthalten
6. THE `Screenshots/` Ordner SHALL alle eingebetteten Bilder enthalten
7. THE `Vorlagen/` (bzw. `Templates/`) Ordner SHALL Beispiel-Templates enthalten die der Nutzer für eigene Vaults kopieren kann

---

### Requirement 7: Versionierte Inhalte

**User Story:** Als Administrator möchte ich wissen welche Version der Welcome-Vault-Inhalte aktiv ist, damit ich bei Updates nachvollziehen kann ob die Anleitungen aktuell sind.

#### Acceptance Criteria

1. THE Welcome_Vault_v2 SHALL eine Datei `_meta.md` im Root enthalten mit:
   - Versionsnummer (Semver, z.B. `1.0.0`)
   - Datum der letzten Aktualisierung
   - Minimale Slatebase-Version für volle Kompatibilität
2. THE `_meta.md` SHALL im Frontmatter maschinenlesbare Felder haben:
   ```yaml
   ---
   version: "1.0.0"
   updated: "2026-07-15"
   min_slatebase_version: "0.11.0"
   ---
   ```
3. THE `_meta.md` SHALL aus dem normalen Datei-Explorer sichtbar sein (kein Dot-Prefix), aber durch Underscore-Prefix als "System-Datei" erkennbar

