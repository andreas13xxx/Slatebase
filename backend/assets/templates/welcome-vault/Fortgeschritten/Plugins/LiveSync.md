---
tags: [fortgeschritten, plugins]
---

# LiveSync Plugin

Self-hosted LiveSync ermöglicht bidirektionale Echtzeit-Synchronisation deines Vaults über eine CouchDB-Datenbank. Änderungen werden sofort zwischen Geräten synchronisiert — ohne Cloud-Dienste.

> [!warning] Experimentell
> LiveSync ist ein komplexes Plugin mit tiefgreifender Systemintegration. Erstelle vor der Einrichtung ein Backup deines Vaults (Export als ZIP).

---

## Voraussetzungen

- Feature-Toggle `obsidian-plugin-compat` aktiviert
- Zugang zu einer CouchDB-Instanz (selbst gehostet oder extern)
- CouchDB mit CORS aktiviert oder Slatebase-Proxy konfiguriert
- Plugin-ZIP von GitHub: `obsidian-livesync`

---

## Installation

1. Plugin-ZIP von GitHub herunterladen (Release-Seite)
2. Einstellungen → Vault → Plugins → "Plugin installieren"
3. ZIP hochladen → Aktivieren
4. Plugin zeigt Initial-Setup-Dialog

---

## Einrichtung

### Option A: Setup-URI (empfohlen)

Falls du bereits eine LiveSync-Konfiguration hast (z.B. von einem anderen Gerät):

1. Öffne Plugin-Einstellungen
2. Füge den Setup-URI ein
3. LiveSync konfiguriert sich automatisch

### Option B: Manuelle Konfiguration

1. Öffne die Plugin-Einstellungen nach Aktivierung
2. Konfiguriere die Verbindung:

| Feld | Beispiel |
|------|----------|
| Server-URL | `https://couchdb.example.com` |
| Datenbank | `slatebase-vault` |
| Benutzername | `sync_user` |
| Passwort | `sicheres_passwort` |

3. Klicke "Verbindung testen"
4. Bei Erfolg: "Setup abschließen"

---

## Sync-Modi

| Modus | Beschreibung | Empfehlung |
|-------|--------------|-----------|
| LiveSync | Echtzeit, jede Änderung sofort | Für aktives Arbeiten auf einem Gerät |
| Periodic | Alle X Sekunden | Für Hintergrund-Sync |
| OneShot | Nur bei manuellem Trigger | Für kontrollierte Synchronisation |

> [!tip] OneShot für den Start
> Beginne mit OneShot-Sync, um die Einrichtung zu validieren. Wechsle zu Periodic oder LiveSync erst, wenn alles stabil läuft.

---

## Konfliktbehandlung

Bei gleichzeitiger Bearbeitung auf mehreren Geräten können Konflikte entstehen:

### Automatische Auflösung

LiveSync löst einfache Konflikte automatisch (neueste Version gewinnt).

### Manuelle Auflösung

Bei komplexen Konflikten:
1. LiveSync zeigt eine Benachrichtigung
2. Öffne die Konflikt-Ansicht (Plugin-Einstellungen → Konflikte)
3. Wähle für jeden Konflikt: Remote, Lokal oder Merge

---

## Beispiel-Setup: Zwei-Geräte-Sync

### Szenario

Du nutzt Slatebase auf deinem Arbeitsrechner und möchtest abends auf dem Laptop weiterarbeiten.

### Schritt 1: CouchDB einrichten

```
# Docker-Compose (Beispiel)
services:
  couchdb:
    image: couchdb:3
    environment:
      COUCHDB_USER: admin
      COUCHDB_PASSWORD: sicheres_passwort
    ports:
      - "5984:5984"
    volumes:
      - couchdb_data:/opt/couchdb/data
```

### Schritt 2: Datenbank erstellen

Erstelle über die CouchDB-Admin-UI (`http://localhost:5984/_utils`) eine neue Datenbank:
- Name: `slatebase-mein-vault`
- Partitioned: Nein

### Schritt 3: LiveSync auf Gerät 1 konfigurieren

1. Plugin installieren + aktivieren
2. Server-URL: `http://dein-server:5984`
3. Datenbank: `slatebase-mein-vault`
4. Credentials eingeben
5. Erster Sync: Alle Dateien werden hochgeladen

### Schritt 4: LiveSync auf Gerät 2 konfigurieren

1. Gleiche Konfiguration wie Gerät 1
2. Erster Sync: Alle Dateien werden heruntergeladen
3. Ab jetzt: Bidirektionale Synchronisation

---

## Slatebase-spezifische Hinweise

### CORS-Proxy

Slatebase routet Cross-Origin-Requests automatisch über den Backend-Proxy (`/api/v1/proxy`). Das bedeutet:

- Du brauchst kein CORS auf der CouchDB zu konfigurieren
- Die Proxy-Allowlist muss die CouchDB-Domain enthalten (`SLATEBASE_PROXY_ALLOWED_ORIGINS`)
- Timeout: 30 Sekunden (für OneShot ausreichend)

### Bekannte Einschränkungen

| Thema | Status |
|-------|--------|
| Text-Dateien sync | Funktioniert |
| Binärdateien (Bilder, PDFs) | Funktioniert |
| End-to-End-Verschlüsselung | Unterstützt |
| LiveSync-Modus (Long-Poll) | Timeout-begrenzt (30s) |
| Periodic/OneShot | Empfohlen |
| Plugin-Einstellungen | Funktioniert |

### Empfohlene Einstellungen

- **Sync-Modus:** Periodic (alle 60 Sekunden) oder OneShot
- **"Use timeouts instead of heartbeats":** Aktivieren
- **Batch-Größe:** Standard belassen

---

## Fehlerbehebung

| Problem | Lösung |
|---------|--------|
| "Connection refused" | CouchDB-URL und Port prüfen |
| "Unauthorized" | Credentials prüfen |
| "Plugin initialisation was cancelled" | Normal bei Ersteinrichtung — Setup-URI eingeben |
| Sync stoppt nach 30s | Auf Periodic/OneShot wechseln |
| Binärdateien fehlen | "Rebuild" in Plugin-Settings auslösen |

---

> [!tip] Backup zuerst
> Exportiere deinen Vault als ZIP bevor du LiveSync einrichtest. Falls etwas schiefgeht, kannst du jederzeit zum Backup zurückkehren.

> [!todo] Übung
> 1. Installiere das LiveSync-Plugin
> 2. Öffne die Plugin-Einstellungen
> 3. Prüfe die verfügbaren Konfigurationsoptionen
> 4. (Optional, wenn CouchDB vorhanden) Konfiguriere eine Verbindung
> 5. Teste mit OneShot-Sync: Eine Datei ändern → Sync auslösen → auf zweitem Gerät prüfen

---

## Verwandte Features

- [[Fortgeschritten/Vault Sync einrichten]] — Slatebase-eigene Sync-Funktion
- [[Features/Sync]] — Sync aus Nutzersicht
- [[Fortgeschritten/Obsidian Plugins]] — Plugin-Grundlagen
- [[Admin/Feature-Toggles]] — Plugin-Feature aktivieren
