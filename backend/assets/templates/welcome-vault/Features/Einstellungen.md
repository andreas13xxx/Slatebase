---
tags: [features]
---

# Einstellungen

Die Einstellungen in Slatebase sind zentral in einem übersichtlichen Panel organisiert. Du erreichst alle Konfigurationsoptionen über ein Tastenkürzel — von persönlichen Profilangaben bis zu Vault-spezifischen Einstellungen.

![[Screenshots/settings-panel.png]]

*Das Einstellungs-Panel mit kategorisierter Navigation*

---

## Einstellungen öffnen

- **Tastenkürzel:** `Ctrl+,` (Komma) — öffnet das Settings-Panel sofort
- **Command Palette:** `Ctrl+P` → "Einstellungen öffnen"
- **Nutzerprofil-Menü:** Klick auf den Avatar oben rechts → "Einstellungen"
- **Schließen:** `Escape`-Taste oder Klick außerhalb des Panels

---

## Übersicht der Bereiche

Das Settings-Panel hat eine Sidebar-Navigation mit Kategorien und Abschnitten:

### Konto

| Abschnitt | Inhalt |
|-----------|--------|
| Profil | Anzeigename, Benutzername (read-only) |
| Passwort | Passwort ändern (aktuelles + neues) |
| Sprache | Bevorzugte Sprache (DE/EN), bestimmt UI und Welcome-Vault-Sprache |
| Anleitungs-Vault | Button zum nachträglichen Erstellen des Anleitungs-Vaults |
| Darstellung | Statusleiste (global + pro Element) ein-/ausblenden, CSS-Snippets verwalten |
| Tastenkürzel | Benutzerdefinierte Tastenkombinationen (Keybindings) |
| Account löschen | Eigenen Account permanent entfernen |

### Vault-Konfiguration

Diese Abschnitte sind nur sichtbar, wenn ein Vault geöffnet ist (und du der Besitzer bist):

| Abschnitt | Inhalt |
|-----------|--------|
| Vorlagen-Verzeichnis | Pfad zum Template-Ordner (Standard: `Templates`) |
| Daily-Notes-Verzeichnis | Pfad für tägliche Notizen (Standard: Vault-Root) |

### Administration (nur Admins)

| Abschnitt | Inhalt |
|-----------|--------|
| Benutzerverwaltung | Nutzer anlegen, sperren, löschen, Rollen |
| Server-Konfiguration | Globale Einstellungen |
| Feature-Toggles | Features aktivieren/deaktivieren |
| Audit-Log | Sicherheitsprotokoll einsehen |
| Server neustarten | Server-Neustart mit Bestätigung |

---

## Profil bearbeiten

1. Öffne Einstellungen (`Ctrl+,`)
2. Navigiere zu "Profil"
3. Ändere deinen Anzeigenamen
4. Klicke "Speichern"

Der Benutzername (Login-Name) kann nicht nachträglich geändert werden.

---

## Passwort ändern

1. Öffne Einstellungen (`Ctrl+,`) → "Passwort"
2. Gib dein aktuelles Passwort ein
3. Gib das neue Passwort ein (Mindestlänge: 8 Zeichen)
4. Bestätige das neue Passwort
5. Klicke "Passwort ändern"

---

## Darstellung

### Statusleiste

Die Statusleiste am unteren Rand der Anwendung zeigt mehrere Informationen gleichzeitig:

| Element | Zeigt |
|---------|-------|
| Uhr | Aktuelle Uhrzeit |
| Vault-Name | Name des geöffneten Vaults |
| Wort-/Zeichenanzahl | Anzahl Wörter und Zeichen der aktiven Datei; bei markiertem Text zusätzlich die Auswahlgröße |
| Cursor-Position | Zeile:Spalte des Cursors — ein Klick darauf öffnet "Gehe zu Zeile" |

- **Global ein-/ausschalten:** Einstellungen → Darstellung → "Statusleiste anzeigen"
- **Einzelne Elemente ein-/ausblenden:** Direkt darunter hat jedes Element einen eigenen Schalter — so zeigst du z.B. nur die Wortanzahl, ohne Uhr und Cursor-Position
- Plugin-Statusanzeigen (falls die Obsidian-Plugin-Kompatibilität aktiv ist) erscheinen zusätzlich am rechten Rand der Leiste

> [!info] Ausführlicher Guide
> Alle Details zur Statusleiste (Gehe zu Zeile, Auswahl-Statistik, Plugin-Items) findest du unter [[Features/Statusleiste|Statusleiste]].

### CSS-Snippets

Passe das Erscheinungsbild von Slatebase mit eigenem CSS an — pro Vault gespeichert und verwaltet unter Einstellungen → Darstellung → "CSS-Snippets":

1. **Hochladen** — eine bestehende `.css`-Datei auswählen (max. 512 KB)
2. **Neu erstellen** — Namen vergeben, Inhalt direkt im eingebetteten Editor schreiben
3. **Aktivieren/Deaktivieren** — Schalter neben jedem Snippet; die Änderung wirkt sofort, ohne Neuladen der Seite
4. **Bearbeiten** — Stift-Symbol öffnet den Editor erneut
5. **Löschen** — Papierkorb-Symbol, mit Bestätigungsabfrage

Aktivierte Snippets werden automatisch angewendet, sobald du den Vault öffnest oder wechselst — im Gegensatz zu Plugin-CSS wirken sie global (z.B. `body { }`- oder `:root {}`-Regeln), nicht nur auf eine einzelne Plugin-Oberfläche.

> [!tip] Idee für den Einstieg
> Erstelle ein Snippet mit `:root { --accent: #ff6b6b; }`, um die Akzentfarbe der Oberfläche zu ändern (die genauen Variablennamen findest du über die Browser-Entwicklertools).

### Theme (Dark/Light Mode)

Das Theme lässt sich über die Command Palette umschalten:
- `Ctrl+P` → "Dark Mode" oder "Light Mode"

---

## Vault-Konfiguration

Diese Einstellungen gelten pro Vault und sind nur für den Vault-Besitzer änderbar:

### Vorlagen-Verzeichnis

- **Standard:** `Templates`
- **Zweck:** Hier sucht Slatebase nach Vorlage-Dateien für "Neu aus Vorlage"
- **Ändern:** Gib einen Ordnernamen ein, der im Vault existiert (oder erstellt wird)

### Daily-Notes-Verzeichnis

- **Standard:** Vault-Stammverzeichnis (leerer Wert)
- **Zweck:** Hier werden tägliche Notizen (YYYY-MM-DD.md) abgelegt
- **Empfehlung:** Ein dedizierter Ordner wie `Tägliche Notizen`

---

## Tastenkürzel (Keybindings)

Slatebase bietet konfigurierbare Tastenkürzel für häufig genutzte Befehle:

### Keybindings bearbeiten

1. Öffne Einstellungen → "Tastenkürzel"
2. Die Tabelle zeigt alle konfigurierbaren Befehle mit dem aktuellen Kürzel
3. Klicke auf ein Kürzel, um es zu ändern
4. Drücke die neue Tastenkombination
5. Bei Konflikten wird eine Warnung angezeigt

### Beispiel-Keybindings

| Befehl | Standard |
|--------|----------|
| Einstellungen | `Ctrl+,` |
| Command Palette | `Ctrl+P` |
| Suche | `Ctrl+Shift+F` |
| Tägliche Notiz | — (nicht belegt) |
| Speichern | `Ctrl+S` |

### Mod-Key

`Mod` steht in der Dokumentation für den plattformabhängigen Modifikator:
- Windows/Linux: `Ctrl`
- Mac: `Cmd`

---

## Feature-Toggles (Admin)

Administratoren können einzelne Features für alle Nutzer aktivieren oder deaktivieren. Slatebase hat aktuell drei registrierte Toggles:

| Feature | Standard | Typ | Beschreibung |
|---------|----------|-----|--------------|
| `chat` | aktiv | Hot | Chat-Funktion |
| `mcp` | aktiv | Cold | MCP Context Server |
| `obsidian-plugin-compat` | **inaktiv** | Cold | Obsidian-Plugin-Kompatibilität |

Nur `chat` ist ein Hot-Toggle und wirkt sofort. `mcp` und `obsidian-plugin-compat` sind Cold-Toggles und erfordern einen Server-Neustart. Details siehe [[Admin/Feature-Toggles]].

---

## Suche in den Einstellungen

Das Settings-Panel bietet ein Suchfeld in der Sidebar:

- Tippe einen Begriff (z.B. "Passwort" oder "Template")
- Die Navigation filtert sich auf passende Abschnitte
- Klicke auf das Ergebnis, um direkt dorthin zu springen

---

## Praktisches Beispiel

Personalisiere deine Slatebase-Instanz:

1. Öffne die Einstellungen mit `Ctrl+,`
2. Ändere deinen Anzeigenamen unter "Profil"
3. Wechsle zu "Darstellung" und schalte die Statusleiste ein
4. Gehe zu "Vault-Konfiguration" und setze ein Daily-Notes-Verzeichnis (z.B. `Journal`)
5. Prüfe unter "Tastenkürzel" die verfügbaren Shortcuts

---

> [!tip] Ctrl+, merken
> Das Kürzel `Ctrl+,` ist der schnellste Weg zu den Einstellungen — wie in vielen anderen Editoren (VS Code, Browser). Merk dir dieses eine Kürzel, und du erreichst alle Konfigurationsoptionen in einer Sekunde.

> [!tip] Vault-Config nur für Besitzer
> Nur der Vault-Besitzer kann die Vault-Konfiguration ändern. Wenn du einen geteilten Vault nutzt, siehst du den Abschnitt "Vault-Konfiguration" nicht in den Einstellungen.

> [!todo] Übung
> 1. Öffne die Einstellungen mit `Ctrl+,`
> 2. Nutze das Suchfeld in der Sidebar — suche nach "Passwort"
> 3. Navigiere zu "Tastenkürzel" und sieh dir die verfügbaren Befehle an
> 4. Konfiguriere ein Daily-Notes-Verzeichnis unter "Vault-Konfiguration"
> 5. Schließe die Einstellungen mit `Escape`

---

## Verwandte Features

- [[Features/Command Palette]] — Alternativer Weg zu den Einstellungen
- [[Features/CSS-Snippets]] — Detailguide zu eigenem CSS pro Vault
- [[Features/Lesezeichen]] — Lesezeichen-Ansicht, ebenfalls über die Seitenleiste erreichbar
- [[Features/Vorlagen und Daily Notes]] — Templates-Verzeichnis konfigurieren
- [[Fortgeschritten/Tastenkürzel anpassen]] — Detailguide zu Keybindings
- [[Features/Chat]] — Feature-Toggle `chat` in den Admin-Einstellungen
