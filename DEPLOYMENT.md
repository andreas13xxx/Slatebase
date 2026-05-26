# Slatebase — Docker Deployment

## Prerequisites

- Docker Engine ≥ 24
- Docker Compose ≥ 2.20

## Quick Start

```bash
# 1. Create environment file
cp docker.env.example docker.env

# 2. Generate a CSRF secret and add it to docker.env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Set SLATEBASE_ALLOWED_ORIGINS in docker.env to your domain
#    e.g. https://slatebase.example.com

# 4. Build and start containers
docker compose up -d --build

# 5. Check logs
docker compose logs -f
```

Slatebase will be available at `http://<server-ip>:8080`.

## Architecture

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

- **frontend**: Nginx serves the React SPA and proxies `/api/` to the backend
- **backend**: Node.js 22 with native TypeScript stripping, listens on port 3000
- **slatebase-data**: Persistent Docker volume for vault data, users, sessions, and audit logs

## Configuration

All settings are controlled via `docker.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `SLATEBASE_PORT` | `3000` | Internal backend port (do not change) |
| `SLATEBASE_HOST` | `0.0.0.0` | Backend binds to all interfaces |
| `SLATEBASE_LOG_LEVEL` | `info` | Log level: debug, info, warn, error |
| `SLATEBASE_ALLOWED_ORIGINS` | `http://localhost:8080` | CORS origins (comma-separated) |
| `SLATEBASE_CSRF_SECRET` | (random) | Persistent CSRF secret |
| `SLATEBASE_MAX_FILE_SIZE` | `5242880` | Max file size in bytes (5 MB) |
| `SLATEBASE_EXTERNAL_PORT` | `8080` | External port on the host |

## Important: CSRF Secret

Without a persisted `SLATEBASE_CSRF_SECRET`, a new secret is generated on every container restart. This invalidates all existing sessions. Generate a secret and add it to `docker.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Data Persistence

All data resides in the Docker volume `slatebase-data`:

- `vaults/` — Vault files
- `vaults.json` — Vault registry
- `users/` — User accounts
- `sessions/` — Active sessions
- `shares.json` — Vault shares
- `audit/` — Audit logs

### Backup

```bash
# Back up volume contents
docker run --rm -v slatebase_slatebase-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/slatebase-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore

```bash
# Restore volume contents
docker compose down
docker run --rm -v slatebase_slatebase-data:/data -v $(pwd):/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/slatebase-backup-YYYYMMDD.tar.gz -C /data"
docker compose up -d
```

## Update

```bash
# Pull latest code
git pull

# Rebuild and restart containers (data is preserved)
docker compose up -d --build
```

## Reverse Proxy (optional)

If you run Slatebase behind an external reverse proxy (Traefik, Caddy, nginx):

1. Set `SLATEBASE_EXTERNAL_PORT` to an internal port (e.g. `3080`)
2. Set `SLATEBASE_ALLOWED_ORIGINS` to the public URL
3. In the external proxy: terminate HTTPS and forward to `localhost:3080`

### Example: Caddy

```
slatebase.example.com {
    reverse_proxy localhost:3080
}
```

### Example: Traefik (docker-compose labels)

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

### Container fails to start

```bash
docker compose logs backend
```

Common causes:
- `argon2` build fails → image must be based on `node:22-slim` (build tools are included in the Dockerfile)
- Port already in use → change `SLATEBASE_EXTERNAL_PORT`

### Sessions invalidated after restart

→ Set `SLATEBASE_CSRF_SECRET` in `docker.env` (see above)

### 502 Bad Gateway

→ Backend is not ready yet. The healthcheck verifies automatically — it should work after ~10s.

### File upload fails (413)

→ Nginx `client_max_body_size` is set to 512 MB. If that's not enough, adjust it in `frontend/nginx.conf`.
