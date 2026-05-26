# Slatebase — Docker Deployment

## Voraussetzungen

- Docker Engine ≥ 24
- Docker Compose ≥ 2.20

## Schnellstart

```bash
# 1. Environment-Datei erstellen
cp docker.env.example docker.env

# 2. CSRF-Secret generieren und in docker.env eintragen
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. SLATEBASE_ALLOWED_ORIGINS in docker.env auf deine Domain setzen
#    z.B. https://slatebase.example.com

# 4. Container bauen und starten
docker compose up -d --build

# 5. Logs prüfen
docker compose logs -f
```

Slatebase ist danach unter `http://<server-ip>:8080` erreichbar.

## Architektur

```
┌─────────────────────────────────────────────┐
│  Docker Host                                │
│                                             │
│  ┌─────────────┐      ┌─────────────────┐  │
│  │  frontend   │      │    backend      │  │
│  │  (nginx)    │─────▶│  (Node.js 22)   │  │
│  │  :80        │ /api │  :3000          │  │
│  └──────┬──────┘      └────────┬────────┘  │
│         │                      │            │
│         │ :8080                │            │
│         ▼                      ▼            │
│    Host Port            slatebase-data      │
│                         (Docker Volume)     │
└─────────────────────────────────────────────┘
```

- **frontend**: Nginx serviert das React-SPA und proxied `/api/` zum Backend
- **backend**: Node.js 22 mit nativem TypeScript-Stripping, lauscht auf Port 3000
- **slatebase-data**: Persistentes Docker-Volume für Vault-Daten, User, Sessions, Audit-Logs

## Konfiguration

Alle Einstellungen werden über `docker.env` gesteuert:

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| `SLATEBASE_PORT` | `3000` | Interner Backend-Port (nicht ändern) |
| `SLATEBASE_HOST` | `0.0.0.0` | Backend bindet auf alle Interfaces |
| `SLATEBASE_LOG_LEVEL` | `info` | Log-Level: debug, info, warn, error |
| `SLATEBASE_ALLOWED_ORIGINS` | `http://localhost:8080` | CORS-Origins (kommasepariert) |
| `SLATEBASE_CSRF_SECRET` | (random) | Persistentes CSRF-Secret |
| `SLATEBASE_MAX_FILE_SIZE` | `5242880` | Max. Dateigröße in Bytes (5 MB) |
| `SLATEBASE_EXTERNAL_PORT` | `8080` | Externer Port auf dem Host |

## Wichtig: CSRF-Secret

Ohne ein persistiertes `SLATEBASE_CSRF_SECRET` wird bei jedem Container-Neustart ein neues Secret generiert. Das invalidiert alle bestehenden Sessions. Generiere ein Secret und trage es in `docker.env` ein:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Daten-Persistenz

Alle Daten liegen im Docker-Volume `slatebase-data`:

- `vaults/` — Vault-Dateien
- `vaults.json` — Vault-Registry
- `users/` — Benutzerkonten
- `sessions/` — Aktive Sessions
- `shares.json` — Vault-Freigaben
- `audit/` — Audit-Logs

### Backup

```bash
# Volume-Inhalt sichern
docker run --rm -v slatebase_slatebase-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/slatebase-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore

```bash
# Volume-Inhalt wiederherstellen
docker compose down
docker run --rm -v slatebase_slatebase-data:/data -v $(pwd):/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/slatebase-backup-YYYYMMDD.tar.gz -C /data"
docker compose up -d
```

## Update

```bash
# Neuen Code pullen
git pull

# Container neu bauen und starten (Daten bleiben erhalten)
docker compose up -d --build
```

## Reverse Proxy (optional)

Wenn du Slatebase hinter einem externen Reverse Proxy (Traefik, Caddy, nginx) betreibst:

1. `SLATEBASE_EXTERNAL_PORT` auf einen internen Port setzen (z.B. `3080`)
2. `SLATEBASE_ALLOWED_ORIGINS` auf die öffentliche URL setzen
3. Im externen Proxy: HTTPS terminieren und an `localhost:3080` weiterleiten

### Beispiel: Caddy

```
slatebase.example.com {
    reverse_proxy localhost:3080
}
```

### Beispiel: Traefik (docker-compose Labels)

```yaml
services:
  frontend:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.slatebase.rule=Host(`slatebase.example.com`)"
      - "traefik.http.routers.slatebase.tls.certresolver=letsencrypt"
      - "traefik.http.services.slatebase.loadbalancer.server.port=80"
```

## Troubleshooting

### Container startet nicht

```bash
docker compose logs backend
```

Häufige Ursachen:
- `argon2` Build schlägt fehl → Image muss auf `node:22-slim` basieren (Build-Tools sind im Dockerfile enthalten)
- Port bereits belegt → `SLATEBASE_EXTERNAL_PORT` ändern

### Sessions werden nach Neustart ungültig

→ `SLATEBASE_CSRF_SECRET` in `docker.env` setzen (siehe oben)

### 502 Bad Gateway

→ Backend ist noch nicht bereit. Healthcheck prüft automatisch — nach ~10s sollte es funktionieren.

### Dateien hochladen schlägt fehl (413)

→ Nginx `client_max_body_size` ist auf 512 MB gesetzt. Falls das nicht reicht, in `frontend/nginx.conf` anpassen.
