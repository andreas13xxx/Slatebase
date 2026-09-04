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
> Einige Tastenkombinationen sind vom Browser reserviert (z.B. `Ctrl+T` für neuen Tab, `Ctrl+W` zum Schließen, `Ctrl+Tab` zum Tab-Wechsel im Browser selbst). Der Browser fängt diese ab, bevor die Seite sie überhaupt sieht — eine Zuweisung in Slatebase wird dadurch wirkungslos, auch ohne Konflikt-Warnung.

---

## Konfigurierbare Befehle

Folgende Befehle können mit eigenen Kürzeln belegt werden:

| Befehl | Standard-Kürzel | Kategorie |
|--------|-----------------|-----------|
| Befehlspalette öffnen | `Ctrl+P` | Navigation |
| Einstellungen öffnen | `Ctrl+,` | Navigation |
| Schnellwechsler öffnen | `Ctrl+O` | Navigation |
| Zurück navigieren | `Alt+←` | Navigation |
| Vor navigieren | `Alt+→` | Navigation |
| Nächster Tab | `Ctrl+Shift+]` | Navigation |
| Vorheriger Tab | `Ctrl+Shift+[` | Navigation |
| Seitenleiste ein-/ausblenden | — | Navigation |
| Kontextpanel ein-/ausblenden | — | Navigation |
| Werkzeugleiste ein-/ausblenden | — | Navigation |
| Farbschema umschalten | — | Navigation |
| Vault-Suche öffnen | `Ctrl+Shift+F` | Panel |
| Editor-Modus wechseln | `Ctrl+E` | Panel |
| Datei speichern | `Ctrl+S` | Editor |
| Rückgängig | `Ctrl+Z` | Editor |
| Wiederholen | `Ctrl+Shift+Z` | Editor |
| Tagesnotiz öffnen/erstellen | — | Vault |
| Neue Datei | — | Vault |
| Neue Notiz aus Vorlage | — | Vault |
| Vorlage einfügen | — | Vault |
| Zufällige Notiz öffnen | — | Vault |
| Knowledge Graph öffnen | — | Vault |
| Papierkorb öffnen | — | Vault |

Befehle ohne Standard-Kürzel (—) sind über die Command Palette erreichbar und können hier ein eigenes Kürzel bekommen. Auf macOS steht `Cmd` an der Stelle von `Ctrl`.

> [!info] Fett, Kursiv, Link einfügen
> Formatierungsbefehle wie Fett, Kursiv und Link einfügen sind über die Command Palette (`Ctrl+P`) erreichbar, haben aber kein Standard-Tastenkürzel und sind nicht Teil der konfigurierbaren Keybindings-Tabelle.

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
