---
tags: [features]
---

# Sync

Mit Vault-Sync kannst du einen Vault mit einem CouchDB-Server synchronisieren. So bleiben deine Notizen über mehrere Slatebase-Instanzen oder mit Obsidian LiveSync auf dem gleichen Stand.

![[Screenshots/sync-status.png]]

*Das Sync-Status-Panel*

---

> [!warning] Experimentelles Feature
> Vault-Sync befindet sich im **experimentellen Status**. Die Funktion ist stabil genug für den täglichen Einsatz, kann aber in seltenen Fällen unerwartete Konflikte erzeugen. Erstelle vor der Einrichtung ein Backup deines Vaults (Export als ZIP). Konfigurationsänderungen an der CouchDB sollten nur mit Vorsicht vorgenommen werden.

---

## Voraussetzungen

- Ein laufender **CouchDB-Server** (Version 3.x oder höher)
- Eine Datenbank auf dem CouchDB-Server für den Vault
- Zugangsdaten (Benutzername + Passwort) mit Lese-/Schreibrecht
- Nur der **Vault-Besitzer** kann Sync konfigurieren (kein Admin-Bypass)

---

## Einrichtung per Setup-URI

Die einfachste Methode: Kopiere eine Setup-URI aus deiner CouchDB-Verwaltung oder einer anderen Slatebase-Instanz.

### Format

```
obsidian-livesync://setup?host=https://couch.example.com&database=mydb&username=user&password=pass
```

### Schritte

1. Öffne Sync-Seite (Nutzermenü → "Sync" oder `Ctrl+P` → "Sync")
2. Wähle "Setup-URI einfügen"
3. Füge die URI ein
4. Die Felder werden automatisch ausgefüllt
5. Klicke "Verbindung testen"
6. Bei Erfolg: "Sync aktivieren"

---

## Manuelle Konfiguration

Falls du keine Setup-URI hast, kannst du die Verbindung manuell einrichten:

| Feld | Beschreibung | Beispiel |
|------|--------------|----------|
| Host | CouchDB-Server-URL | `https://couch.example.com` |
| Datenbank | Name der Datenbank | `vault-arbeit` |
| Benutzername | CouchDB-Nutzer | `sync-user` |
| Passwort | CouchDB-Passwort | ••••••••• |

### Schritt-für-Schritt

1. Öffne die Sync-Seite
2. Wähle "Manuell konfigurieren"
3. Fülle alle Felder aus
4. Klicke "Verbindung testen" — prüft ob die CouchDB erreichbar ist
5. Bei Erfolg: Klicke "Sync aktivieren"

---

## CouchDB einrichten

Falls du noch keine CouchDB hast, hier die Kurzanleitung:

### Docker (empfohlen)

```bash
docker run -d --name couchdb \
  -e COUCHDB_USER=admin \
  -e COUCHDB_PASSWORD=sicheres-passwort \
  -p 5984:5984 \
  couchdb:3
```

### Datenbank erstellen

```bash
curl -X PUT http://admin:passwort@localhost:5984/meine-datenbank
```

### CORS aktivieren (für Remote-Zugriff)

In der CouchDB-Admin-Oberfläche (`http://localhost:5984/_utils/`):
- Config → `httpd` → `enable_cors` → `true`
- Config → `cors` → `origins` → deine Slatebase-Domain

---

## Ende-zu-Ende-Verschlüsselung (E2E)

Sync unterstützt optionale E2E-Verschlüsselung:

- **Aktivierung:** Checkbox "E2E-Verschlüsselung aktivieren" in der Sync-Konfiguration
- **Verschlüsselung:** AES-256-GCM — alle Dateiinhalte werden verschlüsselt übertragen
- **Schlüssel:** Wird aus einem Passphrase abgeleitet, das du bei der Einrichtung eingibst
- **Wichtig:** Alle Instanzen müssen dasselbe Passphrase verwenden

> [!tip] E2E bei sensiblen Daten
> Wenn du über einen öffentlichen CouchDB-Server synchronisierst, aktiviere die E2E-Verschlüsselung. So kann selbst der Server-Betreiber deine Notizinhalte nicht lesen.

---

## Konflikte

Wenn dieselbe Datei auf mehreren Instanzen gleichzeitig bearbeitet wird, können Konflikte entstehen.

### Konflikt-Erkennung

- Slatebase erkennt Konflikte beim Sync automatisch
- Konflikte werden in einer Liste angezeigt (Sync-Seite → "Konflikte")
- Benachrichtigung per Badge wenn neue Konflikte auftreten

### Konflikt-Auflösung

Der Konflikt-Wizard bietet:

1. **Übersicht:** Alle offenen Konflikte nach Kategorie sortiert
2. **Vergleich:** Diff-Ansicht (Side-by-Side oder Unified) der beiden Versionen
3. **Auflösung:** Wähle lokale Version, Remote-Version, oder erstelle manuell eine Zusammenführung

### Konflikt-Kategorien

| Kategorie | Bedeutung |
|-----------|-----------|
| Content-Konflikt | Beide Seiten haben die Datei inhaltlich geändert |
| Lokal gelöscht | Datei wurde lokal gelöscht, remote aber geändert |
| Remote gelöscht | Datei wurde remote gelöscht, lokal aber geändert |
| Umbenennung | Datei wurde auf einer Seite umbenannt |

---

## Sync-Modus

| Modus | Beschreibung |
|-------|--------------|
| Bidirektional | Änderungen in beide Richtungen synchronisieren (Standard) |
| Nur Push | Lokale Änderungen zum Server senden, aber nichts empfangen |
| Nur Pull | Änderungen vom Server empfangen, aber nichts senden |

---

## Sync-Status

Die Sync-Seite zeigt den aktuellen Status:

- **Verbunden** — Sync ist aktiv und funktioniert
- **Synchronisiere** — Gerade werden Änderungen übertragen
- **Fehler** — Verbindungsproblem (Details im Log)
- **Deaktiviert** — Sync ist konfiguriert aber nicht aktiv

### Sync-Log

Ein Protokoll aller Sync-Vorgänge (letzte 1000 Einträge):
- Zeitstempel, Richtung (Push/Pull), Anzahl Dateien, Fehler

---

## Praktisches Beispiel

Falls du eine CouchDB verfügbar hast, teste den Sync:

1. Öffne die Sync-Seite (Nutzermenü → "Sync")
2. Wähle "Manuell konfigurieren"
3. Gib die CouchDB-Verbindungsdaten ein
4. Klicke "Verbindung testen"
5. Aktiviere den Sync
6. Erstelle eine neue Datei im Vault
7. Prüfe in der CouchDB-Oberfläche, ob die Datei dort erscheint

Falls du keine CouchDB hast, kannst du die Sync-Seite trotzdem erkunden, um die Oberfläche kennenzulernen.

---

> [!warning] Backup vor Sync-Einrichtung
> Erstelle immer ein Backup (Export als ZIP) bevor du Sync zum ersten Mal aktivierst. Falls bei der initialen Synchronisation etwas schiefgeht, kannst du den Vault aus dem Backup wiederherstellen.

> [!tip] Obsidian LiveSync-Kompatibilität
> Slatebase-Sync nutzt dasselbe Protokoll wie Obsidian LiveSync. Du kannst denselben CouchDB-Server verwenden, um Notizen zwischen Slatebase und Obsidian synchron zu halten.

> [!todo] Übung
> 1. Öffne die Sync-Seite über das Nutzermenü oder die Command Palette
> 2. Erkunde die Oberfläche (Konfiguration, Status, Konflikte, Log)
> 3. Falls du eine CouchDB hast: Teste "Verbindung testen" mit deinen Zugangsdaten
> 4. Prüfe die Sync-Modi (Bidirektional, Push, Pull)

---

## Verwandte Features

- [[Features/Vault-Verwaltung]] — Vault-Besitz (Voraussetzung für Sync-Config)
- [[Features/Einstellungen]] — Feature-Toggle `vault-sync` (Admin)
- [[Fortgeschritten/Vault Sync einrichten]] — Detaillierter Setup-Guide mit Troubleshooting
- [[Features/Papierkorb und Versionen]] — Papierkorb/Versionen werden nicht gesynct
