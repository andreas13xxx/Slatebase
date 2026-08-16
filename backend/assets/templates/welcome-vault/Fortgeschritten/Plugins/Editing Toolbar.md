---
tags: [fortgeschritten, plugins]
---

# Editing Toolbar Plugin

Editing Toolbar blendet eine Formatierungsleiste über dem Editor ein — Fettschrift, Kursiv, Überschriften, Listen, Zitate und mehr per Klick, ohne Markdown-Syntax auswendig zu kennen. Für markierten Text erscheint zusätzlich eine schwebende Auswahl-Toolbar.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Editing-Toolbar-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `editing-toolbar`

---

## Installation

1. Plugin-ZIP von GitHub herunterladen
2. Einstellungen → Vault → Plugins → "Plugin installieren"
3. ZIP hochladen → Aktivieren

---

## Toolbar-Varianten

| Variante | Wann sichtbar |
|----------|----------------|
| Fixe Toolbar | Dauerhaft am oberen Rand des Editors |
| Auswahl-Toolbar | Erscheint schwebend, sobald Text markiert wird |
| Ribbon-Icon | Öffnet/schließt die Toolbar über die Seitenleiste |

---

## Typische Werkzeuge

| Werkzeug | Wirkung |
|----------|---------|
| Fett / Kursiv / Durchgestrichen | Umschließt Auswahl mit `**`, `*`, `~~` |
| Überschriften H1–H6 | Setzt `#` bis `######` vor die Zeile |
| Aufzählung / nummerierte Liste | Wandelt Zeile(n) in Listenpunkte um |
| Zitat | Setzt `>` vor die Zeile |
| Code (inline / Block) | Umschließt mit `` ` `` bzw. ` ``` ` |
| Link einfügen | Öffnet Dialog, erzeugt `[Text](URL)` |
| Highlight | Umschließt mit `==...==` |
| Ausrichtung | Fügt Formatierungs-Callouts für Links/Bilder ein |

Die genaue Werkzeugauswahl lässt sich in den Plugin-Einstellungen anpassen (Werkzeuge ein-/ausblenden, Reihenfolge ändern).

---

## Beispieltext zum Ausprobieren

Markiere im folgenden Absatz einzelne Wörter oder ganze Sätze und wende über die Auswahl-Toolbar Formatierungen an — mit aktiviertem Plugin erscheint die Toolbar direkt neben der Markierung:

> Dieser Satz ist ein Testtext für die Editing Toolbar. Markiere ein Wort und mache es fett. Markiere einen anderen Abschnitt und mache ihn kursiv. Wandle diese Zeile in eine Überschrift um. Füge irgendwo einen Link ein.

---

## Ribbon und Fullscreen

Das Plugin registriert zusätzlich ein Ribbon-Icon zum Ein-/Ausblenden der Toolbar sowie einen "Workplace Fullscreen"-Modus, der Seitenleisten ausblendet, um mehr Platz für den Editor zu schaffen.

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Fixe Toolbar über dem Editor | Funktioniert |
| Schwebende Auswahl-Toolbar | Funktioniert |
| Alle Standard-Formatierungswerkzeuge | Funktioniert |
| Ribbon-Icon zum Ein-/Ausblenden | Funktioniert |
| Workplace Fullscreen | Funktioniert (blendet Seitenleisten aus, kein echtes Vollbild-Fenster) |
| Eigene Werkzeuge per Snippet-Konfiguration | Eingeschränkt |

---

> [!tip] Gute Einstiegshilfe
> Editing Toolbar eignet sich besonders für Nutzer, die von klassischen Textverarbeitungsprogrammen kommen und sich an Markdown-Syntax erst gewöhnen. Mit der Zeit lohnt es sich, die Tastenkürzel (`**`, `##`, `>`) direkt zu lernen — das ist meist schneller als die Toolbar.

> [!todo] Übung
> 1. Installiere und aktiviere das Editing-Toolbar-Plugin
> 2. Markiere Text im Beispielabsatz oben und formatiere ihn fett und kursiv
> 3. Wandle eine Zeile über die Toolbar in eine Überschrift um
> 4. Füge über die Toolbar einen Link ein
> 5. Blende die fixe Toolbar über das Ribbon-Icon aus und wieder ein
> 6. Teste den Workplace-Fullscreen-Modus

---

## Verwandte Features

- [[Grundlagen/Markdown Syntax]] — Die Syntax, die die Toolbar im Hintergrund erzeugt
- [[Features/Live Preview Editor]] — Editor-Modus, in dem die Toolbar arbeitet
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
