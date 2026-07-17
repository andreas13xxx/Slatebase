---
tags: [fortgeschritten]
---

# Vault Sync einrichten

Mit der Vault-Synchronisation kannst du deine Notizen bidirektional mit einer CouchDB-Instanz synchronisieren. So hast du auf mehreren Geräten oder Slatebase-Installationen Zugriff auf dieselben Inhalte.

> [!warning] Experimentelles Feature
> Vault Sync ist experimentell. Es kann zu Konflikten oder Datenverlust kommen. Erstelle vor der Einrichtung ein Backup (Export als ZIP). API und Verhalten können sich ändern.

---

## Voraussetzungen

- Laufende **CouchDB 3.x** Instanz
- Netzwerkzugriff von Slatebase zur CouchDB
- Du bist **Vault-Besitzer** (nur Besitzer konfigurieren Sync)
- Feature-Toggle `vault-sync` ist aktiviert

---

## CouchDB installieren

### Docker (empfohlen)

```bash
docker run -d \
  --name slatebase-couchdb \
  -p 5984:5984 \
  -e COUCHDB_USER=admin \
  -e COUCHDB_PASSWORD=sicheres-passwort \
  couchdb:3
```

Initialisierung:

```bash
curl -X PUT http://admin:sicheres-passwort@localhost:5984/_users
curl -X PUT http://admin:sicheres-passwort@localhost:5984/_replicator
curl -X PUT http://admin:sicheres-passwort@localhost:5984/_global_changes
```

### Native Installation

- **Linux:** APT/YUM Repository oder Snap
- **macOS:** `brew install couchdb`
- **Windows:** Installer von couchdb.apache.org

Nach Installation: Fauxton-UI unter `http://localhost:5984/_utils` öffnen.

---

## Datenbank anlegen

```bash
curl -X PUT http://admin:passwort@localhost:5984/mein-vault
```

---

## Sync konfigurieren

### Per Setup-URI (empfohlen)

```
obsidian://setuplivesync?host=http://localhost:5984&db=mein-vault&user=admin&pass=passwort
```

1. Einstellungen → Vault → Sync
2. "Setup-URI verwenden" wählen
3. URI einfügen → "Verbindung testen" → "Speichern"

### Manuelle Konfiguration

1. Einstellungen → Vault → Sync → "Manuell konfigurieren"
2. Server-URL, Datenbank, Benutzer, Passwort eingeben
3. "Verbindung testen" → "Speichern"

---

## Troubleshooting

### CORS-Fehler

CouchDB muss CORS aktiviert haben bei unterschiedlichen Hosts/Ports:

```bash
curl -X PUT http://admin:pw@localhost:5984/_node/_local/_config/httpd/enable_cors -d '"true"'
curl -X PUT http://admin:pw@localhost:5984/_node/_local/_config/cors/origins -d '"*"'
curl -X PUT http://admin:pw@localhost:5984/_node/_local/_config/cors/methods -d '"GET, PUT, POST, HEAD, DELETE"'
curl -X PUT http://admin:pw@localhost:5984/_node/_local/_config/cors/credentials -d '"true"'
```

### Authentifizierungsfehler

- Benutzername/Passwort prüfen
- User muss Zugriff auf die Datenbank haben
- Test: `curl http://user:pass@host:5984/datenbank` → JSON mit `db_name`

### Netzwerk-Probleme

- CouchDB erreichbar? `curl http://host:5984/` → Willkommen-JSON
- Port 5984 in Firewall offen?
- Docker: Port-Mapping prüfen
- Remote: HTTPS über Reverse-Proxy empfohlen

---

## Konflikte behandeln

Bei gleichzeitigen Änderungen entstehen Konflikte:

| Typ | Beschreibung |
|-----|--------------|
| Inhaltskonflikt | Gleiche Datei beidseitig geändert |
| Lokal gelöscht | Lokal gelöscht, remote geändert |
| Remote gelöscht | Remote gelöscht, lokal geändert |
| Umbenennung | Beidseitig umbenannt |

### Konflikte auflösen

1. Sync-Status → "Konflikte anzeigen" → **Conflict Wizard**
2. Diff zwischen lokaler und Remote-Version ansehen
3. Strategie wählen: Remote gewinnt / Lokal gewinnt / Manuell mergen

> [!tip] Konflikte vermeiden
> Synchronisiere häufig und bearbeite Dateien nicht gleichzeitig auf mehreren Geräten. Bei Teamarbeit helfen klare Zuständigkeiten pro Datei.

---

## Sicherheit

- Credentials werden **AES-256-GCM verschlüsselt** gespeichert
- Passwort in API-Responses immer maskiert
- Optional: Ende-zu-Ende-Verschlüsselung aktivieren
- Empfehlung: HTTPS für CouchDB-Verbindung

---

## Verwandte Features

- [[Features/Sync]] — Grundlagen der Sync-Funktion
- [[Features/Vault-Verwaltung]] — Vault-Export als Backup
- [[Features/Papierkorb und Versionen]] — Versionshistorie als Sicherheitsnetz
