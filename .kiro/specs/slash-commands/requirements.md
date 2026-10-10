# Requirements Document

## Introduction

Das Slash-Command-Menü (Obsidian Desktop 1.1) öffnet im Editor beim Tippen von `/` am Zeilenanfang (bzw. nach Leerraum) ein Inline-Befehlsmenü: tippen filtert, Pfeiltasten/Enter wählt, und der gewählte Befehl wird ausgeführt — Überschrift setzen, Tabelle/Callout/Codeblock einfügen, Vorlage einfügen, Datum einfügen und so weiter. Es ist die „ohne-die-Hände-von-der-Tastatur"-Variante der Command Palette, direkt am Cursor.

Slatebase hat alle Zutaten bereits: die `CommandRegistry` mit den registrierten `editor:*`/Core-Commands (`core-commands.ts`, `core-commands-app.ts`), die Formatierungslogik (`editor/formatting.ts`), den Vorlagen-Einfügen-Befehl (`insert-template`) — **und** eine vollständige, inline im CM6-Editor sitzende Autovervollständigungs-Infrastruktur aus dem Plugin-Compat-Layer (`editor-suggest-manager.ts`, `editor-suggest-popover.ts`, `editor-suggest-extension.ts`), die exakt das „tippen → gefiltertes Popover am Cursor → Pfeiltasten/Enter → ausführen"-Muster bereits implementiert. Was fehlt, ist eine Slatebase-eigene Trigger-Quelle, die auf `/` reagiert und Befehle statt Plugin-Vorschläge anbietet.

Dies ist ein **kleines, scharf abgegrenztes Feature** (geschätzt ~8–14h): keine neue Infrastruktur, kein Backend, keine neue Architektur — eine neue Trigger-Quelle plus die Liste der angebotenen Befehle plus die DE/EN-Labels. Der Hebel ist gut: ein spürbarer Editor-Komfort, der auf Vorhandenem aufsitzt.

Abgrenzung: Dies ist **nicht** die Command Palette (Ctrl+P, globaler Befehlsdialog) und **nicht** der Quick Switcher (Ctrl+O, Datei öffnen). Das Slash-Menü ist editor-intern, cursornah und auf *Einfüge-/Formatier*-Befehle fokussiert.

## Glossary

- **Slash_Menu**: Das Inline-Popover, das im Editor nach dem Trigger `/` erscheint und eine gefilterte, auswählbare Befehlsliste zeigt.
- **Slash_Trigger**: Die Bedingung, unter der das Slash_Menu öffnet — ein `/` am Zeilenanfang oder nach Leerraum, gefolgt vom getippten Filtertext bis zum nächsten Leerzeichen.
- **Slash_Command**: Ein im Menü anwählbarer Eintrag mit Label, optionalem Icon und einer Aktion. Aktionen sind überwiegend bestehende `editor:*`/Core-Commands; die Liste ist eine kuratierte, slash-geeignete Teilmenge plus ein paar Direkt-Einfüge-Einträge (Datum/Zeit).
- **Suggest_Infrastructure**: Die vorhandene CM6-Autovervollständigungs-Schicht des Plugin-Compat-Layers (`editor-suggest-*.ts`), die Trigger-Erkennung, Popover-Rendering, Tastatur-Navigation und Auswahl-Lifecycle bereitstellt und von diesem Feature wiederverwendet wird.

## Requirements

### Requirement 1: Trigger und Filterung

**User Story:** Als Nutzer möchte ich im Editor `/` tippen und sofort eine Befehlsliste sehen, die sich beim Weitertippen einschränkt, damit ich schnell den gewünschten Befehl finde.

#### Acceptance Criteria

1. WHEN der Nutzer im Haupteditor `/` am Zeilenanfang oder unmittelbar nach Leerraum tippt, THE Slash_Menu SHALL am Cursor öffnen und die verfügbaren Slash_Commands anzeigen.
2. WHEN der Nutzer nach dem `/` weitertippt, THE Slash_Menu SHALL die Liste per Fuzzy-/Substring-Match über die Befehls-Labels filtern (gleiche Match-Qualität wie Command Palette / Quick Switcher).
3. WHEN kein `/` am Zeilenanfang/nach Leerraum steht (z.B. `/` innerhalb eines Wortes, in einem Pfad `a/b`, in einem Codeblock oder in einer Wikilink/`$math$`-Region), THE Slash_Trigger SHALL NICHT auslösen — Slashes im normalen Textfluss bleiben literaler Text.
4. WHEN der Nutzer ein Leerzeichen tippt, den Cursor aus dem `/…`-Bereich bewegt oder Escape drückt, THE Slash_Menu SHALL schließen, ohne etwas einzufügen.
5. THE Slash_Trigger SHALL nur im Haupteditor (CM6) aktiv sein, konsistent damit, dass auch die Rechtschreibprüfung und die EditorSuggests nur dort laufen (keine `<textarea>`-Oberflächen).

### Requirement 2: Auswahl und Ausführung

**User Story:** Als Nutzer möchte ich einen Befehl mit Tastatur oder Maus auswählen, damit er den `/`-Text ersetzt und seine Aktion ausführt.

#### Acceptance Criteria

1. THE Slash_Menu SHALL Tastaturnavigation unterstützen: Pfeil hoch/runter wählt, Enter/Tab bestätigt, Escape bricht ab (Prec.highest-Keymap, solange das Menü offen ist — gleiches Muster wie die bestehenden EditorSuggests).
2. THE Slash_Menu SHALL Mausauswahl (Klick auf einen Eintrag) unterstützen.
3. WHEN ein Slash_Command gewählt wird, THE Slash_Menu SHALL zuerst den eingegebenen `/…`-Trigger-Text aus dem Dokument entfernen und DANN die Aktion des Befehls ausführen (sodass z.B. „Tabelle einfügen" die Tabelle an der Cursorposition einfügt, nicht hinter einem stehengebliebenen `/tabelle`).
4. WHEN die Aktion ein bestehender `editor:*`/Core-Command ist, THE Slash_Menu SHALL ihn über `executeCommandById` ausführen (keine zweite, parallele Formatierungslogik — Palette und Slash-Menü dürfen nicht auseinanderdriften).
5. WHEN die Aktion einen Direkt-Einfügetext erzeugt (Datum/Zeit), THE Slash_Menu SHALL den Text an der Cursorposition über den regulären CM6-Dispatch einfügen (korrekte Undo-History).

### Requirement 3: Angebotene Befehle

**User Story:** Als Nutzer möchte ich die üblichen Einfüge- und Formatierbefehle im Slash-Menü finden, damit es für die häufigen Fälle nützlich ist.

#### Acceptance Criteria

1. THE Slash_Command-Liste SHALL mindestens enthalten: Überschrift H1–H3, Aufzählung, nummerierte Liste, Aufgabenliste (Checkbox), Zitat/Blockquote, Codeblock, Callout, Tabelle, horizontale Linie, interner Link (`[[`), Vorlage einfügen (`insert-template`), Datum einfügen, Zeit einfügen.
2. THE Slash_Command-Liste SHALL ihre Aktionen so weit wie möglich an bestehende `editor:*`/Core-Commands binden; nur wo kein Command existiert (z.B. „Datum einfügen"), SHALL ein kleiner Direkt-Einfüge-Handler ergänzt werden.
3. THE Slash_Command-Labels SHALL lokalisiert sein (DE/EN) über denselben Mechanismus wie die Core-Command-Labels (`core-command-i18n.ts`-Muster), mit stabilen, sprachunabhängigen IDs.
4. WHEN ein in der Liste referenzierter Command durch ein Feature-Toggle oder fehlenden Kontext nicht ausführbar ist, THE Slash_Menu SHALL den Eintrag auslassen oder sichtbar deaktivieren, statt einen stillen No-Op anzubieten.
5. THE Slash_Command-Liste SHALL als eine wartbare, zentrale Definition vorliegen (eine Datei), nicht über mehrere Call-Sites verstreut.

### Requirement 4: Koexistenz mit Plugin-EditorSuggests

**User Story:** Als Nutzer, der Plugins mit eigenen Vorschlägen nutzt, möchte ich, dass das Slash-Menü diese nicht stört, damit beide zuverlässig funktionieren.

#### Acceptance Criteria

1. THE Slash_Trigger SHALL als zusätzliche Suggest-Quelle in die vorhandene Suggest_Infrastructure eingehängt werden, nicht als zweite, konkurrierende CM6-Keymap/ViewPlugin-Schicht.
2. WHEN sowohl ein Plugin-EditorSuggest als auch das Slash_Menu auf dieselbe Eingabe triggern könnten, THE Suggest_Infrastructure SHALL genau einen Gewinner anzeigen (Obsidians „ein Suggest zur Zeit"-Semantik), ohne zwei überlappende Popover.
3. THE Slash_Menu SHALL dieselbe Stale-Guard-/Lifecycle-Behandlung erben, die die Suggest_Infrastructure bereits hat (Generation-Counter, Schließen bei Vault-Wechsel), ohne sie zu duplizieren.
4. THE Slash_Menu SHALL die vorhandenen `.suggestion-*`-CSS-Klassen/Popover-Struktur wiederverwenden, damit es visuell identisch zu Plugin-Suggests und Quick Switcher aussieht.

### Requirement 5: Dokumentation

**User Story:** Als neuer Nutzer möchte ich im Tutorial-Vault vom Slash-Menü erfahren, damit ich es entdecke.

#### Acceptance Criteria

1. THE Welcome_Vault (DE und EN) SHALL das Slash-Menü dokumentieren — entweder als eigener kurzer Feature-Guide „Slash-Befehle" (DE) / „Slash Commands" (EN) oder als Abschnitt in einem bestehenden Editor-/Command-Palette-Guide, in der etablierten Struktur.
2. WHEN ein eigener Guide hinzukommt, THE Welcome_Vault Features-Übersicht (`Features/Übersicht.md` DE, `Features/Overview.md` EN) SHALL ihn verlinken und `_meta.md` (DE+EN) SHALL Version/`updated` anheben.
3. THE Steering_Docs (`structure.md`, `product.md`) SHALL das Feature und seine Dateien verzeichnen.

## Out of Scope (erste Version)

- **Nutzer-/plugin-definierbare Slash-Befehle** über eine öffentliche API — die erste Version liefert eine kuratierte interne Liste. (Plugins haben bereits ihre eigene EditorSuggest-API.)
- **Alias-Trigger** jenseits von `/` (z.B. `@` für Erwähnungen, `:` für Emojis) — eigenes, späteres Feature.
- **Argument-/Mehrschritt-Befehle** im Menü (z.B. „Überschrift Ebene …" mit Unterauswahl) — die erste Version führt Ein-Schritt-Befehle direkt aus.
- **Slash-Menü in Nicht-CM6-Oberflächen** (Chat-Eingabe, Canvas-Textknoten, Snippet-/Settings-Felder) — bewusst nur der Haupteditor.
