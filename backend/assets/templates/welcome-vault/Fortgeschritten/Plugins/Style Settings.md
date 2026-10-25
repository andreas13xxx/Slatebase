---
tags: [fortgeschritten, plugins]
---

# Style Settings Plugin

Style Settings (`obsidian-style-settings`) zeigt die Einstellungen, die ein Theme oder ein CSS-Snippet selbst mitbringt: Farben, Schriftgrößen, Überschriften-Stile und Schalter für einzelne Darstellungsvarianten. Du stellst sie in einer Oberfläche ein, statt das CSS des Themes zu bearbeiten.

> [!info] Teilweise nutzbar
> Das Plugin läuft in Slatebase mit seiner Einstellungsseite, Suche sowie Import und Export. Optionen, die **Variablen** setzen (Farben, Größen, Schriften), wirken vollständig. Optionen, die nur eine **Klasse** umschalten, wirken nur dort, wo Slatebase das passende Element hat — bei *Minimal* etwa 11 von 64 (vor allem Tabellen und Überschriften). Mit dem echten Plugin-Bundle und dem Theme *Minimal* geprüft.

---

## Wofür das Plugin gut ist

Viele Themes bringen im CSS einen Kommentarblock `/* @settings … */` mit. Ohne Style Settings bleibt er unsichtbar. Mit dem Plugin wird daraus eine Einstellungsseite pro Theme, zum Beispiel:

- Farben für Hell und Dunkel getrennt wählen
- Größe und Farbe jeder Überschrift ändern
- Schriftarten austauschen
- Darstellungsvarianten ein- und ausschalten (etwa Tabellenstile)

Etwa jedes zweite Theme aus dem Katalog bietet solche Einstellungen an. In der Themenliste (**Einstellungen → Themes**) steht dann ein Hinweis darauf, siehe [[Features/Themes]].

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Style-Settings-Plugin installiert und aktiviert
- Ein aktives Theme (oder Snippet), das Einstellungen mitbringt
- Plugin-ZIP von GitHub: `obsidian-style-settings` (Repository [obsidian-community/obsidian-style-settings](https://github.com/obsidian-community/obsidian-style-settings))

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Style Settings" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Einstellungen eines Themes ändern

1. Aktiviere unter **Einstellungen → Themes** ein Theme, das Einstellungen anbietet (zum Beispiel *Minimal* oder *Things*)
2. Öffne die Plugin-Einstellungen von **Style Settings**
3. Das Plugin liest das aktive Theme und zeigt pro Theme einen eigenen Abschnitt
4. Klappe den Abschnitt auf, ändere einen Wert — die Änderung wirkt sofort im ganzen Fenster

Wechselst du das Theme, aktualisiert das Plugin die Abschnitte von selbst. Mit **Slatebase (Standard)** gibt es keine Abschnitte, weil das Standard-Aussehen keine Einstellungen mitbringt.

| Einstellungstyp | Was es macht | In Slatebase |
|-----------------|--------------|--------------|
| Farbe, Zahl, Schieberegler, Text, Auswahl (Variablen) | Setzt eine CSS-Variable | Wirkt vollständig |
| Schalter, Auswahl (Klassen) | Setzt eine Klasse auf `<body>` | Wirkt nur, wo Slatebase das Element hat |

---

## Suchen, Exportieren, Importieren

- **Suchfeld:** filtert die Einstellungen aller Abschnitte — bei Themes mit mehreren Hundert Optionen (zum Beispiel *Minimal* mit 173 Variablen) fast unverzichtbar
- **Export:** speichert deine Werte als JSON, etwa als Sicherung oder zum Weitergeben
- **Import:** spielt gespeicherte Werte wieder ein
- **Zurücksetzen:** jede Einstellung hat eine eigene Schaltfläche, um zum Standardwert des Themes zurückzukehren

---

## Wo die Werte gespeichert werden

Style Settings legt seine Werte wie jedes Plugin in der `data.json` des Plugins ab, **pro Vault**. Damit gilt dasselbe wie für das Theme selbst: Wer den Vault öffnet, sieht dieselben Einstellungen. Das Plugin ist pro Vault zu installieren und zu aktivieren — und Freigaben durch den Administrator gelten wie bei allen Plugins.

> [!info] Gilt für alle Nutzer des Vaults
> Stellt eine Person eine Überschriftengröße um, sehen es alle, die den Vault geöffnet haben. Ob die Oberfläche hell oder dunkel ist, entscheidet weiterhin jeder selbst.

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Plugin lädt und aktiviert | Funktioniert |
| Einstellungsseite mit Abschnitten, Suche, Import/Export | Funktioniert |
| Variablen (Farben, Größen, Schriften) | Funktioniert |
| Wechsel des Vault-Themes aktualisiert die Abschnitte | Funktioniert |
| Klassen-Schalter | Teilweise — nur wo Slatebase das Element hat |
| Optionen für Tabs, Seitenleisten, Titelzeile | Ohne Wirkung — Slatebase hat diese Obsidian-Struktur nicht |
| Wirkung auf die Leseansicht | Nicht vorhanden — Slatebase hat keine eigene Leseansicht |

---

> [!tip] Zuerst Variablen ausprobieren
> Wenn eine Option nichts bewirkt, liegt es meist daran, dass sie nur eine Klasse umschaltet. Farb-, Größen- und Schrift-Optionen sind die zuverlässigsten.

> [!todo] Übung
> 1. Installiere und aktiviere das Style-Settings-Plugin
> 2. Wähle unter **Einstellungen → Themes** ein Theme mit Einstellungen (zum Beispiel *Minimal*)
> 3. Öffne die Einstellungen von Style Settings und suche nach `h1`
> 4. Ändere die Größe der Überschrift 1 und öffne eine Notiz mit einer Überschrift
> 5. Setze den Wert zurück und exportiere deine Einstellungen als Sicherung

---

## Verwandte Features

- [[Features/Themes]] — Themes auswählen, importieren und im Katalog finden
- [[Features/CSS-Snippets]] — Eigenes CSS zusätzlich zum Theme
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
