---
tags: [features]
---

# Bases

Bases machen aus den Metadaten, die ohnehin schon in deinem Vault stecken, eine lebendige, filterbare Tabelle. Eine `.base`-Datei beschreibt — in einfachem YAML — welche Notizen aufgenommen werden, welche Properties als Spalten erscheinen, wie sortiert wird und optional berechnete Spalten (Formeln). Das Ergebnis öffnet sich wie jede andere Datei: eine Tabelle, in der jede Zeile eine Notiz ist und jede Zelle direkt bearbeitet werden kann.

Stell es dir als gespeicherte, strukturierte Ansicht über deine Notizen vor — die Datenbank-Schicht über [[Features/Tags und Properties|Tags und Properties]].

> [!warning] Experimentell / im Aufbau
> Bases ist ein in Arbeit befindliches Feature (Roadmap Prio 6). Je nach Slatebase-Version steht es hinter dem Feature-Toggle `bases` oder ist noch nicht verfügbar. Rendert die Tabelle nicht, ist entweder das Toggle serverseitig aus (frag eine:n Administrator:in — siehe [[Admin/Feature Toggles]]) oder deine Version kennt Bases noch nicht. Die `.base`-Dateien selbst bleiben in jedem Fall gültig und portabel.

---

## Woraus eine Base besteht

Eine `.base`-Datei ist Obsidian-kompatibles YAML mit vier Teilen:

| Teil | Wofür |
|------|-------|
| **Filter** | Welche Notizen erscheinen — nach Property, Tag, Pfad oder Datei-Metadaten, kombiniert mit UND/ODER |
| **Properties** | Welche Spalten gezeigt werden und ihre Anzeigenamen |
| **Formeln** | Berechnete Spalten (schreibgeschützt), z. B. Tage bis zur Deadline |
| **Views** | Eine oder mehrere benannte Ansichten (zuerst Tabelle; Karten/Board als spätere Ausbaustufe) |

---

## Eine Base öffnen und erstellen

- **Öffnen:** Klicke eine `.base`-Datei im [[Grundlagen/Datei-Explorer|Datei-Explorer]] an, folge einem Wikilink darauf oder finde sie im Schnellwechsler (`Ctrl+O`). Sie rendert als Tabelle, nicht als Markdown-Editor.
- **Erstellen:** Führe **„Neue Base erstellen"** über die [[Features/Command Palette|Command Palette]] (`Ctrl+P`) aus. Eine leere `.base` wird im aktuellen Ordner angelegt.
- **Rohquelle:** Jede Base hat einen Rohquellen-Modus (YAML direkt bearbeiten) als Rückfallebene und für Felder, die die UI noch nicht abbildet — dasselbe Prinzip wie der Canvas-Rohquellen-Modus.

---

## Filtern

Filter entscheiden, welche Notizen zu Zeilen werden. Bedingungen lassen sich mit UND/ODER kombinieren:

- **Property-Bedingungen** — gleich, ungleich, enthält, existiert/leer, numerische und Datums-Vergleiche (z. B. `priority == high`, `deadline < today`)
- **Tag-Bedingungen** — hat / hat nicht einen Tag
- **Pfad-Bedingungen** — ein `path:`-Glob, dieselbe Syntax wie die [[Features/Suche und Ersetzen|Suche]]
- **Datei-Metadaten** — Name, Erstellungs-/Änderungsdatum

Die Engine liest aus dem Live-Metadaten-Index des Vaults, deshalb aktualisiert sich eine Base automatisch, wenn du Notizen hinzufügst, bearbeitest, löschst oder umbenennst — ohne sie neu zu öffnen.

---

## Formeln (berechnete Spalten)

Formeln sind schreibgeschützte Spalten, pro Zeile berechnet. Die erste Version unterstützt eine bewusst kleine, dokumentierte Menge:

- Property-Referenzen, String-/Zahl-/Boolean-Literale
- Vergleiche (`== != < <= > >=`), Basis-Arithmetik (`+ - * /`), String-Verkettung
- Eine Handvoll Hilfsfunktionen: `if(...)`, `concat(...)`, `now()`/`today()`, eine einfache Datumsdifferenz, `length(...)`

> [!note] Nicht die komplette Obsidian-Formelsprache
> Die erste Version ist bewusst auf einfache Ausdrücke beschränkt. Lambdas und Map-/Filter-Operationen über Listen sind eine spätere Ausbaustufe. Eine Formel schreibt nie in eine Notiz zurück — sie ist reine Anzeige.

---

## In der Tabelle bearbeiten

Property-Zellen sind inline editierbar, über dieselben typisierten Controls wie der [[Features/Tags und Properties|Properties-Editor]] — Text, Zahl, Datum/Datetime, Checkbox, Liste/Tags. Eine Zell-Änderung landet direkt in der Frontmatter der jeweiligen Notiz und wird gespeichert. Formel-Spalten sind schreibgeschützt.

Eine Zelle, die du gerade offen hast, geht nicht verloren, wenn die Tabelle neu aufgebaut wird (weil sich eine andere Zelle geändert hat, du den Tab gewechselt hast oder die Base aktualisiert wurde) — was du getippt hast, wird committet, dasselbe Sicherheitsnetz wie beim Properties-Editor.

Klick auf einen Spalten-Header sortiert; die gewählte Sortierung wird in die `.base`-Datei zurückgeschrieben.

---

## Praxisbeispiel

Dieser Vault bringt ein fertiges Beispiel mit: [[Features/Beispiel-Aufgaben (Base)]]. Es filtert eine kleine Menge Aufgaben-Notizen nach Status und zeigt eine Formel-Spalte. Öffne es, um eine nicht-leere Tabelle zu sehen, und dann:

1. Bearbeite eine `status`-Zelle direkt in der Tabelle — die Änderung landet in der Frontmatter der zugrunde liegenden Notiz.
2. Klick auf den Spalten-Header **Priorität**, um zu sortieren.
3. Öffne den Rohquellen-Modus, um das YAML hinter der Tabelle zu sehen.

---

> [!todo] Übung
> 1. Öffne die Beispiel-Base und ändere den `status` einer Notiz aus der Tabelle heraus.
> 2. Lege eine neue Notiz mit einer `status`- und `priority`-Property an und öffne die Base erneut — deine Notiz sollte als neue Zeile erscheinen.
> 3. Führe **„Neue Base erstellen"** über die Command Palette aus und baue eine winzige eigene Base, die nach einem Tag filtert.

---

## Verwandte Features

- [[Features/Tags und Properties]] — Die Metadaten-Schicht, auf der Bases aufbauen
- [[Features/Suche und Ersetzen]] — Die `path:`/`tag:`/`property:`-Operatoren, die Bases-Filter spiegeln
- [[Features/Context Panel]] — Pro-Notiz-Ansicht derselben Properties
- [[Fortgeschritten/Plugins/Dataview]] — Die Plugin-basierte Alternative zum Abfragen von Notizen
- [[Admin/Feature Toggles]] — Bases serverweit ein-/ausschalten
