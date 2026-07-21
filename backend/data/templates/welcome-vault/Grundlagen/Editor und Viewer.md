---
tags:
  - grundlagen
---

# Editor und Viewer

Slatebase bietet zwei Darstellungsmodi für jede Markdown-Datei: den **Edit-Modus** zum Schreiben und den **View-Modus** zum Lesen. Du kannst jederzeit zwischen beiden wechseln.

![[Screenshots/editor-toolbar.png]]

*Editor mit Toolbar im Bearbeitungsmodus*

---

## Die zwei Modi

### Edit-Modus (Bearbeiten)

Im Edit-Modus siehst du den rohen Markdown-Text. Hier schreibst und bearbeitest du deine Notizen.

- Markdown-Syntax wird als Text angezeigt (`# Überschrift`, `**fett**`)
- Cursor und Textauswahl sind aktiv
- Die Toolbar bietet Formatierungs-Shortcuts
- Zeilennummern können eingeblendet werden

### View-Modus (Ansicht)

![[Screenshots/viewer-formatiert.png]]

*Formatierte Ansicht im View-Modus*

Im View-Modus wird dein Markdown gerendert — du siehst das fertige Ergebnis.

- Überschriften sind formatiert
- Links sind anklickbar
- Tabellen, Code-Blöcke und Callouts werden schön dargestellt
- Wikilinks führen per Klick zur verlinkten Datei

---

## Zwischen Modi wechseln

Klicke auf das **Augensymbol** (👁) in der Toolbar, um zwischen Edit und View zu wechseln.

| Symbol | Modus | Beschreibung |
|--------|-------|--------------|
| Stift-Symbol | Edit | Markdown bearbeiten |
| Augen-Symbol | View | Formatierte Ansicht |

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
| Modus wechseln | Zwischen Edit/View umschalten |

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
2. Wechsle in den **Edit-Modus** (falls nicht schon aktiv)
3. Schreibe einen Absatz mit normalem Text
4. Markiere ein Wort und klicke **Fett** in der Toolbar
5. Wechsle in den **View-Modus** — das Wort erscheint fettgedruckt
6. Wechsle zurück und mache die Änderung mit `Strg+Z` rückgängig

---

> [!todo] Übung
> Öffne diese Datei im **Edit-Modus** und füge am Ende eine neue Überschrift `## Meine Notizen` hinzu. Schreibe darunter einen kurzen Absatz. Wechsle dann in den View-Modus und prüfe das Ergebnis. Mache anschließend alles mit `Strg+Z` rückgängig.

---

> [!tip] Best Practice
> Schreibe im Edit-Modus und wechsle zum View-Modus, wenn du Links anklicken oder das Gesamtbild prüfen möchtest. Für reine Lesevorgänge (z.B. Anleitungen durcharbeiten) ist der View-Modus ideal.

---

## Verwandte Seiten

- [[Grundlagen/Markdown Syntax|Markdown Syntax]] — Vorheriger Guide
- [[Grundlagen/Navigation und Tabs|Navigation und Tabs]] — Nächster Guide
- [[Features/Live Preview Editor|Live Preview Editor]] — Source-Modus und Live-Vorschau in einem Editor
- [[Features/Vorlagen und Daily Notes|Vorlagen und Daily Notes]] — Schnell formatierte Notizen erstellen
