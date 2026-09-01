---
tags:
  - grundlagen
---

# Editor und Viewer

Slatebase bietet zwei Darstellungsmodi für jede Markdown-Datei: den **Source-Modus** (roher Markdown-Text) und den **Live-Preview-Modus** (inline formatiert). Beide Modi sind vollwertige Editoren — du kannst in beiden schreiben und bearbeiten.

![[Screenshots/editor-toolbar.png]]

*Editor im Bearbeitungsmodus*

---

## Die zwei Modi

### Source-Modus (Quelltext)

Im Source-Modus siehst du den rohen Markdown-Text mit Syntax-Highlighting. Alle Marker bleiben sichtbar.

- Markdown-Syntax wird als Text angezeigt (`# Überschrift`, `**fett**`)
- Cursor und Textauswahl sind aktiv
- Zeilennummern können eingeblendet werden

**Wann verwenden:** Bei komplexer Formatierung, Tabellen oder wenn du die volle Kontrolle über die Syntax brauchst.

### Live-Preview-Modus (Vorschau)

![[Screenshots/viewer-formatiert.png]]

*Formatierte Ansicht im Live-Preview-Modus*

Im Live-Preview-Modus wird dein Markdown **inline formatiert** dargestellt — und du kannst trotzdem weiter schreiben. Sobald der Cursor einen formatierten Bereich berührt, werden die Markdown-Marker automatisch eingeblendet.

- Überschriften erscheinen in der richtigen Größe
- Links sind anklickbar
- Tabellen, Code-Blöcke und Callouts werden schön dargestellt
- Wikilinks führen per Klick zur verlinkten Datei
- Bilder und Embeds werden inline angezeigt

> [!info] Live Preview Editor
> Der Live-Preview-Modus ist ein vollwertiger Editor auf Basis von CodeMirror 6. Alles Weitere zu den Fähigkeiten (Vim-Modus, Bild-Einfügen, Mermaid-Rendering u.v.m.) findest du unter [[Features/Live Preview Editor|Live Preview Editor]].

---

## Zwischen Modi wechseln

| Methode | Aktion |
|---------|--------|
| Tastenkürzel | `Ctrl+E` |
| Command Palette | `Ctrl+P` → "Editor-Modus wechseln" |

> [!info] Formatierungsleiste per Plugin
> Slatebase selbst hat keine feste Toolbar über dem Editor — Formatierungen setzt du direkt über Markdown-Syntax (`**fett**`, `## Überschrift` usw.). Wer lieber per Klick statt per Syntax formatiert, kann das [[Fortgeschritten/Plugins/Editing Toolbar|Editing Toolbar Plugin]] installieren.

---

## Auto-Save

Slatebase speichert deine Änderungen **automatisch** nach einer kurzen Verzögerung (ca. 2 Sekunden Inaktivität). Du musst nicht manuell speichern.

- Kein Datenverlust bei Browser-Tab-Wechsel
- Kein explizites Speichern nötig
- Änderungen sind sofort für andere Nutzer sichtbar (bei geteilten Vaults)

---

## Zeilennummern

Im Edit-Modus können Zeilennummern am linken Rand eingeblendet werden:

- Hilfreich bei langen Dokumenten
- Aktivierbar über die Einstellungen
- Synchronisiert sich mit dem Scroll-Bereich

---

## Lesbare Zeilenlänge

Erreichbar über die Command Palette (`Strg+P`):

- **"Lesbare Zeilenlänge umschalten"** — begrenzt die Editor-Breite für angenehmeres Lesen (Standard: an)

---

## Rechtschreibprüfung

Slatebase bringt eine eigene Rechtschreibprüfung mit — unbekannte Wörter werden im Edit-Modus rot unterringelt.

**Korrigieren:** Rechtsklick auf ein unterringeltes Wort. Ganz oben im Kontextmenü stehen die Korrekturvorschläge; ein Klick ersetzt das Wort.

Darunter zwei Wege, ein Wort dauerhaft zu akzeptieren:

| Eintrag | Wirkung |
|---------|---------|
| „Zum Wörterbuch hinzufügen" | Merkt sich das Wort dauerhaft (pro Browser gespeichert) |
| „Alle ignorieren (diese Sitzung)" | Gilt bis zum nächsten Neuladen |

**Sprache und Ein/Aus:** im selben Kontextmenü unter „Rechtschreibprüfung", oder über die Command Palette:

- **"Rechtschreibprüfung umschalten"** — schaltet die Prüfung ein/aus (Standard: an)
- **"Wörterbuch: Deutsch"** / **"Wörterbuch: Englisch"** — wählt das Wörterbuch (Standard: Deutsch)

Zusammengesetzte Wörter wie „Verzeichnisstruktur" oder „Benutzeroberfläche" werden erkannt, auch wenn sie so nicht im Wörterbuch stehen. Bei sehr eigenwilligen Komposita oder Fachbegriffen kann es trotzdem zu Fehlalarmen kommen — dafür gibt es das persönliche Wörterbuch.

---

## Falten (Folding)

Lange Dokumente lassen sich leichter überblicken, wenn du gerade nicht benötigte Abschnitte einklappst. Alle Falt-Befehle findest du in der Command Palette (`Strg+P`):

| Befehl | Wirkung |
|--------|---------|
| „Einklappen der aktuellen Zeile umschalten" | Klappt den Überschriftenabschnitt oder die verschachtelte Liste am Cursor ein/aus |
| „Alle Überschriften und Listen einklappen" | Klappt alles Faltbare im Dokument ein |
| „Alle Überschriften und Listen ausklappen" | Klappt alles wieder auf |
| „Mehr einklappen" / „Weniger einklappen" | Geht Überschriftenebene für Ebene durch — „Mehr einklappen" faltet zuerst die tiefste Ebene, „Weniger einklappen" öffnet zuerst die flachste eingeklappte Ebene |
| „Einklappen der Eigenschaften umschalten" | Klappt nur den Frontmatter-Block ein, das öffnende `---` bleibt sichtbar |

Eine eingeklappte Überschrift fasst alles bis zur nächsten gleich- oder höherrangigen Überschrift zusammen; ein eingeklappter Listeneintrag fasst seine verschachtelten Unterpunkte zusammen.

---

## Notizen aufteilen

Drei Command-Palette-Befehle schneiden Inhalt aus der aktuellen Notiz in eine neue Datei aus und ersetzen ihn durch einen `[[Wikilink]]` zurück auf den extrahierten Teil:

| Befehl | Extrahiert |
|--------|------------|
| „Notiz-Composer: Aktuelle Auswahl extrahieren …" | Den markierten Text (fragt nach einem Dateinamen) |
| „Notiz-Composer: Diese Überschrift extrahieren …" | Die Überschrift am Cursor samt allem bis zur nächsten gleich- oder höherrangigen Überschrift (Dateiname = Überschriftentext) |
| „Notiz-Composer: Aktuelle Datei mit anderer Datei zusammenführen …" | Umgekehrt: hängt die *gesamte* aktuelle Datei an eine von dir benannte Datei an und löscht anschließend die aktuelle Datei |

---

## Als PDF exportieren

Command Palette → „Als PDF exportieren …" schaltet die aktive Datei in den Lesemodus und öffnet den Druckdialog deines Browsers — wähle dort „Als PDF speichern" als Ziel. Gedruckt wird nur der gerenderte Notizinhalt, nicht die Seitenleiste oder Tab-Leiste.

---

## Undo / Redo

Fehler lassen sich rückgängig machen:

| Aktion | Kürzel |
|--------|--------|
| Rückgängig (Undo) | `Strg+Z` |
| Wiederherstellen (Redo) | `Strg+Y` |

Der Verlauf speichert bis zu 100 Schritte und wird beim Wechsel der Datei zurückgesetzt.

---

## Schritt-für-Schritt: Text formatieren

1. Erstelle eine neue Datei oder öffne eine bestehende
2. Wechsle in den **Source-Modus** (falls nicht schon aktiv)
3. Schreibe einen Absatz mit normalem Text
4. Markiere ein Wort und umschließe es mit `**` für Fettschrift
5. Wechsle in den **Live-Preview-Modus** — das Wort erscheint fettgedruckt
6. Wechsle zurück und mache die Änderung mit `Strg+Z` rückgängig

---

> [!todo] Übung
> Öffne diese Datei im **Source-Modus** und füge am Ende eine neue Überschrift `## Meine Notizen` hinzu. Schreibe darunter einen kurzen Absatz. Wechsle dann in den Live-Preview-Modus und prüfe das Ergebnis. Mache anschließend alles mit `Strg+Z` rückgängig.

---

> [!tip] Best Practice
> Im Live-Preview-Modus siehst du beim Schreiben sofort das Ergebnis. Für komplexe Tabellen oder verschachtelte Syntax ist der Source-Modus übersichtlicher. Beide Modi sind vollwertige Editoren — du verlierst keine Funktionalität.

---

## Verwandte Seiten

- [[Grundlagen/Markdown Syntax|Markdown Syntax]] — Vorheriger Guide
- [[Grundlagen/Navigation und Tabs|Navigation und Tabs]] — Nächster Guide
- [[Features/Live Preview Editor|Live Preview Editor]] — Source-Modus und Live-Vorschau in einem Editor
- [[Features/Vorlagen und Daily Notes|Vorlagen und Daily Notes]] — Schnell formatierte Notizen erstellen
- [[Fortgeschritten/Plugins/Editing Toolbar|Editing Toolbar Plugin]] — Formatierungsleiste per Klick statt Markdown-Syntax
