---
tags: [features]
---

# Command Palette

Die Command Palette ist der schnellste Weg, jeden Befehl in Slatebase auszuführen. Mit einem Tastenkürzel erreichst du alle Funktionen — ohne die Maus zu benutzen oder dich durch Menüs zu klicken.

![[Screenshots/command-palette.png]]

*Die Command Palette mit Suchergebnissen*

---

## Öffnen

- **Tastenkürzel:** `Ctrl+P` (Windows/Linux) oder `Cmd+P` (Mac)
- **Immer verfügbar:** Die Command Palette funktioniert unabhängig davon, wo du dich in der Anwendung befindest — im Editor, in den Einstellungen, im Canvas oder auf jeder anderen Seite

---

## Befehle suchen

Nach dem Öffnen erscheint ein Eingabefeld mit einer Liste aller verfügbaren Befehle:

1. **Tippe einen Suchbegriff** — die Liste filtert sich sofort
2. **Fuzzy-Matching** — du musst nicht den exakten Namen treffen (z.B. "dn" findet "Tägliche Notiz")
3. **Ergebnisse** werden nach Relevanz sortiert

### Beispiel-Suche

| Eingabe | Findet |
|---------|--------|
| `graph` | Knowledge Graph öffnen |
| `dark` | Dark Mode umschalten |
| `vault` | Alle Vault-bezogenen Befehle |
| `täg` | Tägliche Notiz öffnen |
| `sync` | Sync-Seite öffnen |

---

## Keyboard-Navigation

Die Command Palette ist vollständig per Tastatur bedienbar:

| Taste | Aktion |
|-------|--------|
| `↑` / `↓` | Durch Ergebnisse navigieren |
| `Enter` | Ausgewählten Befehl ausführen |
| `Escape` | Palette schließen |
| Buchstaben | Suchfilter verfeinern |

Der aktuell markierte Befehl wird visuell hervorgehoben. Du kannst schnell durch die Liste navigieren und mit `Enter` bestätigen — alles ohne Maus.

---

## Befehlskategorien

Die verfügbaren Befehle sind in Kategorien organisiert:

### Navigation

- Zur Startseite
- Chat öffnen
- Einstellungen öffnen
- Knowledge Graph öffnen
- Sync-Seite öffnen

### Vault-Operationen

- Tägliche Notiz öffnen
- Neu aus Vorlage
- Anleitungs-Vault erstellen
- Vault importieren/exportieren

### Editor-Formatierung

- Überschrift (H1–H6) einfügen
- Fett / Kursiv / Code
- Liste (ungeordnet / geordnet / Aufgabe)
- Link / Bild einfügen
- Horizontale Linie
- Callout einfügen

### Ansicht

- Dark/Light Mode umschalten
- Statusleiste ein-/ausblenden
- Zwischen Edit-/View-Modus wechseln

### Administration (nur für Admins)

- Admin-Bereich öffnen
- Server neustarten

---

## Immer verfügbar

Ein wichtiger Aspekt der Command Palette: Sie ist **immer erreichbar**, egal in welchem Zustand sich die Anwendung befindet:

- Im Editor → Editor-Befehle + Navigation
- In den Einstellungen → Navigation zurück zum Editor
- Im Canvas → Canvas-Befehle + Navigation
- Auf der Chat-Seite → Navigation + allgemeine Befehle

Du musst nicht erst in einen bestimmten Bereich navigieren, um einen Befehl auszuführen.

---

## Praktisches Beispiel

Probiere folgende Abfolge in der Command Palette aus:

1. Drücke `Ctrl+P`
2. Tippe "daily" oder "täg" → wähle "Tägliche Notiz öffnen"
3. Drücke erneut `Ctrl+P`
4. Tippe "graph" → wähle "Knowledge Graph öffnen"
5. Drücke `Ctrl+P`
6. Tippe "settings" oder "einst" → wähle "Einstellungen öffnen"
7. Drücke `Ctrl+P`
8. Tippe "dark" → wechsle den Dark/Light Mode

Beachte, wie schnell du zwischen verschiedenen Bereichen wechseln kannst — alles über die Tastatur.

---

> [!tip] Muscle Memory aufbauen
> Die Command Palette wird umso mächtiger, je häufiger du sie nutzt. Nach kurzer Zeit wirst du für die meisten Aktionen reflexartig `Ctrl+P` drücken, statt mit der Maus zu navigieren. Die Fuzzy-Suche macht es einfach — du musst dir nicht die exakten Befehlsnamen merken.

> [!tip] Editor-Befehle kennen
> Über die Command Palette erreichst du auch alle Editor-Formatierungen. Statt Toolbar-Buttons zu klicken, kannst du direkt "fett", "h2" oder "liste" tippen und die Formatierung wird auf den markierten Text angewendet.

> [!todo] Übung
> 1. Öffne die Command Palette mit `Ctrl+P`
> 2. Navigiere mit den Pfeiltasten durch die Befehle
> 3. Suche nach "Dark Mode" und führe den Befehl aus
> 4. Nutze die Palette, um eine neue Datei aus einer Vorlage zu erstellen
> 5. Finde heraus, welche Editor-Formatierungsbefehle verfügbar sind

---

## Verwandte Features

- [[Features/Einstellungen]] — Tastenkürzel für die Palette konfigurieren
- [[Fortgeschritten/Tastenkürzel anpassen]] — Individuelle Keybindings
- [[Grundlagen/Editor und Viewer]] — Editor-Befehle über die Palette
- [[Features/Vorlagen und Daily Notes]] — Schnellzugriff auf Templates und Daily Notes
