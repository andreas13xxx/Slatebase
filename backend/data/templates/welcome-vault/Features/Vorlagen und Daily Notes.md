---
tags: [features]
---

# Vorlagen und Daily Notes

Vorlagen (Templates) beschleunigen das Erstellen neuer Notizen mit vordefinierter Struktur. Daily Notes bieten einen schnellen Einstieg in die tägliche Dokumentation — eine Notiz pro Tag, automatisch benannt.

![[Screenshots/template-auswahl.png]]

*Die Vorlagen-Auswahl beim Erstellen einer neuen Datei*

---

## Template-Verzeichnis

Vorlagen werden in einem konfigurierbaren Verzeichnis im Vault gespeichert:

- **Standard:** `Templates/` im Vault-Stammverzeichnis
- **Konfigurierbar:** Unter Einstellungen → Vault-Konfiguration → Template-Verzeichnis
- **Format:** Jede `.md`-Datei im Verzeichnis gilt als Vorlage

Das Verzeichnis ist ein normaler Ordner — du kannst Vorlagen direkt im Editor erstellen und bearbeiten.

---

## Platzhalter

In Vorlagen kannst du dynamische Platzhalter verwenden, die beim Erstellen automatisch ersetzt werden:

| Platzhalter | Ersetzung | Beispiel |
|-------------|-----------|----------|
| `{{date}}` | Aktuelles Datum (YYYY-MM-DD) | 2025-01-15 |
| `{{time}}` | Aktuelle Uhrzeit (HH:mm) | 14:30 |
| `{{title}}` | Name der neuen Datei | Mein Meeting |

### Beispiel-Vorlage

```markdown
---
tags: [meeting]
datum: {{date}}
---

# {{title}}

**Datum:** {{date}} um {{time}}
**Teilnehmer:** 

## Agenda

1. 

## Ergebnisse

- 

## Nächste Schritte

- [ ] 
```

Wenn du diese Vorlage am 15. Januar um 14:30 mit dem Titel "Sprint Review" nutzt, werden alle Platzhalter automatisch ausgefüllt.

---

## Neue Datei aus Vorlage erstellen

1. **Kontextmenü:** Rechtsklick auf einen Ordner im Explorer → "Neu aus Vorlage"
2. **Template-Auswahl:** Ein Modal zeigt alle verfügbaren Vorlagen
3. **Dateiname eingeben:** Du wirst nach dem gewünschten Dateinamen gefragt
4. **Fertig:** Die neue Datei wird mit dem ausgefüllten Template-Inhalt erstellt

Alternativ über die Command Palette:
- `Ctrl+P` → "Neu aus Vorlage"

---

## Daily Notes

Daily Notes sind eine Sonderform der Vorlagen — eine Notiz pro Tag mit automatischem Datum als Dateiname.

### Daily Note erstellen

- **Button:** Klicke auf das Kalender-Icon in der Sidebar-Toolbar (links)
- **Command Palette:** `Ctrl+P` → "Tägliche Notiz öffnen"

### Verhalten

1. Slatebase sucht nach `YYYY-MM-DD.md` (z.B. `2025-01-15.md`) im konfigurierten Daily-Notes-Verzeichnis
2. **Existiert die Datei:** Sie wird geöffnet
3. **Existiert sie nicht:** Sie wird mit der Daily-Note-Vorlage erstellt und geöffnet

### Daily-Notes-Verzeichnis

- **Standard:** Vault-Stammverzeichnis
- **Konfigurierbar:** Einstellungen → Vault-Konfiguration → Daily-Notes-Verzeichnis
- **Empfehlung:** Ein eigener Ordner wie `Tägliche Notizen/` hält den Vault aufgeräumt

### Daily-Note-Vorlage

Wenn im Template-Verzeichnis eine Datei namens `daily.md` existiert, wird sie als Vorlage für Daily Notes verwendet. Alle Platzhalter (`{{date}}`, `{{time}}`, `{{title}}`) werden ersetzt.

---

## Praktisches Beispiel

Erstelle eine eigene Vorlage für Wochenrückblicke:

1. Erstelle die Datei `Templates/Wochenrückblick.md`:

```markdown
---
tags: [wochenrückblick]
woche: {{date}}
---

# Wochenrückblick — {{date}}

## Was lief gut?

- 

## Was war schwierig?

- 

## Nächste Woche

- [ ] 
```

2. Nutze dann "Neu aus Vorlage" → wähle "Wochenrückblick"
3. Gib als Dateinamen z.B. "KW 03 Rückblick" ein
4. Die Platzhalter werden automatisch mit dem aktuellen Datum gefüllt

---

> [!tip] Daily Notes als Gewohnheit
> Daily Notes eignen sich hervorragend als täglicher Einstiegspunkt. Starte jeden Tag mit einer kurzen Notiz — Gedanken, Aufgaben, Ideen. Über die Zeit entsteht ein Tagebuch deiner Arbeit, das über die Suche und den Knowledge Graph durchsuchbar bleibt.

> [!todo] Übung
> 1. Öffne den Ordner `Vorlagen/` in diesem Vault — dort findest du Beispielvorlagen
> 2. Erstelle eine Daily Note über den Button in der Sidebar (Kalender-Icon)
> 3. Erstelle eine neue Datei über "Neu aus Vorlage" und wähle "Meeting-Protokoll"
> 4. Prüfe, ob die Platzhalter `{{date}}` und `{{time}}` korrekt ersetzt wurden

---

## Verwandte Features

- [[Features/Einstellungen]] — Vault-Konfiguration für Template- und Daily-Notes-Verzeichnis
- [[Features/Command Palette]] — Schnellzugriff auf "Tägliche Notiz öffnen"
- [[Grundlagen/Datei-Explorer]] — Kontextmenü für "Neu aus Vorlage"
- [[Features/Tags und Properties]] — Frontmatter in Vorlagen nutzen
