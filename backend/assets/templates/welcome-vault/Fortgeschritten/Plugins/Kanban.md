---
tags: [fortgeschritten, plugins]
---

# Kanban Plugin

Das Kanban-Plugin verwandelt Markdown-Dateien in visuelle Kanban-Boards. Du organisierst Aufgaben in Spalten (z.B. "To Do", "In Arbeit", "Erledigt") und verschiebst Karten per Drag & Drop.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Kanban-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `obsidian-kanban`

---

## Installation

1. Plugin-ZIP von GitHub herunterladen
2. Einstellungen → Vault → Plugins → "Plugin installieren"
3. ZIP hochladen → Aktivieren

---

## Board erstellen

### Über die Command Palette

1. `Ctrl+P` → "Kanban: Neues Board erstellen"
2. Dateinamen eingeben (z.B. `Projekt-Board`)
3. Das Board öffnet sich in der Kanban-Ansicht

### Manuell (Markdown)

Erstelle eine `.md`-Datei mit folgendem Format:

```markdown
---
kanban-plugin: basic
---

## To Do

- [ ] Recherche durchführen
- [ ] Stakeholder identifizieren
- [ ] Budget erstellen

## In Arbeit

- [ ] Projektplan schreiben
- [ ] Team zusammenstellen

## Erledigt

- [x] Kickoff-Meeting abhalten
- [x] Repository einrichten
```

> [!tip] Dateiformat
> Kanban-Boards sind normale Markdown-Dateien mit dem Frontmatter-Feld `kanban-plugin: basic`. Du kannst sie jederzeit als Text bearbeiten oder im Kanban-View anzeigen.

---

## Board-Bedienung

### Karten

| Aktion | Beschreibung |
|--------|--------------|
| Karte erstellen | "+" Button unten in der Spalte |
| Karte bearbeiten | Klick auf den Kartentext |
| Karte verschieben | Drag & Drop zwischen Spalten |
| Karte löschen | Kontextmenü oder Checkbox entfernen |

### Spalten

| Aktion | Beschreibung |
|--------|--------------|
| Spalte hinzufügen | "+" Button rechts |
| Spalte umbenennen | Klick auf den Spaltentitel |
| Spalte verschieben | Drag & Drop der Spalte |

---

## Beispiel: Projekt-Management-Board

```markdown
---
kanban-plugin: basic
---

## Backlog

- [ ] Feature A: Nutzerprofile erweitern
- [ ] Feature B: Export-Funktion
- [ ] Bug: Login-Redirect fehlerhaft

## Sprint aktiv

- [ ] Feature C: Dashboard-Widgets #prio-hoch
- [ ] Dokumentation aktualisieren

## In Review

- [ ] API-Refactoring #backend
- [ ] Design-Review Landing Page

## Done

- [x] Datenbankschema migrieren
- [x] CI/CD Pipeline einrichten
- [x] Onboarding-Flow implementieren
```

---

## Beispiel: Persönliches Aufgabenboard

```markdown
---
kanban-plugin: basic
---

## Diese Woche

- [ ] Arzttermin vereinbaren
- [ ] Steuererklärung vorbereiten
- [ ] Geburtstagsgeschenk besorgen

## Irgendwann

- [ ] Wohnung aufräumen
- [ ] Neues Buch anfangen
- [ ] Keller entrümpeln

## Warte auf

- [ ] Antwort vom Vermieter
- [ ] Paket-Lieferung

## Erledigt

- [x] Einkaufen
- [x] Auto waschen
```

---

## Beispiel: Content-Planung

```markdown
---
kanban-plugin: basic
---

## Ideen

- [ ] Blogartikel: "10 Tipps für Markdown"
- [ ] Video: Vault-Organisation Tutorial
- [ ] Podcast-Episode: Wissensmanagement

## In Recherche

- [ ] Blogartikel: "API-Design Best Practices" #recherche

## Entwurf

- [ ] Newsletter KW12

## Veröffentlicht

- [x] Blogartikel: "Slatebase Einführung"
- [x] Newsletter KW11
```

---

## Markdown-Integration

Da Kanban-Boards Markdown sind, kannst du sie mit anderen Slatebase-Features kombinieren:

### Wikilinks in Karten

```markdown
- [ ] [[Projekte/API-Redesign|API-Redesign]] abschließen
```

### Tags zur Filterung

```markdown
- [ ] Design fertigstellen #design #prio-hoch
- [ ] Backend-API #backend
```

### Embeds

Du kannst ein Kanban-Board in andere Notizen einbetten:
```markdown
Aktueller Sprint-Status:
![[Projekt-Board]]
```

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Board erstellen und bearbeiten | Funktioniert |
| Karten per Drag & Drop | Funktioniert |
| Spalten hinzufügen/bearbeiten | Funktioniert |
| Markdown-Bearbeitung | Funktioniert |
| Datums-Picker in Karten | Eingeschränkt |
| Karten-Metadaten (Tags, Dates) | Text-basiert |

---

> [!tip] Board als Projektübersicht
> Erstelle für jedes Projekt ein Kanban-Board und verlinke es von der Projekt-Übersichtsnotiz. So hast du immer den aktuellen Status im Blick.

> [!todo] Übung
> 1. Installiere und aktiviere das Kanban-Plugin
> 2. Erstelle ein neues Board über die Command Palette (`Ctrl+P` → "Kanban")
> 3. Füge drei Spalten hinzu: "To Do", "In Arbeit", "Erledigt"
> 4. Erstelle 5 Karten in "To Do"
> 5. Verschiebe 2 Karten nach "In Arbeit"
> 6. Verschiebe 1 Karte nach "Erledigt"
> 7. Öffne die Datei im Source-Modus und prüfe die Markdown-Struktur
> 8. Füge einem Karteneintrag einen Wikilink hinzu (z.B. `[[Projekt-Notiz]]`)

---

## Verwandte Features

- [[Features/Canvas]] — Visuelles Board (Alternative ohne Plugin)
- [[Features/Tags und Properties]] — Tags in Karten nutzen
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
- [[Praxis/Plugins/Kanban-Board erstellen]] — Praktische Übung
