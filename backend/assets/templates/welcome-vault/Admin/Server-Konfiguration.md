---
tags: [admin]
---

# Server-Konfiguration

Die Server-Konfiguration ermöglicht dir, globale Einstellungen deiner Slatebase-Instanz anzupassen. Hier steuerst du Verhalten, das alle Nutzer betrifft.

---

## Server-Konfiguration öffnen

| Methode | Beschreibung |
|---------|--------------|
| Einstellungen (`Ctrl+,`) | Administration → Server-Konfiguration |
| Command Palette (`Ctrl+P`) | "Server-Konfiguration" suchen |

---

## Konfigurationsebenen

Slatebase nutzt ein mehrstufiges Konfigurationssystem:

| Ebene | Priorität | Beschreibung |
|-------|-----------|--------------|
| Umgebungsvariablen | Höchste | `SLATEBASE_*` Env-Vars überschreiben alles |
| Konfigurations-UI | Mittel | Änderungen über die Admin-Oberfläche |
| Default-Werte | Niedrigste | Sinnvolle Voreinstellungen |

---

## Verfügbare Einstellungen

### Allgemein

| Einstellung | Beschreibung | Standard |
|-------------|--------------|----------|
| Server-Port | HTTP-Port | `3000` |
| Host | Bind-Adresse | `localhost` |
| Vault-Verzeichnis | Speicherort für Vaults | `./data/vaults` |

### Sicherheit

| Einstellung | Beschreibung | Standard |
|-------------|--------------|----------|
| Session-Dauer | Wie lange eine Session gültig ist | 24 Stunden |
| Rate-Limiting | Max. Login-Versuche pro Zeitfenster | 5 pro 15 Min |
| Trusted Proxies | IP-Bereiche vertrauenswürdiger Proxies | Keine |

### Papierkorb & Versionen

| Einstellung | Beschreibung | Standard |
|-------------|--------------|----------|
| Papierkorb-Aufbewahrung | Tage bis zur endgültigen Löschung | 30 Tage |
| Max. Versionen pro Datei | Anzahl gespeicherter Dateiversionen | 20 |
| Cleanup-Intervall | Wie oft der Cleanup-Job läuft | 24 Stunden |

---

## Server neustarten

In den Einstellungen unter "Administration" findest du die Option "Server neustarten":

1. Klicke auf "Server neustarten"
2. Bestätige die Aktion im Dialog
3. Der Server fährt herunter und startet neu
4. Alle aktiven Verbindungen werden kurz unterbrochen

### Wann ist ein Neustart nötig?

- Nach Änderungen an Umgebungsvariablen
- Bei Cold-Toggle-Änderungen (aktuell keine)
- Bei manuellen Dateisystem-Änderungen im Data-Verzeichnis
- Nach Server-Updates

> [!warning] Neustart-Auswirkungen
> Ein Server-Neustart unterbricht alle aktiven Verbindungen. Nutzer werden kurz getrennt und verbinden sich automatisch wieder. Offene SSE-Verbindungen bauen sich nach dem Neustart selbst wieder auf.

---

## Umgebungsvariablen

Wichtige Umgebungsvariablen für die Server-Konfiguration:

| Variable | Beschreibung |
|----------|--------------|
| `SLATEBASE_PORT` | Server-Port (Standard: 3000) |
| `SLATEBASE_HOST` | Bind-Adresse (Standard: localhost, Docker: 0.0.0.0) |
| `SLATEBASE_DATA_DIR` | Datenverzeichnis |
| `SLATEBASE_CSRF_SECRET` | CSRF-Token-Secret (min. 32 Zeichen) |
| `SLATEBASE_MODULE_SECRET_KEY` | Verschlüsselungs-Secret für Git-Sync- und Mail-Import-Zugangsdaten |
| `SLATEBASE_TRUSTED_PROXIES` | Kommaseparierte IP-Bereiche |
| `SLATEBASE_PROXY_ALLOWED_ORIGINS` | Erlaubte Domains für Plugin-Proxy |

> [!tip] .env-Datei
> Für lokale Entwicklung kannst du eine `.env`-Datei im Backend-Verzeichnis verwenden. Für Produktion empfehlen sich Docker-Secrets oder die Umgebungsvariablen deines Hosting-Providers.

---

## Docker-Deployment

Bei Docker-Deployments beachte:

- `SLATEBASE_HOST=0.0.0.0` setzen (damit der Container erreichbar ist)
- Volume-Mount auf `/app/data` für persistente Daten
- Trusted-Proxy-Subnet konfigurieren wenn hinter Reverse-Proxy
- Healthcheck: HTTP 401 auf `/api/v1/auth/session` = healthy

---

## Praktisches Beispiel

Prüfe und optimiere deine Server-Konfiguration:

1. Öffne Server-Konfiguration in den Einstellungen
2. Prüfe die aktuellen Werte
3. Passe ggf. die Papierkorb-Aufbewahrung an (z.B. 7 Tage für weniger Speicherverbrauch)
4. Prüfe, ob Trusted Proxies korrekt konfiguriert sind

---

> [!tip] Minimale Konfiguration
> Für die meisten Installationen reichen die Standardwerte. Ändere nur, was du bewusst anpassen möchtest. Die wichtigsten Einstellungen für Produktion sind: Host, Trusted Proxies und die Secret-Variablen.

> [!todo] Übung
> 1. Öffne die Server-Konfiguration
> 2. Prüfe die aktuellen Einstellungen
> 3. Notiere dir die konfigurierten Werte für Papierkorb und Versionen
> 4. Überlege, ob die Defaults für deinen Anwendungsfall passen

---

## Verwandte Features

- [[Admin/Feature-Toggles]] — Features ein-/ausschalten
- [[Admin/Audit-Log]] — Sicherheitsereignisse prüfen
- [[Features/Papierkorb und Versionen]] — Papierkorb aus Nutzersicht
- [[Features/Git-Sync]] — Vault mit einem Git-Remote synchronisieren
- [[Fortgeschritten/Plugins/LiveSync]] — Sync über CouchDB via Obsidian-LiveSync-Plugin
