---
tags:
  - grundlagen
---

# Editor und Viewer

Slatebase bietet zwei Darstellungsmodi für jede Markdown-Datei: den **Source-Modus** (roher Markdown-Text) und den **Live-Preview-Modus** (inline formatiert). Beide Modi sind vollwertige Editoren — du kannst in beiden schreiben und bearbeiten.

![[Screenshots/editor-toolbar.png]]

*Editor mit Toolbar im Bearbeitungsmodus*

---

## Die zwei Modi

### Source-Modus (Quelltext)

Im Source-Modus siehst du den rohen Markdown-Text mit Syntax-Highlighting. Alle Marker bleiben sichtbar.

- Markdown-Syntax wird als Text angezeigt (`# Überschrift`, `**fett**`)
- Cursor und Textauswahl sind aktiv
- Die Toolbar bietet Formatierungs-Shortcuts
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
| Toolbar | Klick auf das Modus-Symbol (Quelltext/Vorschau) |
| Tastenkürzel | `Ctrl+E` |
| Command Palette | `Ctrl+P` → "Editor-Modus wechseln" |

| Symbol | Modus | Beschreibung |
|--------|-------|--------------|
| Quelltext-Symbol | Source | Roher Markdown-Text |
| Vorschau-Symbol | Live Preview | Inline formatiert, editierbar |

---

## Toolbar

Die Toolbar am oberen Rand des Editors bietet Schnellzugriff auf häufige Aktionen:

| Funktion | Beschreibung |
|----------|--------------|
| **Fett** | Markierten Text fett formatieren |
| *Kursiv* | Markierten Text kursiv formatieren |
| Überschrift | Überschrift einfügen |
| Liste | Aufzählung einfügen |
| Code | Code-Block einfügen |
| Link | Wikilink einfügen |
| Modus wechseln | Zwischen Source/Live Preview umschalten |

> [!tip] Tipp
> Markiere zuerst den Text, dann klicke auf eine Toolbar-Funktion. Der Text wird automatisch mit der passenden Syntax umschlossen.

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
4. Markiere ein Wort und klicke **Fett** in der Toolbar
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
