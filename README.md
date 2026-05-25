# Slatebase

Ein selbst-gehosteter Knowledge-Context-Server für Markdown-Vaults. Slatebase ermöglicht das Verwalten, Durchsuchen und Anzeigen von Markdown-basierten Wissenssammlungen über eine Web-Oberfläche — kompatibel mit Obsidian-Vaults.

## Features

- **Multi-Vault-Verwaltung** — Erstellen, Löschen und Auflisten von Vaults
- **Datei-Explorer** — Verzeichnisbaum-Navigation mit Ordnerstruktur
- **Markdown-Viewer** — Darstellung von Markdown-Inhalten mit Syntax-Highlighting
- **Tabs** — Mehrere Dateien gleichzeitig geöffnet halten
- **Import** — Dateien und Ordner in Vaults importieren
- **Inhalte löschen** — Dateien und Ordner innerhalb von Vaults entfernen

## Tech Stack

### Backend

- Node.js ≥ 22 (native TypeScript via `--experimental-strip-types`)
- [Hono](https://hono.dev/) — HTTP-Framework
- [Zod](https://zod.dev/) — Schema-Validierung
- [Pino](https://getpino.io/) — Strukturiertes Logging

### Frontend

- React 19 + TypeScript
- [Vite](https://vite.dev/) — Build-Tool & Dev-Server
- Vitest + Testing Library — Unit-Tests
- Playwright — End-to-End-Tests

## Voraussetzungen

- Node.js ≥ 22
- npm

## Installation

```bash
# Repository klonen
git clone https://github.com/<user>/slatebase.git
cd slatebase

# Backend installieren
cd backend
npm install
cp .env.example .env

# Frontend installieren
cd ../frontend
npm install
```

## Konfiguration

Die Backend-Konfiguration erfolgt über `backend/config/default.json` und kann durch Umgebungsvariablen in `backend/.env` überschrieben werden:

| Variable | Beschreibung | Standard |
|----------|-------------|----------|
| `SLATEBASE_PORT` | Server-Port | `3000` |
| `SLATEBASE_HOST` | Host-Adresse | `127.0.0.1` |
| `SLATEBASE_LOG_LEVEL` | Log-Level (debug/info/warn/error) | `info` |
| `SLATEBASE_MAX_FILE_SIZE` | Max. Dateigröße in Bytes | `5242880` (5 MB) |
| `SLATEBASE_ALLOWED_ORIGINS` | Erlaubte CORS-Origins | `http://localhost:5173` |

## Entwicklung

```bash
# Backend starten (Hot Reload)
cd backend
npm run dev

# Frontend starten (Vite Dev-Server auf Port 5173)
cd frontend
npm run dev
```

Das Frontend proxied `/api`-Anfragen automatisch an `http://localhost:3000`.

## Tests

```bash
# Backend-Tests
cd backend
npm test

# Frontend Unit-Tests
cd frontend
npm test

# Frontend E2E-Tests (Backend muss laufen)
cd frontend
npm run test:e2e
```

## Produktion

```bash
# Backend
cd backend
npm start

# Frontend Build
cd frontend
npm run build
# Statische Dateien aus dist/ ausliefern
```

## API

Alle Routen unter `/api/v1`:

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| GET | `/vaults` | Alle Vaults auflisten |
| POST | `/vaults` | Neuen Vault erstellen |
| DELETE | `/vaults/:vaultId` | Vault löschen |
| GET | `/vaults/:vaultId/tree` | Verzeichnisbaum abrufen |
| GET | `/vaults/:vaultId/files?path=` | Dateiinhalt abrufen |
| POST | `/vaults/:vaultId/import/file` | Einzelne Datei importieren |
| POST | `/vaults/:vaultId/import/folder` | Ordner importieren |
| DELETE | `/vaults/:vaultId/content?path=` | Datei/Ordner löschen |

## Projektstruktur

```
backend/          — Node.js REST API Server
frontend/         — React SPA (Vite)
```

Vaults werden als Dateien unter `backend/data/vaults/<id>/` gespeichert. Keine Datenbank — alles filesystem-basiert.

## Geplante Features

- Obsidian-kompatibles Markdown-Rendering (Wikilinks, Embeds, Frontmatter)
- Inline Markdown-Editor mit Live-Vorschau
- Wissensgraph-Visualisierung
- AI Context Server mit MCP-Integration
- Vault-Synchronisation (LiveSync/CouchDB-kompatibel)
- Authentifizierung & Autorisierung
- Internationalisierung (DE/EN)

## Lizenz

MIT
