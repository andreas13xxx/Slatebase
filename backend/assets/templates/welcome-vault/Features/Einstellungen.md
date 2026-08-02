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
| Darstellung | Statusleiste ein-/ausblenden |
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

Die Statusleiste am unteren Rand der Anwendung zeigt die Uhrzeit und erweiterte Informationen:

- **Einschalten:** Einstellungen → Darstellung → "Statusleiste anzeigen" aktivieren
- **Ausschalten:** Toggle deaktivieren

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

Administratoren können einzelne Features für alle Nutzer aktivieren oder deaktivieren:

| Feature | Standard | Beschreibung |
|---------|----------|--------------|
| `chat` | aktiv | Chat-Funktion |
| `vault-sync` | aktiv | Vault-Synchronisation |
| `knowledge-graph` | aktiv | Knowledge Graph |
| `welcome-vault` | aktiv | Anleitungs-Vault bei Registrierung |
| `mcp` | aktiv | MCP Context Server |
| `obsidian-plugin-compat` | aktiv | Obsidian-Plugin-Kompatibilität |

Feature-Toggles wirken sofort (Hot-Toggles) — kein Server-Neustart nötig.

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
- [[Features/Vorlagen und Daily Notes]] — Templates-Verzeichnis konfigurieren
- [[Fortgeschritten/Tastenkürzel anpassen]] — Detailguide zu Keybindings
- [[Features/Chat]] — Feature-Toggle `chat` in den Admin-Einstellungen
