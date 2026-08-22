---
tags: [fortgeschritten, plugins]
---

# Templater Plugin

Templater erweitert das Vorlagen-System um dynamische Befehle. Statt statischer Platzhalter (`{{date}}`) kannst du JavaScript-Ausdrücke, Datums-Berechnungen und interaktive Prompts in deinen Templates verwenden.

> [!example] Live-Beispiele in diesem Vault
> Im Ordner `Vorlagen/Templater` liegen vier fertige Templater-Vorlagen, die du nach der Installation sofort ausprobieren kannst:
> - [[Vorlagen/Templater/Tägliche Notiz (Templater)]]
> - [[Vorlagen/Templater/Meeting-Protokoll (Templater)]]
> - [[Vorlagen/Templater/Wochenreview (Templater)]]
> - [[Vorlagen/Templater/Projekt-Vorlage (Templater)]]
>
> Setze in den Templater-Plugin-Einstellungen den Templates-Ordner auf `Vorlagen/Templater` und erstelle darüber eine neue Datei — alle `<% ... %>`-Ausdrücke unten werden live ausgewertet.

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Templater-Plugin installiert und aktiviert
- Plugin-ZIP von GitHub: `templater-obsidian`
- Templates-Verzeichnis konfiguriert (Einstellungen → Vault)

---

## Installation

1. **Plugin-Verwaltung** → Tab **"Verfügbare Plugins"** öffnen und nach "Templater" suchen
2. **Installieren** klicken, dann den **Aktivierungs-Schalter** einschalten
3. In den Plugin-Einstellungen: Templates-Ordner setzen

Nicht gelistet, oder ein bestimmter Fork/eine bestimmte Version nötig? Stattdessen die Plugin-ZIP von GitHub herunterladen und unter **"Installierte Plugins" → Plugin hochladen** verwenden.

---

## Grundsyntax

Templater nutzt spezielle Delimiter:

| Syntax | Beschreibung |
|--------|--------------|
| `<% tp.date.now() %>` | Ausdruck auswerten und einfügen |
| `<% tp.file.title %>` | Dateititel einfügen |
| `<%* ... %>` | Code ausführen (kein Output) |

---

## Datums-Funktionen

### Aktuelles Datum

```markdown
Erstellt: <% tp.date.now("YYYY-MM-DD") %>
```

Ergebnis: `Erstellt: 2025-01-15`

### Relatives Datum

```markdown
Gestern: <% tp.date.now("YYYY-MM-DD", -1) %>
Morgen: <% tp.date.now("YYYY-MM-DD", 1) %>
Nächste Woche: <% tp.date.now("YYYY-MM-DD", 7) %>
```

### Formatierung

| Format | Ergebnis |
|--------|----------|
| `YYYY-MM-DD` | 2025-01-15 |
| `DD.MM.YYYY` | 15.01.2025 |
| `dddd, DD. MMMM YYYY` | Mittwoch, 15. Januar 2025 |
| `HH:mm` | 14:30 |
| `YYYY-[W]ww` | 2025-W03 |

---

## Datei-Funktionen

```markdown
Dateiname: <% tp.file.title %>
Ordner: <% tp.file.folder() %>
Erstelldatum: <% tp.file.creation_date("YYYY-MM-DD") %>
```

---

## Beispiel: Erweiterte Daily Note

```markdown
---
tags: [journal, daily]
created: <% tp.date.now("YYYY-MM-DD") %>
weekday: <% tp.date.now("dddd") %>
week: <% tp.date.now("YYYY-[W]ww") %>
---

# <% tp.date.now("dddd, DD. MMMM YYYY") %>

## Tagesplanung

### Top 3 Prioritäten
1. 
2. 
3. 

### Termine heute
- 

## Notizen

## Tagesrückblick

### Was lief gut?
- 

### Was kann ich morgen besser machen?
- 

---

*Gestern: [[<% tp.date.now("YYYY-MM-DD", -1) %>]] | Morgen: [[<% tp.date.now("YYYY-MM-DD", 1) %>]]*
```

---

## Beispiel: Meeting-Protokoll mit Prompt

```markdown
---
tags: [meeting]
date: <% tp.date.now("YYYY-MM-DD") %>
time: <% tp.date.now("HH:mm") %>
---

# Meeting: <% tp.file.title %>

**Datum:** <% tp.date.now("DD.MM.YYYY") %> um <% tp.date.now("HH:mm") %>
**Ort:** 

## Teilnehmer

- 

## Agenda

1. 

## Beschlüsse

| Nr. | Beschluss | Verantwortlich | Deadline |
|-----|-----------|----------------|----------|
| 1 | | | |

## Action Items

- [ ] 

## Nächster Termin

---

*Erstellt aus Vorlage am <% tp.date.now("DD.MM.YYYY, HH:mm") %>*
```

---

## Beispiel: Wochenreview

```markdown
---
tags: [review, wöchentlich]
week: <% tp.date.now("YYYY-[W]ww") %>
from: <% tp.date.now("YYYY-MM-DD", -6) %>
to: <% tp.date.now("YYYY-MM-DD") %>
---

# Wochenreview <% tp.date.now("YYYY-[W]ww") %>

*<% tp.date.now("DD.MM.", -6) %> – <% tp.date.now("DD.MM.YYYY") %>*

## Rückblick

### Was habe ich erreicht?
- 

### Was blieb offen?
- 

### Was habe ich gelernt?
- 

## Nächste Woche

### Prioritäten
1. 
2. 
3. 

### Termine
- 

---

**Tagesnotizen der Woche:**
- [[<% tp.date.now("YYYY-MM-DD", -6) %>]]
- [[<% tp.date.now("YYYY-MM-DD", -5) %>]]
- [[<% tp.date.now("YYYY-MM-DD", -4) %>]]
- [[<% tp.date.now("YYYY-MM-DD", -3) %>]]
- [[<% tp.date.now("YYYY-MM-DD", -2) %>]]
- [[<% tp.date.now("YYYY-MM-DD", -1) %>]]
- [[<% tp.date.now("YYYY-MM-DD") %>]]
```

---

## Beispiel: Projekt-Template

```markdown
---
tags: [projekt]
status: planung
created: <% tp.date.now("YYYY-MM-DD") %>
deadline: 
priority: mittel
---

# <% tp.file.title %>

## Zusammenfassung

## Ziele

- [ ] 

## Meilensteine

| Meilenstein | Deadline | Status |
|-------------|----------|--------|
| | | ⏳ |

## Ressourcen

- 

## Notizen

---

*Projekt erstellt am <% tp.date.now("DD.MM.YYYY") %>*
```

---

## Templater verwenden

### Neue Datei aus Template

1. `Ctrl+P` → "Templater: Neue Datei aus Vorlage"
2. Template auswählen
3. Dateinamen eingeben
4. Templater ersetzt alle `<% ... %>`-Ausdrücke

### In bestehende Datei einfügen

1. Öffne eine leere Datei
2. `Ctrl+P` → "Templater: Vorlage einfügen"
3. Template auswählen
4. Inhalt wird an Cursor-Position eingefügt

---

## Unterschied zu Slatebase-Vorlagen

| Feature | Slatebase-Vorlagen | Templater |
|---------|-------------------|-----------|
| Platzhalter | `{{date}}`, `{{time}}`, `{{title}}` | Volle JavaScript-Syntax |
| Datumsberechnung | Nein | Ja (`+1`, `-7` etc.) |
| Dateiname als Variable | `{{title}}` | `tp.file.title` |
| Bedingte Logik | Nein | Ja (JavaScript) |
| Prompts (Nutzereingabe) | Nein | Eingeschränkt in Slatebase |
| Ohne Plugin | Ja | Nein |

---

## Einschränkungen in Slatebase

| Feature | Status |
|---------|--------|
| Datums-Funktionen | Funktioniert |
| Datei-Funktionen | Funktioniert |
| Template-Insertion | Funktioniert |
| User-Prompts | Eingeschränkt |
| System-Commands | Nicht unterstützt |
| Folder Templates (Auto) | Nicht unterstützt |

---

> [!tip] Templater + Calendar
> Kombiniere Templater mit dem Calendar-Plugin: Setze eine Templater-basierte Daily-Note-Vorlage. Jeder Klick im Kalender erstellt eine Notiz mit dynamisch berechneten Daten.

> [!todo] Übung
> 1. Installiere und aktiviere das Templater-Plugin
> 2. Setze den Templates-Ordner in den Plugin-Einstellungen auf `Vorlagen/Templater`
> 3. Erstelle eine neue Datei aus [[Vorlagen/Templater/Tägliche Notiz (Templater)]] (`Ctrl+P` → "Templater")
> 4. Prüfe, dass die Datums-Platzhalter korrekt ersetzt wurden
> 5. Probiere auch [[Vorlagen/Templater/Meeting-Protokoll (Templater)]] und [[Vorlagen/Templater/Wochenreview (Templater)]] aus
> 6. Erstelle danach eine eigene Vorlage `Vorlagen/Templater/eigene-vorlage.md` mit `tp.date.now()` und `tp.file.title`
> 7. Teste relative Daten: Gestern, Morgen, nächste Woche

---

## Verwandte Features

- `Vorlagen/Templater` — Live-Beispielvorlagen zum Ausprobieren
- [[Features/Vorlagen und Daily Notes]] — Slatebase-eigene Vorlagen
- [[Fortgeschritten/Plugins/Calendar]] — Kalender mit Templater-Integration
- [[Features/Command Palette]] — Templater-Commands
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
