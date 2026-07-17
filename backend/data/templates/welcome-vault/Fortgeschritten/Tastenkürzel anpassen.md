---
tags: [fortgeschritten]
---

# Tastenkürzel anpassen

Slatebase bietet konfigurierbare Tastenkürzel, die du an deinen persönlichen Workflow anpassen kannst. Dieser Guide zeigt dir, wie du Shortcuts aufnimmst, Konflikte erkennst und die Standardbelegung wiederherstellst.

---

## Keybindings-Einstellungen öffnen

1. Öffne die Einstellungen mit `Ctrl+,`
2. Navigiere zu **Konto → Tastenkürzel**
3. Du siehst eine Tabelle aller konfigurierbaren Befehle

Alternativ: Command Palette (`Ctrl+P`) → "Tastenkürzel" eingeben.

---

## Aufbau der Keybindings-Tabelle

| Spalte | Beschreibung |
|--------|--------------|
| Befehl | Name der Aktion (z.B. "Vault-weite Suche") |
| Aktuelles Kürzel | Der derzeit zugewiesene Shortcut |
| Standard | Der ursprüngliche Standard-Shortcut |
| Aktion | Button zum Aufnehmen oder Zurücksetzen |

---

## Shortcut aufnehmen (Recording)

So weist du einem Befehl ein neues Tastenkürzel zu:

1. Klicke auf **"Aufnehmen"** neben dem gewünschten Befehl
2. Der Button wechselt in den Aufnahme-Modus (visueller Indikator)
3. Drücke die gewünschte Tastenkombination (z.B. `Ctrl+Shift+G`)
4. Das neue Kürzel wird sofort übernommen und gespeichert

### Abbrechen

- Drücke `Escape` während der Aufnahme, um abzubrechen
- Das bisherige Kürzel bleibt unverändert

---

## Der Mod-Key (plattformabhängig)

Slatebase verwendet `Mod` als plattformunabhängigen Modifier:

| Plattform | Mod-Taste |
|-----------|-----------|
| Windows / Linux | `Ctrl` |
| macOS | `Cmd` (⌘) |

In der Anzeige siehst du immer die plattformspezifische Taste. Intern speichert Slatebase `Mod+...`, damit deine Konfiguration portabel bleibt.

### Verfügbare Modifier

```
Mod (Ctrl/Cmd)    — Primärer Modifier
Shift             — Zusätzlicher Modifier
Alt               — Alternativer Modifier
```

Du kannst Modifier kombinieren: `Mod+Shift+P`, `Mod+Alt+N`, etc.

---

## Konflikterkennung

Slatebase erkennt automatisch, wenn du ein Kürzel zuweist, das bereits von einem anderen Befehl belegt ist.

### Was passiert bei einem Konflikt?

1. Du nimmst ein neues Kürzel auf
2. Slatebase prüft gegen alle bestehenden Belegungen
3. Falls Konflikt: Warnung mit dem Namen des belegten Befehls
4. Du entscheidest:
   - **Überschreiben:** Neues Kürzel wird zugewiesen, altes wird entfernt
   - **Abbrechen:** Keine Änderung

> [!warning] Browser-Shortcuts
> Einige Tastenkombinationen sind vom Browser reserviert (z.B. `Ctrl+T` für neuen Tab, `Ctrl+W` zum Schließen). Diese können nicht überschrieben werden. Slatebase zeigt einen Hinweis, falls du einen solchen Shortcut wählst.

---

## Konfigurierbare Befehle

Folgende Befehle können mit eigenen Kürzeln belegt werden:

| Standard-Kürzel | Befehl |
|-----------------|--------|
| `Ctrl+Shift+F` | Vault-weite Suche öffnen |
| `Ctrl+P` | Command Palette öffnen |
| `Ctrl+,` | Einstellungen öffnen |
| `Ctrl+N` | Neue Datei erstellen |
| `Ctrl+Shift+N` | Neuen Ordner erstellen |
| `Ctrl+S` | Datei speichern |
| `Ctrl+Z` | Rückgängig machen |
| `Ctrl+Shift+Z` | Wiederherstellen |
| `Ctrl+B` | Fett formatieren |
| `Ctrl+I` | Kursiv formatieren |
| `Ctrl+K` | Link einfügen |
| `Ctrl+E` | Zwischen Edit/View wechseln |
| `Ctrl+W` | Aktiven Tab schließen |
| `Ctrl+G` | Knowledge Graph öffnen |

---

## Auf Standardwerte zurücksetzen

### Einzelnen Befehl zurücksetzen

1. Klicke auf das **Reset-Symbol** neben dem Befehl
2. Das Kürzel wird auf den Standard zurückgesetzt

### Alle Kürzel zurücksetzen

1. Scrolle zum Ende der Keybindings-Tabelle
2. Klicke auf **"Alle zurücksetzen"**
3. Bestätige im Dialog
4. Alle Kürzel werden auf die Werksvorgaben zurückgesetzt

> [!tip] Vor dem Zurücksetzen
> Notiere dir deine benutzerdefinierten Kürzel, bevor du alles zurücksetzt. Es gibt aktuell keine Export-Funktion für Keybindings.

---

## Praktisches Beispiel

**Szenario:** Du möchtest den Knowledge Graph mit `Ctrl+G` öffnen (statt den Standard-Shortcut zu nutzen) und die Suche mit `Ctrl+F` statt `Ctrl+Shift+F`.

1. Öffne Einstellungen → Tastenkürzel
2. Finde "Knowledge Graph öffnen"
3. Klicke "Aufnehmen" → drücke `Ctrl+G`
4. Finde "Vault-weite Suche"
5. Klicke "Aufnehmen" → drücke `Ctrl+F`
6. Falls Konflikt-Warnung: bestätige das Überschreiben

Ab sofort reagieren die neuen Kürzel.

---

## Verwandte Features

- [[Features/Command Palette]] — Befehle ohne Tastenkürzel ausführen
- [[Features/Einstellungen]] — Alle Konfigurationsmöglichkeiten
- [[Grundlagen/Navigation und Tabs]] — Standard-Tastenkürzel für Navigation
